//! WASM bindings for `gol-sdk` — the surface the web frontend imports.
//!
//! Exposes **reads + call-building**; signing/broadcast stays in JS (the browser wallet via
//! get-starknet). Reads return plain JS objects (felts/u256 as hex strings to avoid bigint
//! precision loss); the call-builders return `[{ contractAddress, entrypoint, calldata }]` ready
//! for `account.execute(calls)`.
//!
//! Build: `wasm-pack build crates/gol-sdk-wasm --target web`.

use gol_sdk::{
    engine, felt_to_hex, step, token_id, Call, DataSource, EventScanDataSource, Felt, GolClient,
    GolConfig, GridState, Network, OwnedLifeform, RenderParams, Rows, MASK, N, U256,
};
use serde::Serialize;
use wasm_bindgen::prelude::*;

/// JS-friendly lifeform (hex strings for felt/u256; small counts as numbers).
#[derive(Serialize)]
struct JsLifeform {
    token_id: String,
    owner: String,
    is_loop: bool,
    is_still: bool,
    is_alive: bool,
    is_dead: bool,
    sequence_length: u32,
    /// The 41 grid rows as bitmasks (each < 2^41, exact as a JS number) — for the renderer.
    current_state: Vec<f64>,
    age: u32,
}

impl JsLifeform {
    fn of(lf: &OwnedLifeform) -> Self {
        Self {
            token_id: lf.token_id.to_hex(),
            owner: felt_to_hex(&lf.owner),
            is_loop: lf.data.is_loop,
            is_still: lf.data.is_still,
            is_alive: lf.data.is_alive,
            is_dead: lf.data.is_dead,
            sequence_length: lf.data.sequence_length,
            current_state: lf.data.current_state.rows_f64(),
            age: lf.data.age,
        }
    }
}

/// A call shaped for starknet.js `account.execute`.
#[derive(Serialize)]
struct JsCall {
    #[serde(rename = "contractAddress")]
    contract_address: String,
    entrypoint: String,
    calldata: Vec<String>,
}

#[wasm_bindgen]
pub struct GolSdk {
    client: GolClient,
}

#[wasm_bindgen]
impl GolSdk {
    /// `network`: "sepolia" | "mainnet". `rpc_url` overrides the default node.
    #[wasm_bindgen(constructor)]
    pub fn new(network: &str, rpc_url: Option<String>) -> Result<GolSdk, JsValue> {
        console_error_panic_hook::set_once();
        let net = match network.to_ascii_lowercase().as_str() {
            "sepolia" => Network::Sepolia,
            "mainnet" => Network::Mainnet,
            other => return Err(js_err(format!("unknown network: {other}"))),
        };
        let mut config = GolConfig::for_network(net).map_err(err)?;
        if let Some(url) = rpc_url {
            config.rpc_url = url;
        }
        Ok(GolSdk {
            client: GolClient::new(config),
        })
    }

    #[wasm_bindgen(js_name = gridSize)]
    pub async fn grid_size(&self) -> Result<JsValue, JsValue> {
        let n = self.client.reads().grid_size().await.map_err(err)?;
        Ok(JsValue::from(n))
    }

    /// Lifeform by token id (decimal or `0x` hex), or `null` if unminted.
    pub async fn lifeform(&self, token_id: &str) -> Result<JsValue, JsValue> {
        match self.client.reads().lifeform(parse_u256(token_id)?).await.map_err(err)? {
            Some(lf) => to_js(&JsLifeform::of(&lf)),
            None => Ok(JsValue::NULL),
        }
    }

    /// Decoded `token_uri` (name/description/animation_url/attributes), or `null`.
    #[wasm_bindgen(js_name = tokenUri)]
    pub async fn token_uri(&self, token_id: &str) -> Result<JsValue, JsValue> {
        match self.client.reads().token_uri(parse_u256(token_id)?).await.map_err(err)? {
            Some(uri) => to_js(&uri),
            None => Ok(JsValue::NULL),
        }
    }

    /// NUT balance as a `0x` hex string (wrap with `BigInt()` in JS).
    #[wasm_bindgen(js_name = nutBalance)]
    pub async fn nut_balance(&self, address: &str) -> Result<JsValue, JsValue> {
        let bal = self.client.reads().nut_balance(parse_felt(address)?).await.map_err(err)?;
        Ok(JsValue::from_str(&bal.to_hex()))
    }

    /// Lifeforms currently owned by `address`, via the RPC event scan.
    #[wasm_bindgen(js_name = ownedLifeforms)]
    pub async fn owned_lifeforms(&self, address: &str) -> Result<JsValue, JsValue> {
        let ds = EventScanDataSource::new(
            self.client.config.rpc_url.clone(),
            self.client.config.addresses.clone(),
        );
        let owned = ds.owned_lifeforms(parse_felt(address)?).await.map_err(err)?;
        let js: Vec<JsLifeform> = owned.iter().map(JsLifeform::of).collect();
        to_js(&js)
    }

    /// Every minted lifeform (newest first), capped at `limit` (0 = unlimited), via the RPC event
    /// scan. The global gallery feed on Sepolia. Each is confirmed live (current owner + state).
    #[wasm_bindgen(js_name = recentLifeforms)]
    pub async fn recent_lifeforms(&self, limit: u32) -> Result<JsValue, JsValue> {
        let ds = EventScanDataSource::new(
            self.client.config.rpc_url.clone(),
            self.client.config.addresses.clone(),
        );
        let recent = ds.recent_lifeforms(limit).await.map_err(err)?;
        let js: Vec<JsLifeform> = recent.iter().map(JsLifeform::of).collect();
        to_js(&js)
    }

    /// Token ids ("0x…") of recent mints, newest first — the FAST event scan only (no per-token
    /// reads). For progressive UIs: get the ids, then hydrate each via `lifeform()` as it renders.
    #[wasm_bindgen(js_name = recentTokenIds)]
    pub async fn recent_token_ids(&self, limit: u32) -> Result<JsValue, JsValue> {
        let ds = EventScanDataSource::new(
            self.client.config.rpc_url.clone(),
            self.client.config.addresses.clone(),
        );
        let ids = ds.recent_token_ids(limit).await.map_err(err)?;
        let hex: Vec<String> = ids.iter().map(U256::to_hex).collect();
        to_js(&hex)
    }

    /// `[approve, mint_loop]` calls for the wallet to sign + send. `rows` is the loop's canonical
    /// (smallest) state as 41 row bitmasks.
    #[wasm_bindgen(js_name = mintLoopCalls)]
    pub fn mint_loop_calls(
        &self,
        rows: Vec<f64>,
        loop_length: u32,
        recipient: &str,
    ) -> Result<JsValue, JsValue> {
        let state = GridState::pack(&rows_from_js(rows)?);
        let calls = self
            .client
            .writes()
            .mint_loop(&state, loop_length, parse_felt(recipient)?);
        calls_to_js(&[("approve", &calls[0]), ("mint_loop", &calls[1])])
    }

    /// The `move_lifeform_forward_n(token_id, n)` call for the wallet to sign + send — advances `n`
    /// generations and mints `n` NUT in one tx. `n` is clamped to >= 1 (the contract asserts n > 0).
    #[wasm_bindgen(js_name = breatheLifeCall)]
    pub fn breathe_life_call(&self, token_id: &str, n: u32) -> Result<JsValue, JsValue> {
        let call = self.client.writes().breathe_life(parse_u256(token_id)?, n.max(1));
        calls_to_js(&[("move_lifeform_forward_n", &call)])
    }

    /// Per-token render params (`{ bg, cell, speed }`), or `null` if unminted.
    #[wasm_bindgen(js_name = renderParams)]
    pub async fn render_params(&self, token_id: &str) -> Result<JsValue, JsValue> {
        match self.client.reads().render_params(parse_u256(token_id)?).await.map_err(err)? {
            Some(rp) => to_js(&rp),
            None => Ok(JsValue::NULL),
        }
    }

    /// The owner-only `set_render_params` call for the wallet to sign + send.
    #[wasm_bindgen(js_name = setRenderParamsCall)]
    pub fn set_render_params_call(
        &self,
        token_id: &str,
        bg: u32,
        cell: u32,
        speed: u16,
    ) -> Result<JsValue, JsValue> {
        let call = self
            .client
            .writes()
            .set_render_params(parse_u256(token_id)?, RenderParams { bg, cell, speed });
        calls_to_js(&[("set_render_params", &call)])
    }

    /// The token id (`0x` hex) for a grid given as 41 row bitmasks — the off-chain Poseidon identity
    /// the contract uses; lets the frontend look up or pre-compute a token before minting.
    #[wasm_bindgen(js_name = tokenIdForRows)]
    pub fn token_id_for_rows(&self, rows: Vec<f64>) -> Result<JsValue, JsValue> {
        Ok(JsValue::from_str(&token_id(&rows_from_js(rows)?).to_hex()))
    }

    /// One Conway generation (41 row bitmasks in, 41 out) — the pure off-chain engine, for
    /// client-side preview/animation without a chain round-trip.
    #[wasm_bindgen(js_name = stepRows)]
    pub fn step_rows(&self, rows: Vec<f64>) -> Result<JsValue, JsValue> {
        let next = step(&rows_from_js(rows)?);
        to_js(&rows_to_js(&next))
    }

    /// Discover the loop reachable from `rows` within `max_period`: `{ period, smallest }` (the
    /// canonical state to mint) or `null` if it doesn't recur in range.
    #[wasm_bindgen(js_name = findLoop)]
    pub fn find_loop(&self, rows: Vec<f64>, max_period: u32) -> Result<JsValue, JsValue> {
        match engine::find_loop(&rows_from_js(rows)?, max_period) {
            Some((period, smallest)) => {
                #[derive(Serialize)]
                struct FoundLoop {
                    period: u32,
                    smallest: Vec<f64>,
                }
                to_js(&FoundLoop { period, smallest: rows_to_js(&smallest) })
            }
            None => Ok(JsValue::NULL),
        }
    }
}

fn err(e: gol_sdk::GolError) -> JsValue {
    js_err(e.to_string())
}

fn js_err(msg: String) -> JsValue {
    JsValue::from_str(&msg)
}

fn to_js<T: Serialize>(v: &T) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(v).map_err(|e| js_err(e.to_string()))
}

fn parse_u256(s: &str) -> Result<U256, JsValue> {
    U256::parse(s).ok_or_else(|| js_err(format!("invalid u256: {s}")))
}

fn parse_felt(s: &str) -> Result<Felt, JsValue> {
    Felt::from_hex(s).map_err(|_| js_err(format!("invalid felt/address: {s}")))
}

/// Convert 41 JS row numbers to engine `Rows`, validating count + range (each row < 2^41).
fn rows_from_js(rows: Vec<f64>) -> Result<Rows, JsValue> {
    if rows.len() != N {
        return Err(js_err(format!("expected {N} rows, got {}", rows.len())));
    }
    let mut r = [0u64; N];
    for (i, v) in rows.iter().enumerate() {
        if !v.is_finite() || *v < 0.0 || *v > MASK as f64 {
            return Err(js_err(format!("row {i} out of range: {v}")));
        }
        r[i] = *v as u64;
    }
    Ok(r)
}

fn rows_to_js(r: &Rows) -> Vec<f64> {
    r.iter().map(|&x| x as f64).collect()
}

fn calls_to_js(named: &[(&str, &Call)]) -> Result<JsValue, JsValue> {
    let calls: Vec<JsCall> = named
        .iter()
        .map(|(name, c)| JsCall {
            contract_address: felt_to_hex(&c.to),
            entrypoint: (*name).to_string(),
            calldata: c.calldata.iter().map(felt_to_hex).collect(),
        })
        .collect();
    to_js(&calls)
}
