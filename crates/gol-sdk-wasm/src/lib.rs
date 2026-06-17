//! WASM bindings for `gol-sdk` — the surface the web frontend imports.
//!
//! Exposes **reads + call-building**; signing/broadcast stays in JS (the browser wallet via
//! get-starknet). Reads return plain JS objects (felts/u256 as hex strings to avoid bigint
//! precision loss); the call-builders return `[{ contractAddress, entrypoint, calldata }]` ready
//! for `account.execute(calls)`.
//!
//! Build: `wasm-pack build crates/gol-sdk-wasm --target web`.

use gol_sdk::{
    felt_to_hex, Call, DataSource, EventScanDataSource, Felt, GolClient, GolConfig, Network,
    OwnedLifeform, U256,
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
    current_state: String,
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
            current_state: lf.data.current_state.to_hex(),
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

    /// Decoded `token_uri` (name/description/image/attributes), or `null`.
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

    /// `[approve, mint_loop]` calls for the wallet to sign + send.
    #[wasm_bindgen(js_name = mintLoopCalls)]
    pub fn mint_loop_calls(
        &self,
        loop_id: &str,
        loop_length: u32,
        recipient: &str,
    ) -> Result<JsValue, JsValue> {
        let calls = self
            .client
            .writes()
            .mint_loop(parse_u256(loop_id)?, loop_length, parse_felt(recipient)?);
        calls_to_js(&[("approve", &calls[0]), ("mint_loop", &calls[1])])
    }

    /// The `move_lifeform_forward` call for the wallet to sign + send.
    #[wasm_bindgen(js_name = breatheLifeCall)]
    pub fn breathe_life_call(&self, token_id: &str) -> Result<JsValue, JsValue> {
        let call = self.client.writes().breathe_life(parse_u256(token_id)?);
        calls_to_js(&[("move_lifeform_forward", &call)])
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
