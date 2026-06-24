//! `DataSource` backed by the Starkscan REST API (pre-indexed; fast). Needs an API key (read from
//! `STARKSCAN_API_KEY` — never hardcode/commit it). Chain is a path segment (`SN_MAIN`/`SN_SEPOLIA`),
//! so one host+key serves both networks — *where Starkscan indexes them* (mainnet today; the
//! Sepolia index is empty as of 2026-06-17).
//!
//! Endpoint: `GET {base}/v1/{chain}/contract/{address}/events?topic0=<sel>&topic2=<to>&limit=100`,
//! paginated via `nextCursor` → `&cursor=`. Auth header: `X-Starkscan-Api-Key`.
//! Ownership is still confirmed via `owner_of` over the RPC reader.

use async_trait::async_trait;
use serde_json::Value;

use crate::config::GolAddresses;
use crate::datasource::{confirm_owned, dedupe, DataSource, MoveEvent};
use crate::encoding::selector;
use crate::error::GolError;
use crate::rpc::RpcReader;
use crate::types::{felt_hex, felt_to_u128, Felt, OwnedLifeform, U256};

const DEFAULT_BASE_URL: &str = "https://starkscan.co/api";

pub struct IndexerDataSource {
    base_url: String,
    chain: String,
    api_key: String,
    addresses: GolAddresses,
    reader: RpcReader,
    http: reqwest::Client,
}

struct StarkscanEvent {
    topics: [Option<Felt>; 4],
    data: Vec<Felt>,
    block_number: u64,
    tx_hash: Felt,
}

impl IndexerDataSource {
    /// Explicit construction. `chain` is e.g. `"SN_MAIN"` / `"SN_SEPOLIA"`.
    pub fn new(
        base_url: impl Into<String>,
        chain: impl Into<String>,
        api_key: impl Into<String>,
        rpc_url: impl Into<String>,
        addresses: GolAddresses,
    ) -> Self {
        Self {
            base_url: base_url.into(),
            chain: chain.into(),
            api_key: api_key.into(),
            reader: RpcReader::new(rpc_url, addresses.clone()),
            addresses,
            http: reqwest::Client::new(),
        }
    }

    /// Read the key from `STARKSCAN_API_KEY` (and base from `STARKSCAN_BASE_URL`, default
    /// `https://starkscan.co/api`). The key is never read from source or committed.
    pub fn from_env(
        chain: impl Into<String>,
        rpc_url: impl Into<String>,
        addresses: GolAddresses,
    ) -> Result<Self, GolError> {
        let api_key = std::env::var("STARKSCAN_API_KEY")
            .map_err(|_| GolError::Config("STARKSCAN_API_KEY not set".into()))?;
        let base = std::env::var("STARKSCAN_BASE_URL").unwrap_or_else(|_| DEFAULT_BASE_URL.to_string());
        Ok(Self::new(base, chain, api_key, rpc_url, addresses))
    }

    /// Page through `/contract/{address}/events`, following `nextCursor`.
    async fn fetch_events(
        &self,
        contract: Felt,
        topic0: Felt,
        topic2: Option<Felt>,
    ) -> Result<Vec<StarkscanEvent>, GolError> {
        let mut out = Vec::new();
        let mut cursor: Option<String> = None;
        loop {
            let mut url = format!(
                "{}/v1/{}/contract/{}/events?topic0={}&limit=100",
                self.base_url,
                self.chain,
                felt_hex(&contract),
                felt_hex(&topic0),
            );
            if let Some(t2) = topic2 {
                url.push_str(&format!("&topic2={}", felt_hex(&t2)));
            }
            if let Some(c) = &cursor {
                url.push_str(&format!("&cursor={c}"));
            }

            let resp: Value = self
                .http
                .get(&url)
                .header("X-Starkscan-Api-Key", &self.api_key)
                .send()
                .await
                .map_err(|e| GolError::Read(e.to_string()))?
                .json()
                .await
                .map_err(|e| GolError::Read(e.to_string()))?;

            let items = resp
                .get("items")
                .and_then(Value::as_array)
                .ok_or_else(|| GolError::Read(format!("starkscan: unexpected response: {resp}")))?;
            for item in items {
                out.push(parse_starkscan_event(item)?);
            }
            cursor = resp.get("nextCursor").and_then(Value::as_str).map(String::from);
            if cursor.is_none() {
                break;
            }
        }
        Ok(out)
    }
}

#[async_trait(?Send)]
impl DataSource for IndexerDataSource {
    async fn owned_lifeforms(&self, owner: Felt) -> Result<Vec<OwnedLifeform>, GolError> {
        // Transfers INTO `owner`: topic0=Transfer, topic2=to.
        let events = self
            .fetch_events(self.addresses.lifeforms, selector("Transfer"), Some(owner))
            .await?;
        // ERC721 Transfer keys → topics: [sel, from, to, token_id.low]; token_id.high spills to data[0].
        // NOTE: the low/high split here is unverified against a real ERC721 Transfer on a Starkscan-
        // indexed chain (Sepolia is unindexed). For GoL token ids high==0, so this is robust in
        // practice; revisit when GoL is on mainnet. `owner_of` confirmation guards correctness.
        let candidates = dedupe(events.iter().filter_map(|ev| {
            ev.topics[3].map(|low| {
                let high = ev.data.first().copied().unwrap_or(Felt::ZERO);
                U256::from_felts(&low, &high)
            })
        }));
        confirm_owned(&self.reader, owner, candidates).await
    }

    async fn lifeform(&self, token_id: U256) -> Result<Option<OwnedLifeform>, GolError> {
        use crate::reader::Reader;
        self.reader.lifeform(token_id).await
    }

    async fn activity(&self, token_id: Option<U256>, limit: u32) -> Result<Vec<MoveEvent>, GolError> {
        // NewMove keys=[selector]; fields live in data = [token_id.low, token_id.high, age].
        let events = self
            .fetch_events(self.addresses.lifeforms, selector("NewMove"), None)
            .await?;
        let mut out: Vec<MoveEvent> = events
            .iter()
            .filter_map(|ev| {
                if ev.data.len() < 3 {
                    return None;
                }
                let tid = U256::from_felts(&ev.data[0], &ev.data[1]);
                if let Some(filter) = token_id {
                    if filter != tid {
                        return None;
                    }
                }
                Some(MoveEvent {
                    token_id: tid,
                    age: felt_to_u128(&ev.data[2]) as u32,
                    block_number: ev.block_number,
                    tx_hash: ev.tx_hash,
                })
            })
            .collect();
        if limit > 0 {
            out.truncate(limit as usize);
        }
        Ok(out)
    }
}

fn parse_topic(item: &Value, key: &str) -> Result<Option<Felt>, GolError> {
    match item.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => Ok(Some(
            Felt::from_hex(s).map_err(|e| GolError::Encoding(e.to_string()))?,
        )),
        Some(other) => Err(GolError::Encoding(format!("topic {key}: unexpected {other}"))),
    }
}

fn parse_starkscan_event(item: &Value) -> Result<StarkscanEvent, GolError> {
    let data = item
        .get("data")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .map(|v| {
                    let s = v
                        .as_str()
                        .ok_or_else(|| GolError::Encoding("non-string felt in data".into()))?;
                    Felt::from_hex(s).map_err(|e| GolError::Encoding(e.to_string()))
                })
                .collect::<Result<Vec<_>, _>>()
        })
        .transpose()?
        .unwrap_or_default();
    let block_number = item.get("blockNumber").and_then(Value::as_u64).unwrap_or_default();
    let tx_hash = match item.get("txHash").and_then(Value::as_str) {
        Some(s) => Felt::from_hex(s).map_err(|e| GolError::Encoding(e.to_string()))?,
        None => Felt::ZERO,
    };
    Ok(StarkscanEvent {
        topics: [
            parse_topic(item, "topic0")?,
            parse_topic(item, "topic1")?,
            parse_topic(item, "topic2")?,
            parse_topic(item, "topic3")?,
        ],
        data,
        block_number,
        tx_hash,
    })
}
