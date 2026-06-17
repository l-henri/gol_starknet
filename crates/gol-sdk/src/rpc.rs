//! JSON-RPC–backed [`Reader`]: `starknet_call` over HTTP, decoding flat felt results into the
//! domain types. Works on native (reqwest/native-tls) and under wasm32 (reqwest's fetch backend).

use async_trait::async_trait;
use serde_json::{json, Value};

use crate::config::{ContractKey, GolAddresses};
use crate::encoding::selector;
use crate::error::GolError;
use crate::reader::Reader;
use crate::types::{felt_hex, felt_to_bool, felt_to_u128, Felt, LifeformData, LoopCheck, OwnedLifeform, TokenUri, U256};

/// JSON-RPC `CONTRACT_ERROR` — a call that reverted (e.g. `owner_of` on an unminted token).
const CONTRACT_ERROR: i64 = 40;

pub struct RpcReader {
    rpc_url: String,
    addresses: GolAddresses,
    http: reqwest::Client,
}

impl RpcReader {
    pub fn new(rpc_url: impl Into<String>, addresses: GolAddresses) -> Self {
        Self {
            rpc_url: rpc_url.into(),
            addresses,
            http: reqwest::Client::new(),
        }
    }

    fn addr(&self, key: ContractKey) -> Result<Felt, GolError> {
        self.addresses.get(key)
    }

    /// One `starknet_call`. Returns `Ok(None)` when the call reverted *and* `allow_revert`,
    /// otherwise `Ok(Some(felts))` or an error.
    async fn call_inner(
        &self,
        to: Felt,
        sel: Felt,
        calldata: &[Felt],
        allow_revert: bool,
    ) -> Result<Option<Vec<Felt>>, GolError> {
        let request = json!({
            "contract_address": felt_hex(&to),
            "entry_point_selector": felt_hex(&sel),
            "calldata": calldata.iter().map(felt_hex).collect::<Vec<_>>(),
        });
        let body = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "starknet_call",
            "params": [request, "latest"],
        });

        let resp: Value = self
            .http
            .post(&self.rpc_url)
            .json(&body)
            .send()
            .await
            .map_err(|e| GolError::Read(e.to_string()))?
            .json()
            .await
            .map_err(|e| GolError::Read(e.to_string()))?;

        if let Some(err) = resp.get("error") {
            let code = err.get("code").and_then(Value::as_i64).unwrap_or_default();
            if allow_revert && code == CONTRACT_ERROR {
                return Ok(None);
            }
            return Err(GolError::Read(format!("rpc error: {err}")));
        }

        let arr = resp
            .get("result")
            .and_then(Value::as_array)
            .ok_or_else(|| GolError::Read("missing result array".into()))?;
        let felts = arr
            .iter()
            .map(|v| {
                let s = v
                    .as_str()
                    .ok_or_else(|| GolError::Encoding("non-string felt in result".into()))?;
                Felt::from_hex(s).map_err(|e| GolError::Encoding(e.to_string()))
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Some(felts))
    }

    async fn call_raw(&self, to: Felt, sel: Felt, calldata: &[Felt]) -> Result<Vec<Felt>, GolError> {
        Ok(self
            .call_inner(to, sel, calldata, false)
            .await?
            .expect("non-revert path always returns Some"))
    }

    /// Raw `starknet_getEvents` page. Returns parsed events + the continuation token (`None` when
    /// the scan is exhausted). `keys` is the positional key filter, e.g. `[[selector], [], [to]]`
    /// (an empty inner vec is a wildcard for that key position).
    pub async fn get_events(
        &self,
        address: Felt,
        keys: Vec<Vec<Felt>>,
        from_block: u64,
        chunk_size: u64,
        continuation: Option<String>,
    ) -> Result<(Vec<RawEvent>, Option<String>), GolError> {
        let keys_json: Vec<Vec<String>> = keys
            .iter()
            .map(|inner| inner.iter().map(felt_hex).collect())
            .collect();
        let mut filter = json!({
            "address": felt_hex(&address),
            "keys": keys_json,
            "from_block": { "block_number": from_block },
            "to_block": "latest",
            "chunk_size": chunk_size,
        });
        if let Some(token) = continuation {
            filter["continuation_token"] = Value::String(token);
        }
        let body = json!({ "jsonrpc": "2.0", "id": 1, "method": "starknet_getEvents", "params": [filter] });

        let resp: Value = self
            .http
            .post(&self.rpc_url)
            .json(&body)
            .send()
            .await
            .map_err(|e| GolError::Read(e.to_string()))?
            .json()
            .await
            .map_err(|e| GolError::Read(e.to_string()))?;

        if let Some(err) = resp.get("error") {
            return Err(GolError::Read(format!("getEvents rpc error: {err}")));
        }
        let result = resp
            .get("result")
            .ok_or_else(|| GolError::Read("getEvents: missing result".into()))?;
        let cont = result
            .get("continuation_token")
            .and_then(Value::as_str)
            .map(String::from);
        let events = result
            .get("events")
            .and_then(Value::as_array)
            .ok_or_else(|| GolError::Read("getEvents: missing events array".into()))?;
        let parsed = events.iter().map(parse_raw_event).collect::<Result<Vec<_>, _>>()?;
        Ok((parsed, cont))
    }
}

/// A decoded event from `starknet_getEvents`.
#[derive(Clone, Debug)]
pub struct RawEvent {
    pub keys: Vec<Felt>,
    pub data: Vec<Felt>,
    pub block_number: u64,
    pub tx_hash: Felt,
}

fn parse_felt_vec(v: Option<&Value>) -> Result<Vec<Felt>, GolError> {
    let arr = v
        .and_then(Value::as_array)
        .ok_or_else(|| GolError::Encoding("expected felt array".into()))?;
    arr.iter()
        .map(|x| {
            let s = x
                .as_str()
                .ok_or_else(|| GolError::Encoding("non-string felt".into()))?;
            Felt::from_hex(s).map_err(|e| GolError::Encoding(e.to_string()))
        })
        .collect()
}

fn parse_raw_event(ev: &Value) -> Result<RawEvent, GolError> {
    let keys = parse_felt_vec(ev.get("keys"))?;
    let data = parse_felt_vec(ev.get("data"))?;
    let block_number = ev.get("block_number").and_then(Value::as_u64).unwrap_or_default();
    let tx_hash = match ev.get("transaction_hash").and_then(Value::as_str) {
        Some(s) => Felt::from_hex(s).map_err(|e| GolError::Encoding(e.to_string()))?,
        None => Felt::ZERO,
    };
    Ok(RawEvent { keys, data, block_number, tx_hash })
}

fn at(felts: &[Felt], i: usize) -> Result<&Felt, GolError> {
    felts
        .get(i)
        .ok_or_else(|| GolError::Encoding(format!("result too short: missing felt {i}")))
}

fn decode_lifeform(f: &[Felt]) -> Result<LifeformData, GolError> {
    Ok(LifeformData {
        is_loop: felt_to_bool(at(f, 0)?),
        is_still: felt_to_bool(at(f, 1)?),
        is_alive: felt_to_bool(at(f, 2)?),
        is_dead: felt_to_bool(at(f, 3)?),
        sequence_length: felt_to_u128(at(f, 4)?) as u32,
        current_state: U256::from_felts(at(f, 5)?, at(f, 6)?),
        age: felt_to_u128(at(f, 7)?) as u32,
    })
}

#[async_trait(?Send)]
impl Reader for RpcReader {
    async fn grid_size(&self) -> Result<u32, GolError> {
        let r = self
            .call_raw(self.addr(ContractKey::Lifeforms)?, selector("get_grid_size"), &[])
            .await?;
        Ok(felt_to_u128(at(&r, 0)?) as u32)
    }

    async fn lifeform(&self, token_id: U256) -> Result<Option<OwnedLifeform>, GolError> {
        match self.owner_of(token_id).await? {
            None => Ok(None),
            Some(owner) => {
                let data = self
                    .lifeform_data(token_id)
                    .await?
                    .ok_or_else(|| GolError::Read("owner present but lifeform_data reverted".into()))?;
                Ok(Some(OwnedLifeform { token_id, owner, data }))
            }
        }
    }

    async fn lifeform_data(&self, token_id: U256) -> Result<Option<LifeformData>, GolError> {
        let r = self
            .call_inner(
                self.addr(ContractKey::Lifeforms)?,
                selector("get_lifeform_data"),
                &token_id.to_calldata(),
                true,
            )
            .await?;
        match r {
            None => Ok(None),
            Some(v) => Ok(Some(decode_lifeform(&v)?)),
        }
    }

    async fn owner_of(&self, token_id: U256) -> Result<Option<Felt>, GolError> {
        let r = self
            .call_inner(
                self.addr(ContractKey::Lifeforms)?,
                selector("owner_of"),
                &token_id.to_calldata(),
                true,
            )
            .await?;
        Ok(r.and_then(|v| v.into_iter().next()))
    }

    async fn nut_balance(&self, account: Felt) -> Result<U256, GolError> {
        let r = self
            .call_raw(self.addr(ContractKey::Nutrient)?, selector("balance_of"), &[account])
            .await?;
        Ok(U256::from_felts(at(&r, 0)?, at(&r, 1)?))
    }

    async fn nut_allowance(&self, owner: Felt, spender: Felt) -> Result<U256, GolError> {
        let r = self
            .call_raw(
                self.addr(ContractKey::Nutrient)?,
                selector("allowance"),
                &[owner, spender],
            )
            .await?;
        Ok(U256::from_felts(at(&r, 0)?, at(&r, 1)?))
    }

    async fn token_uri(&self, token_id: U256) -> Result<Option<TokenUri>, GolError> {
        let r = self
            .call_inner(
                self.addr(ContractKey::Lifeforms)?,
                selector("token_uri"),
                &token_id.to_calldata(),
                true,
            )
            .await?;
        match r {
            None => Ok(None),
            Some(felts) => Ok(Some(crate::metadata::parse_token_uri(
                crate::metadata::decode_byte_array(&felts)?,
            ))),
        }
    }

    async fn iterate_once(&self, state: U256) -> Result<U256, GolError> {
        let r = self
            .call_raw(
                self.addr(ContractKey::Lifeforms)?,
                selector("iterate_life_once"),
                &state.to_calldata(),
            )
            .await?;
        Ok(U256::from_felts(at(&r, 0)?, at(&r, 1)?))
    }

    async fn iterate_several(&self, state: U256, generations: u32) -> Result<Vec<U256>, GolError> {
        let mut calldata = state.to_calldata().to_vec();
        calldata.push(Felt::from(generations));
        let r = self
            .call_raw(
                self.addr(ContractKey::Lifeforms)?,
                selector("iterate_life_several_times"),
                &calldata,
            )
            .await?;
        let len = felt_to_u128(at(&r, 0)?) as usize;
        let mut out = Vec::with_capacity(len);
        for i in 0..len {
            out.push(U256::from_felts(at(&r, 1 + 2 * i)?, at(&r, 2 + 2 * i)?));
        }
        Ok(out)
    }

    async fn is_single_loop(&self, state: U256, generations: u32) -> Result<LoopCheck, GolError> {
        let mut calldata = state.to_calldata().to_vec();
        calldata.push(Felt::from(generations));
        let r = self
            .call_raw(
                self.addr(ContractKey::Lifeforms)?,
                selector("is_single_loop_from_initial_state"),
                &calldata,
            )
            .await?;
        let ok = felt_to_bool(at(&r, 0)?);
        let smallest = U256::from_felts(at(&r, 1)?, at(&r, 2)?);
        let len = felt_to_u128(at(&r, 3)?) as usize;
        let mut sequence = Vec::with_capacity(len);
        for i in 0..len {
            sequence.push(U256::from_felts(at(&r, 4 + 2 * i)?, at(&r, 5 + 2 * i)?));
        }
        Ok(LoopCheck { ok, smallest, sequence })
    }

    async fn call(
        &self,
        target: ContractKey,
        entrypoint: &str,
        calldata: &[Felt],
    ) -> Result<Vec<Felt>, GolError> {
        self.call_raw(self.addr(target)?, selector(entrypoint), calldata).await
    }
}
