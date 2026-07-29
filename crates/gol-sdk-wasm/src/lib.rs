//! WASM bindings for `gol-sdk` — the surface the web frontend imports.
//!
//! Exposes **reads + call-building**; signing/broadcast stays in JS (the browser wallet via
//! get-starknet). Reads return plain JS objects (felts/u256 as hex strings to avoid bigint
//! precision loss); the call-builders return `[{ contractAddress, entrypoint, calldata }]` ready
//! for `account.execute(calls)`.
//!
//! Build: `wasm-pack build crates/gol-sdk-wasm --target web`.

use gol_sdk::{
    engine, felt_to_hex, grid, step, token_id, Call, DataSource, EventScanDataSource, Felt,
    GolClient, GolConfig, GridState, Network, OwnedLifeform, OwnedPath, RenderParams, Rows, MASK,
    N, U256,
};
use serde::Serialize;
use wasm_bindgen::prelude::*;

/// A mint event: token id + the block it landed in (recency key for windowed boards).
#[derive(Serialize)]
struct JsMint {
    token_id: String,
    block: u64,
}

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

/// JS-friendly path creature (hex strings for felt/u256; small counts as numbers).
#[derive(Serialize)]
struct JsPath {
    token_id: String,
    owner: String,
    /// "alive" | "frozen" | "dead"
    life_state: String,
    /// distance to the loop (generations).
    sequence_length: u32,
    /// the path's start state as 41 row bitmasks (for the renderer).
    start_state: Vec<f64>,
    target_loop_id: String,
    target_period: u32,
    /// mint block timestamp (fits exactly in an f64).
    minted_at: f64,
    /// escrowed NUT as a `0x` hex string (wrap with `BigInt()` in JS).
    escrow: String,
}

impl JsPath {
    fn of(p: &OwnedPath) -> Self {
        Self {
            token_id: p.token_id.to_hex(),
            owner: felt_to_hex(&p.owner),
            life_state: p.data.life_state.as_str().to_string(),
            sequence_length: p.data.sequence_length,
            start_state: p.data.start_state.rows_f64(),
            target_loop_id: felt_to_hex(&p.data.target_loop_id),
            target_period: p.data.target_period,
            minted_at: p.data.minted_at as f64,
            escrow: p.data.escrow.to_hex(),
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

    /// The loop creature's discoverer (the mint's escrow payer) as a hex address, or `null`
    /// (unminted, grandfathered pre-field mint, or the deployed class predates the entrypoint).
    #[wasm_bindgen(js_name = discoverer)]
    pub async fn discoverer(&self, token_id: &str) -> Result<JsValue, JsValue> {
        match self.client.reads().discoverer(parse_u256(token_id)?).await.map_err(err)? {
            Some(f) => Ok(JsValue::from_str(&felt_to_hex(&f))),
            None => Ok(JsValue::NULL),
        }
    }

    /// The wanderer's discoverer as a hex address, or `null` — same semantics as `discoverer`.
    #[wasm_bindgen(js_name = pathDiscoverer)]
    pub async fn path_discoverer(&self, token_id: &str) -> Result<JsValue, JsValue> {
        match self.client.reads().path_discoverer(parse_u256(token_id)?).await.map_err(err)? {
            Some(f) => Ok(JsValue::from_str(&felt_to_hex(&f))),
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

    /// Every minted PATH creature (newest first), capped at `limit` (0 = unlimited), hydrated in ~2
    /// batched round-trips (owner + state). The batched counterpart to `recentPathTokenIds` + per-id
    /// `pathLifeform`; burned paths are already dropped.
    #[wasm_bindgen(js_name = recentPaths)]
    pub async fn recent_paths(&self, limit: u32) -> Result<JsValue, JsValue> {
        let ds = EventScanDataSource::new(
            self.client.config.rpc_url.clone(),
            self.client.config.addresses.clone(),
        );
        let recent = ds.recent_paths(limit).await.map_err(err)?;
        let js: Vec<JsPath> = recent.iter().map(JsPath::of).collect();
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

    /// Token ids ("0x…") of recent PATH mints, newest first — the fast event scan of the path NFT.
    /// Hydrate each via `pathLifeform()`; burned paths hydrate to null and should be skipped.
    #[wasm_bindgen(js_name = recentPathTokenIds)]
    pub async fn recent_path_token_ids(&self, limit: u32) -> Result<JsValue, JsValue> {
        let ds = EventScanDataSource::new(
            self.client.config.rpc_url.clone(),
            self.client.config.addresses.clone(),
        );
        let ids = ds.recent_path_token_ids(limit).await.map_err(err)?;
        let hex: Vec<String> = ids.iter().map(U256::to_hex).collect();
        to_js(&hex)
    }

    /// Loop mints with their block numbers, newest first: `[{ token_id, block }]` — the recency
    /// source for time-windowed leaderboards ("discovery of the week").
    #[wasm_bindgen(js_name = recentMints)]
    pub async fn recent_mints(&self) -> Result<JsValue, JsValue> {
        let ds = EventScanDataSource::new(
            self.client.config.rpc_url.clone(),
            self.client.config.addresses.clone(),
        );
        let mints = ds.recent_mints_with_blocks().await.map_err(err)?;
        to_js(&mints.iter().map(|(t, b)| JsMint { token_id: t.to_hex(), block: *b }).collect::<Vec<_>>())
    }

    /// Path mints with their block numbers, newest first (burned paths still listed — hydrate to
    /// filter): `[{ token_id, block }]`.
    #[wasm_bindgen(js_name = recentPathMints)]
    pub async fn recent_path_mints(&self) -> Result<JsValue, JsValue> {
        let ds = EventScanDataSource::new(
            self.client.config.rpc_url.clone(),
            self.client.config.addresses.clone(),
        );
        let mints = ds.recent_path_mints_with_blocks().await.map_err(err)?;
        to_js(&mints.iter().map(|(t, b)| JsMint { token_id: t.to_hex(), block: *b }).collect::<Vec<_>>())
    }

    /// Total generations breathed per account, descending: `[{ address, generations }]` — the
    /// "top breathers" board (NUT faucet mints aggregated; the initial-supply mint excluded).
    #[wasm_bindgen(js_name = topBreathers)]
    pub async fn top_breathers(&self) -> Result<JsValue, JsValue> {
        let ds = EventScanDataSource::new(
            self.client.config.rpc_url.clone(),
            self.client.config.addresses.clone(),
        );
        let totals = ds.feed_rewards().await.map_err(err)?;
        #[derive(Serialize)]
        struct JsBreather {
            address: String,
            generations: u64,
        }
        to_js(
            &totals
                .iter()
                .map(|(a, g)| JsBreather { address: felt_to_hex(a), generations: *g })
                .collect::<Vec<_>>(),
        )
    }

    /// `[approve, mint_loop]` calls for the wallet to sign + send. v3: `rows` may be ANY state of
    /// the loop (the drawn orientation is preserved for display); the orbit canonical + witness
    /// are computed here and ride in the calldata.
    #[wasm_bindgen(js_name = mintLoopCalls)]
    pub fn mint_loop_calls(
        &self,
        rows: Vec<f64>,
        loop_length: u32,
        recipient: &str,
    ) -> Result<JsValue, JsValue> {
        let drawn = rows_from_js(rows)?;
        let calls = self
            .client
            .writes()
            .mint_loop(&drawn, loop_length, parse_felt(recipient)?);
        calls_to_js(&[("approve", &calls[0]), ("mint_loop", &calls[1])])
    }

    /// `pets.pet(creature_id)` — the ceremonial breath (feeds 1 gen, NUT to caller, bond+clock).
    #[wasm_bindgen(js_name = petCall)]
    pub fn pet_call(&self, creature_id: &str) -> Result<JsValue, JsValue> {
        let call = self.client.writes().pet(parse_u256(creature_id)?);
        calls_to_js(&[("pet", &call)])
    }

    /// `pets.reap(creature_id, holder)` — burn a lapsed bond, 1 NUT minted to the caller.
    #[wasm_bindgen(js_name = reapCall)]
    pub fn reap_call(&self, creature_id: &str, holder: &str) -> Result<JsValue, JsValue> {
        let call = self.client.writes().reap(parse_u256(creature_id)?, parse_felt(holder)?);
        calls_to_js(&[("reap", &call)])
    }

    /// `pets.transfer_bond(creature_id, to)` — daycare hand-off (the clock rides along).
    #[wasm_bindgen(js_name = transferBondCall)]
    pub fn transfer_bond_call(&self, creature_id: &str, to: &str) -> Result<JsValue, JsValue> {
        let call = self.client.writes().transfer_bond(parse_u256(creature_id)?, parse_felt(to)?);
        calls_to_js(&[("transfer_bond", &call)])
    }

    /// Every (creature, holder) pair that has ever petted (deduped, newest first):
    /// `[{ creature_id, holder }]` — the caretaker graph. Filter with `bondStatus`.
    #[wasm_bindgen(js_name = petPairs)]
    pub async fn pet_pairs(&self) -> Result<JsValue, JsValue> {
        let ds = EventScanDataSource::new(
            self.client.config.rpc_url.clone(),
            self.client.config.addresses.clone(),
        );
        let pairs = ds.pet_pairs().await.map_err(err)?;
        #[derive(Serialize)]
        struct JsPair {
            creature_id: String,
            holder: String,
        }
        to_js(
            &pairs
                .iter()
                .map(|(c, h)| JsPair { creature_id: c.to_hex(), holder: felt_to_hex(h) })
                .collect::<Vec<_>>(),
        )
    }

    /// Current bond status for (creature, holder): `{ held, last_pet, reapable }`.
    #[wasm_bindgen(js_name = bondStatus)]
    pub async fn bond_status(&self, creature_id: &str, holder: &str) -> Result<JsValue, JsValue> {
        let (held, last_pet, reapable) = self
            .client
            .rpc()
            .bond_status(parse_u256(creature_id)?, parse_felt(holder)?)
            .await
            .map_err(err)?;
        #[derive(Serialize)]
        struct JsBond {
            held: bool,
            last_pet: f64,
            reapable: bool,
        }
        to_js(&JsBond { held, last_pet: last_pet as f64, reapable })
    }

    /// The v3 FAMILY token id for a drawn pattern — the id it would mint under (loops: pass the
    /// period; paths/wanderers: pass 0). Use to detect "this creature already lives" before the
    /// wallet ever opens: `lifeform(familyTokenId(...))` non-null ⇒ duplicate.
    #[wasm_bindgen(js_name = familyTokenId)]
    pub fn family_token_id(&self, rows: Vec<f64>, period: u32) -> Result<JsValue, JsValue> {
        let r = rows_from_js(rows)?;
        let canonical = if period > 1 {
            grid::loop_family_canonical(&r, period).0
        } else {
            grid::symmetry_canonical(&r).0
        };
        Ok(JsValue::from_str(&token_id(&canonical).to_hex()))
    }

    /// v3 `prove_malformed` call for a LOOP (witness `(d4, dr, dc, k)` exhibits a smaller family
    /// member; bounty = the token's escrow).
    #[wasm_bindgen(js_name = proveMalformedLoopCall)]
    pub fn prove_malformed_loop_call(
        &self,
        token_id_hex: &str,
        d4: u8,
        dr: u8,
        dc: u8,
        k: u32,
    ) -> Result<JsValue, JsValue> {
        let call = self
            .client
            .writes()
            .prove_malformed_loop(parse_u256(token_id_hex)?, d4, dr, dc, k);
        calls_to_js(&[("prove_malformed", &call)])
    }

    /// v3 `prove_malformed` call for a WANDERER (no phase).
    #[wasm_bindgen(js_name = proveMalformedWandererCall)]
    pub fn prove_malformed_wanderer_call(
        &self,
        token_id_hex: &str,
        d4: u8,
        dr: u8,
        dc: u8,
    ) -> Result<JsValue, JsValue> {
        let call = self
            .client
            .writes()
            .prove_malformed_wanderer(parse_u256(token_id_hex)?, d4, dr, dc);
        calls_to_js(&[("prove_malformed", &call)])
    }

    /// v3 feed-for: `move_lifeform_forward_n_for(token, n, beneficiary)` — the pet hook.
    #[wasm_bindgen(js_name = breatheLifeForCall)]
    pub fn breathe_life_for_call(
        &self,
        token_id_hex: &str,
        n: u32,
        beneficiary: &str,
    ) -> Result<JsValue, JsValue> {
        let call = self
            .client
            .writes()
            .breathe_life_for(parse_u256(token_id_hex)?, n, parse_felt(beneficiary)?);
        calls_to_js(&[("move_lifeform_forward_n_for", &call)])
    }

    /// Plan the full transaction sequence to mint a loop. `rows` = the loop's canonical (smallest)
    /// state; `loop_length` = its period. Short loops are a single `mint_loop` tx; long loops (whose
    /// on-chain verification exceeds the wallet's per-tx gas cap) are tiled into partial-path segments
    /// the wallet signs in sequence. Returns
    /// `{ steps: [{ label, calls: [{contractAddress, entrypoint, calldata}] }], txCount, singleShot, tooLong }`.
    /// Each `step` is one transaction (a multicall); fire them in order, awaiting each.
    #[wasm_bindgen(js_name = planLoopMint)]
    pub fn plan_loop_mint(
        &self,
        rows: Vec<f64>,
        loop_length: u32,
        recipient: &str,
        chunk_steps: u32,
        single_shot_max: u32,
        max_tx: u32,
    ) -> Result<JsValue, JsValue> {
        let canonical = rows_from_js(rows)?;
        let plan = self.client.writes().plan_loop_mint(
            &canonical,
            loop_length,
            parse_felt(recipient)?,
            chunk_steps,
            single_shot_max,
            max_tx,
        );
        to_js(&js_plan(&plan))
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

    /// Lexicographically smallest grid in the full 13,448-element symmetry orbit —
    /// `{ canonical: rows, d4, dr, dc }`. Two grids are symmetry copies iff their orbit canonicals
    /// match: the copy-detection key for mint warnings and indexer dedup.
    #[wasm_bindgen(js_name = symmetryCanonical)]
    pub fn symmetry_canonical_js(&self, rows: Vec<f64>) -> Result<JsValue, JsValue> {
        let (canonical, d4, dr, dc) = grid::symmetry_canonical(&rows_from_js(rows)?);
        #[derive(Serialize)]
        struct Orbit {
            canonical: Vec<f64>,
            d4: u8,
            dr: u32,
            dc: u32,
        }
        to_js(&Orbit { canonical: rows_to_js(&canonical), d4, dr: dr as u32, dc: dc as u32 })
    }

    /// Search for a challenge witness relating two start states:
    /// `{ d4, dr, dc, k }` with `apply_symmetry(g, step^k(a)) == b`, or `null`. For paths pass
    /// `max_k` = the sequence-length gap; for loops `max_k` = period − 1.
    #[wasm_bindgen(js_name = findWitness)]
    pub fn find_witness_js(
        &self,
        a_rows: Vec<f64>,
        b_rows: Vec<f64>,
        max_k: u32,
    ) -> Result<JsValue, JsValue> {
        match grid::find_witness(&rows_from_js(a_rows)?, &rows_from_js(b_rows)?, max_k) {
            Some((d4, dr, dc, k)) => {
                #[derive(Serialize)]
                struct Witness {
                    d4: u8,
                    dr: u32,
                    dc: u32,
                    k: u32,
                }
                to_js(&Witness { d4, dr: dr as u32, dc: dc as u32, k })
            }
            None => Ok(JsValue::NULL),
        }
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

    /// Classify what a drawing settles into: `{ kind: "loop"|"path"|"transient", … }`.
    /// - loop → `{ period, canonical: rows }` (mint a loop creature)
    /// - path → `{ sequenceLength, loopPeriod, loopCanonical: rows, loopEntry: rows, lifeState }`
    /// - transient → `{ steps }` (no loop within `max_steps`)
    #[wasm_bindgen(js_name = classifyFate)]
    pub fn classify_fate(&self, rows: Vec<f64>, max_steps: u32) -> Result<JsValue, JsValue> {
        #[derive(Serialize)]
        struct JsFate {
            kind: &'static str,
            #[serde(skip_serializing_if = "Option::is_none")]
            period: Option<u32>,
            #[serde(skip_serializing_if = "Option::is_none")]
            canonical: Option<Vec<f64>>,
            #[serde(rename = "sequenceLength", skip_serializing_if = "Option::is_none")]
            sequence_length: Option<u32>,
            #[serde(rename = "loopPeriod", skip_serializing_if = "Option::is_none")]
            loop_period: Option<u32>,
            #[serde(rename = "loopCanonical", skip_serializing_if = "Option::is_none")]
            loop_canonical: Option<Vec<f64>>,
            #[serde(rename = "loopEntry", skip_serializing_if = "Option::is_none")]
            loop_entry: Option<Vec<f64>>,
            #[serde(rename = "lifeState", skip_serializing_if = "Option::is_none")]
            life_state: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            steps: Option<u32>,
        }
        let base = JsFate {
            kind: "",
            period: None, canonical: None, sequence_length: None, loop_period: None,
            loop_canonical: None, loop_entry: None, life_state: None, steps: None,
        };
        let out = match engine::classify_fate(&rows_from_js(rows)?, max_steps) {
            engine::Fate::Loop { period, canonical } => JsFate {
                kind: "loop", period: Some(period), canonical: Some(rows_to_js(&canonical)), ..base
            },
            engine::Fate::Path(p) => JsFate {
                kind: "path",
                sequence_length: Some(p.sequence_length),
                loop_period: Some(p.loop_period),
                loop_canonical: Some(rows_to_js(&p.loop_canonical)),
                loop_entry: Some(rows_to_js(&p.loop_entry)),
                life_state: Some(p.life_state.as_str().to_string()),
                ..base
            },
            engine::Fate::Transient { steps } => JsFate { kind: "transient", steps: Some(steps), ..base },
        };
        to_js(&out)
    }

    /// Path creature by token id (decimal or `0x` hex), or `null` if not minted (or burned).
    #[wasm_bindgen(js_name = pathLifeform)]
    pub async fn path_lifeform(&self, token_id: &str) -> Result<JsValue, JsValue> {
        match self.client.reads().path_lifeform(parse_u256(token_id)?).await.map_err(err)? {
            Some(p) => to_js(&JsPath::of(&p)),
            None => Ok(JsValue::NULL),
        }
    }

    /// Per-token render params on the path NFT (`{ bg, cell, speed }`), or `null` if not minted.
    #[wasm_bindgen(js_name = pathRenderParams)]
    pub async fn path_render_params(&self, token_id: &str) -> Result<JsValue, JsValue> {
        match self.client.reads().path_render_params(parse_u256(token_id)?).await.map_err(err)? {
            Some(rp) => to_js(&rp),
            None => Ok(JsValue::NULL),
        }
    }

    /// The owner-only path `set_render_params` call for the wallet to sign + send.
    #[wasm_bindgen(js_name = setPathRenderParamsCall)]
    pub fn set_path_render_params_call(
        &self,
        token_id: &str,
        bg: u32,
        cell: u32,
        speed: u16,
    ) -> Result<JsValue, JsValue> {
        let call = self
            .client
            .writes()
            .set_path_render_params(parse_u256(token_id)?, RenderParams { bg, cell, speed });
        calls_to_js(&[("set_render_params", &call)])
    }

    /// The permissionless path `challenge_burn(older_id, younger_id, d4, dr, dc)` call — burns a
    /// proven forward sub-path OR symmetry copy and pays its escrow to the caller. `(0,0,0)` is
    /// the plain sub-path witness; get a symmetry witness from `findWitness`.
    #[wasm_bindgen(js_name = challengeBurnCall)]
    pub fn challenge_burn_call(
        &self,
        older_id: &str,
        younger_id: &str,
        d4: u8,
        dr: u8,
        dc: u8,
    ) -> Result<JsValue, JsValue> {
        let call = self
            .client
            .writes()
            .challenge_burn(parse_u256(older_id)?, parse_u256(younger_id)?, d4, dr, dc);
        calls_to_js(&[("challenge_burn", &call)])
    }

    /// The LOOP-side `challenge_burn(a_id, b_id, a_state, d4, dr, dc, k)` call. `a_rows` is A's
    /// canonical state (checked on-chain against its token id); `k` the phase within A's cycle.
    #[wasm_bindgen(js_name = challengeBurnLoopCall)]
    #[allow(clippy::too_many_arguments)]
    pub fn challenge_burn_loop_call(
        &self,
        a_id: &str,
        b_id: &str,
        a_rows: Vec<f64>,
        d4: u8,
        dr: u8,
        dc: u8,
        k: u32,
    ) -> Result<JsValue, JsValue> {
        let a_state = GridState::pack(&rows_from_js(a_rows)?);
        let call = self.client.writes().challenge_burn_loop(
            parse_u256(a_id)?,
            parse_u256(b_id)?,
            &a_state,
            d4,
            dr,
            dc,
            k,
        );
        calls_to_js(&[("challenge_burn", &call)])
    }

    /// Plan the transaction(s) to mint a PATH creature. `rows` = the path's start state; `sequence_length`
    /// = its distance to the loop; `loop_period` = the loop's period. Short paths mint in one tx; longer
    /// ones need tiling (not yet built) and come back `tooLong`. Same shape as `planLoopMint`.
    #[wasm_bindgen(js_name = planPathMint)]
    pub fn plan_path_mint(
        &self,
        rows: Vec<f64>,
        sequence_length: u32,
        loop_period: u32,
        recipient: &str,
        chunk_steps: u32,
        single_shot_max: u32,
        max_tx: u32,
    ) -> Result<JsValue, JsValue> {
        let start = rows_from_js(rows)?;
        let plan = self.client.writes().plan_path_mint(
            &start,
            sequence_length,
            loop_period,
            parse_felt(recipient)?,
            chunk_steps,
            single_shot_max,
            max_tx,
        );
        to_js(&js_plan(&plan))
    }
}

/// Shared JS shape for a mint plan (used by planLoopMint + planPathMint).
#[derive(Serialize)]
struct JsStep {
    label: String,
    calls: Vec<JsCall>,
}
#[derive(Serialize)]
struct JsPlan {
    steps: Vec<JsStep>,
    #[serde(rename = "txCount")]
    tx_count: u32,
    #[serde(rename = "singleShot")]
    single_shot: bool,
    #[serde(rename = "tooLong")]
    too_long: bool,
}
fn js_plan(plan: &gol_sdk::MintPlan) -> JsPlan {
    JsPlan {
        steps: plan
            .steps
            .iter()
            .map(|s| JsStep {
                label: s.label.clone(),
                calls: s
                    .calls
                    .iter()
                    .map(|c| JsCall {
                        contract_address: felt_to_hex(&c.to),
                        entrypoint: name_for_selector(&c.selector),
                        calldata: c.calldata.iter().map(felt_to_hex).collect(),
                    })
                    .collect(),
            })
            .collect(),
        tx_count: plan.tx_count,
        single_shot: plan.single_shot,
        too_long: plan.too_long,
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

/// Reverse-map a call's selector felt to its entry-point name (browser wallets take the name, not the
/// selector). Falls back to the selector hex for an unknown call.
fn name_for_selector(sel: &Felt) -> String {
    const NAMES: &[&str] = &[
        "approve",
        "mint_loop",
        "mint_partial_path",
        "combine_partial_path",
        "mint_loop_from_partial_paths",
        "mint_path",
        "mint_path_from_partial_paths",
        "move_lifeform_forward_n",
        "set_render_params",
        "transfer_from",
        "challenge_burn",
    ];
    for name in NAMES {
        if gol_sdk::encoding::selector(name) == *sel {
            return (*name).to_string();
        }
    }
    felt_to_hex(sel)
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
