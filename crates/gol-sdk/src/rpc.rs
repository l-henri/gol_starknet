//! JSON-RPC–backed [`Reader`]: `starknet_call` over HTTP, decoding flat felt results into the
//! domain types. Works on native (reqwest/native-tls) and under wasm32 (reqwest's fetch backend).

use async_trait::async_trait;
use serde_json::{json, Value};

use crate::config::{ContractKey, GolAddresses};
use crate::encoding::selector;
use crate::error::GolError;
use crate::reader::Reader;
use crate::grid::GridState;
use crate::types::{felt_hex, felt_to_bool, felt_to_u128, Felt, LifeState, LifeformData, OwnedLifeform, OwnedPath, PathForm, RenderParams, TokenUri, U256};

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

    /// Pet-bond status for (creature, holder): `(held, last_pet, reapable)` in one shot.
    pub async fn bond_status(
        &self,
        creature: U256,
        holder: Felt,
    ) -> Result<(bool, u64, bool), GolError> {
        let pets = self.addr(ContractKey::Pets)?;
        let mut bal_cd = vec![holder];
        bal_cd.extend_from_slice(&creature.to_calldata());
        let bal = self.call_raw(pets, selector("balance_of"), &bal_cd).await?;
        let held = felt_to_u128(at(&bal, 0)?) == 1;
        let mut cd = creature.to_calldata().to_vec();
        cd.push(holder);
        let last = self.call_raw(pets, selector("last_pet_of"), &cd).await?;
        let reap = self.call_raw(pets, selector("is_reapable"), &cd).await?;
        Ok((held, felt_to_u128(at(&last, 0)?) as u64, felt_to_u128(at(&reap, 0)?) == 1))
    }

    /// Pet-bond status for MANY creatures against one holder in a single batched HTTP round-trip
    /// (3 `starknet_call`s per creature: `balance_of`, `last_pet_of`, `is_reapable`). `out[i]`
    /// matches `creatures[i]`; a reverting call reads as `(false, 0, false)` — the same "skip this
    /// creature" tolerance callers of `bond_status` apply. The batched counterpart to
    /// `bond_status`, same shape as `lifeforms_batch` — the fix for the serialized /pets sweep.
    pub async fn bond_statuses(
        &self,
        creatures: &[U256],
        holder: Felt,
    ) -> Result<Vec<(bool, u64, bool)>, GolError> {
        if creatures.is_empty() {
            return Ok(Vec::new());
        }
        let pets = self.addr(ContractKey::Pets)?;
        let mut calls: Vec<(Felt, Felt, Vec<Felt>)> = Vec::with_capacity(creatures.len() * 3);
        for c in creatures {
            let mut bal_cd = vec![holder];
            bal_cd.extend_from_slice(&c.to_calldata());
            calls.push((pets, selector("balance_of"), bal_cd));
            let mut cd = c.to_calldata().to_vec();
            cd.push(holder);
            calls.push((pets, selector("last_pet_of"), cd.clone()));
            calls.push((pets, selector("is_reapable"), cd));
        }
        let results = self.call_batch(&calls).await?;
        let first = |r: &Option<Vec<Felt>>| -> u128 {
            r.as_ref().and_then(|v| v.first()).map(felt_to_u128).unwrap_or(0)
        };
        Ok((0..creatures.len())
            .map(|i| {
                (
                    first(&results[i * 3]) == 1,
                    first(&results[i * 3 + 1]) as u64,
                    first(&results[i * 3 + 2]) == 1,
                )
            })
            .collect())
    }

    async fn call_raw(&self, to: Felt, sel: Felt, calldata: &[Felt]) -> Result<Vec<Felt>, GolError> {
        Ok(self
            .call_inner(to, sel, calldata, false)
            .await?
            .expect("non-revert path always returns Some"))
    }

    /// Many `starknet_call`s in ONE JSON-RPC batch — a single HTTP round-trip for N reads. `out[i]`
    /// is the result of `calls[i]` (`(to, selector, calldata)`), or `None` when that call reverted
    /// (`CONTRACT_ERROR`). The node may return the array out of order, so results are placed by `id`.
    pub async fn call_batch(
        &self,
        calls: &[(Felt, Felt, Vec<Felt>)],
    ) -> Result<Vec<Option<Vec<Felt>>>, GolError> {
        if calls.is_empty() {
            return Ok(Vec::new());
        }
        let batch: Vec<Value> = calls
            .iter()
            .enumerate()
            .map(|(i, (to, sel, cd))| {
                json!({
                    "jsonrpc": "2.0",
                    "id": i,
                    "method": "starknet_call",
                    "params": [{
                        "contract_address": felt_hex(to),
                        "entry_point_selector": felt_hex(sel),
                        "calldata": cd.iter().map(felt_hex).collect::<Vec<_>>(),
                    }, "latest"],
                })
            })
            .collect();

        let resp: Value = self
            .http
            .post(&self.rpc_url)
            .json(&batch)
            .send()
            .await
            .map_err(|e| GolError::Read(e.to_string()))?
            .json()
            .await
            .map_err(|e| GolError::Read(e.to_string()))?;

        let arr = resp
            .as_array()
            .ok_or_else(|| GolError::Read("batch response is not an array".into()))?;
        let mut out: Vec<Option<Vec<Felt>>> = vec![None; calls.len()];
        for item in arr {
            let id = item
                .get("id")
                .and_then(Value::as_u64)
                .ok_or_else(|| GolError::Read("batch item missing id".into()))? as usize;
            if id >= out.len() {
                continue;
            }
            if let Some(err) = item.get("error") {
                let code = err.get("code").and_then(Value::as_i64).unwrap_or_default();
                if code == CONTRACT_ERROR {
                    continue; // reverted -> leave None
                }
                return Err(GolError::Read(format!("rpc error: {err}")));
            }
            let felts = item
                .get("result")
                .and_then(Value::as_array)
                .ok_or_else(|| GolError::Read("batch item missing result".into()))?
                .iter()
                .map(|v| {
                    let s = v
                        .as_str()
                        .ok_or_else(|| GolError::Encoding("non-string felt in batch result".into()))?;
                    Felt::from_hex(s).map_err(|e| GolError::Encoding(e.to_string()))
                })
                .collect::<Result<Vec<_>, _>>()?;
            out[id] = Some(felts);
        }
        Ok(out)
    }

    /// Hydrate many lifeforms in ~2 HTTP round-trips (batched `owner_of`, then batched
    /// `get_lifeform_data` for the minted ones), preserving input order. Replaces N sequential
    /// `lifeform()` calls — the fix for the gallery's serialized loop wall.
    pub async fn lifeforms_batch(&self, ids: &[U256]) -> Result<Vec<OwnedLifeform>, GolError> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let addr = self.addr(ContractKey::Lifeforms)?;
        let owners = self
            .call_batch(
                &ids.iter()
                    .map(|id| (addr, selector("owner_of"), id.to_calldata().to_vec()))
                    .collect::<Vec<_>>(),
            )
            .await?;
        // Only minted ids (owner_of returned Some) get a data call.
        let minted: Vec<usize> = owners
            .iter()
            .enumerate()
            .filter_map(|(i, o)| o.as_ref().map(|_| i))
            .collect();
        let datas = self
            .call_batch(
                &minted
                    .iter()
                    .map(|&i| (addr, selector("get_lifeform_data"), ids[i].to_calldata().to_vec()))
                    .collect::<Vec<_>>(),
            )
            .await?;
        let mut out = Vec::with_capacity(minted.len());
        for (k, &i) in minted.iter().enumerate() {
            let owner = match owners[i].as_ref().and_then(|v| v.first()) {
                Some(o) => *o,
                None => continue,
            };
            if let Some(Some(felts)) = datas.get(k) {
                out.push(OwnedLifeform { token_id: ids[i], owner, data: decode_lifeform(felts)? });
            }
        }
        Ok(out)
    }

    /// Hydrate many PATH creatures in ~2 HTTP round-trips (batched `owner_of` on the path NFT, then
    /// batched `get_path_data`). Burned/unminted ids (whose `owner_of` reverts) are dropped. Order
    /// preserved.
    pub async fn paths_batch(&self, ids: &[U256]) -> Result<Vec<OwnedPath>, GolError> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let addr = self.addr(ContractKey::PathLifeforms)?;
        let owners = self
            .call_batch(
                &ids.iter()
                    .map(|id| (addr, selector("owner_of"), id.to_calldata().to_vec()))
                    .collect::<Vec<_>>(),
            )
            .await?;
        let minted: Vec<usize> = owners
            .iter()
            .enumerate()
            .filter_map(|(i, o)| o.as_ref().map(|_| i))
            .collect();
        let datas = self
            .call_batch(
                &minted
                    .iter()
                    .map(|&i| (addr, selector("get_path_data"), ids[i].to_calldata().to_vec()))
                    .collect::<Vec<_>>(),
            )
            .await?;
        let mut out = Vec::with_capacity(minted.len());
        for (k, &i) in minted.iter().enumerate() {
            let owner = match owners[i].as_ref().and_then(|v| v.first()) {
                Some(o) => *o,
                None => continue,
            };
            if let Some(Some(felts)) = datas.get(k) {
                out.push(OwnedPath { token_id: ids[i], owner, data: decode_path_form(felts)? });
            }
        }
        Ok(out)
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
    // v2 layout: is_loop, is_still, is_alive, is_dead, sequence_length, current_state (7-felt
    // GridState w0..w6), age — 13 felts.
    let state = GridState::from_felts(
        f.get(5..12)
            .ok_or_else(|| GolError::Encoding("lifeform: result too short for GridState".into()))?,
    )
    .ok_or_else(|| GolError::Encoding("lifeform: bad GridState".into()))?;
    Ok(LifeformData {
        is_loop: felt_to_bool(at(f, 0)?),
        is_still: felt_to_bool(at(f, 1)?),
        is_alive: felt_to_bool(at(f, 2)?),
        is_dead: felt_to_bool(at(f, 3)?),
        sequence_length: felt_to_u128(at(f, 4)?) as u32,
        current_state: state,
        age: felt_to_u128(at(f, 12)?) as u32,
    })
}

fn decode_path_form(f: &[Felt]) -> Result<PathForm, GolError> {
    // layout: life_state(0), sequence_length(1), start_state GridState(2..9), target_loop_id(9),
    // target_period(10), minted_at(11), escrow low(12)/high(13) — 14 felts.
    let start = GridState::from_felts(
        f.get(2..9)
            .ok_or_else(|| GolError::Encoding("path: result too short for GridState".into()))?,
    )
    .ok_or_else(|| GolError::Encoding("path: bad GridState".into()))?;
    Ok(PathForm {
        life_state: LifeState::from_index(felt_to_u128(at(f, 0)?) as u8),
        sequence_length: felt_to_u128(at(f, 1)?) as u32,
        start_state: start,
        target_loop_id: *at(f, 9)?,
        target_period: felt_to_u128(at(f, 10)?) as u32,
        minted_at: felt_to_u128(at(f, 11)?) as u64,
        escrow: U256::from_felts(at(f, 12)?, at(f, 13)?),
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

    async fn discoverer(&self, token_id: U256) -> Result<Option<Felt>, GolError> {
        let r = self
            .call_inner(
                self.addr(ContractKey::Lifeforms)?,
                selector("get_discoverer"),
                &token_id.to_calldata(),
                true,
            )
            .await?;
        // Zero = grandfathered (pre-field mint) — reported as "no discoverer", like a revert on
        // a class that predates the entrypoint.
        Ok(r.and_then(|v| v.into_iter().next()).filter(|f| *f != Felt::ZERO))
    }

    async fn path_discoverer(&self, token_id: U256) -> Result<Option<Felt>, GolError> {
        let r = self
            .call_inner(
                self.addr(ContractKey::PathLifeforms)?,
                selector("get_discoverer"),
                &token_id.to_calldata(),
                true,
            )
            .await?;
        Ok(r.and_then(|v| v.into_iter().next()).filter(|f| *f != Felt::ZERO))
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

    async fn render_params(&self, token_id: U256) -> Result<Option<RenderParams>, GolError> {
        let r = self
            .call_inner(
                self.addr(ContractKey::Lifeforms)?,
                selector("get_render_params"),
                &token_id.to_calldata(),
                true,
            )
            .await?;
        match r {
            None => Ok(None),
            Some(v) => Ok(Some(RenderParams {
                bg: felt_to_u128(at(&v, 0)?) as u32,
                cell: felt_to_u128(at(&v, 1)?) as u32,
                speed: felt_to_u128(at(&v, 2)?) as u16,
            })),
        }
    }

    async fn path_form(&self, token_id: U256) -> Result<Option<PathForm>, GolError> {
        let r = self
            .call_inner(
                self.addr(ContractKey::PathLifeforms)?,
                selector("get_path_data"),
                &token_id.to_calldata(),
                true,
            )
            .await?;
        match r {
            None => Ok(None),
            Some(v) => Ok(Some(decode_path_form(&v)?)),
        }
    }

    async fn path_lifeform(&self, token_id: U256) -> Result<Option<OwnedPath>, GolError> {
        // owner_of on the PATH NFT gates existence (a burned/unminted id reverts).
        let owner = self
            .call_inner(
                self.addr(ContractKey::PathLifeforms)?,
                selector("owner_of"),
                &token_id.to_calldata(),
                true,
            )
            .await?
            .and_then(|v| v.into_iter().next());
        match owner {
            None => Ok(None),
            Some(owner) => {
                let data = self
                    .path_form(token_id)
                    .await?
                    .ok_or_else(|| GolError::Read("owner present but path_form reverted".into()))?;
                Ok(Some(OwnedPath { token_id, owner, data }))
            }
        }
    }

    async fn path_render_params(&self, token_id: U256) -> Result<Option<RenderParams>, GolError> {
        let r = self
            .call_inner(
                self.addr(ContractKey::PathLifeforms)?,
                selector("get_render_params"),
                &token_id.to_calldata(),
                true,
            )
            .await?;
        match r {
            None => Ok(None),
            Some(v) => Ok(Some(RenderParams {
                bg: felt_to_u128(at(&v, 0)?) as u32,
                cell: felt_to_u128(at(&v, 1)?) as u32,
                speed: felt_to_u128(at(&v, 2)?) as u16,
            })),
        }
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
