/* @ts-self-types="./gol_sdk_wasm.d.ts" */

export class GolSdk {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GolSdkFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_golsdk_free(ptr, 0);
    }
    /**
     * Current bond status for (creature, holder): `{ held, last_pet, reapable }`.
     * @param {string} creature_id
     * @param {string} holder
     * @returns {Promise<any>}
     */
    bondStatus(creature_id, holder) {
        const ptr0 = passStringToWasm0(creature_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(holder, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_bondStatus(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret;
    }
    /**
     * The `move_lifeform_forward_n(token_id, n)` call for the wallet to sign + send — advances `n`
     * generations and mints `n` NUT in one tx. `n` is clamped to >= 1 (the contract asserts n > 0).
     * @param {string} token_id
     * @param {number} n
     * @returns {any}
     */
    breatheLifeCall(token_id, n) {
        const ptr0 = passStringToWasm0(token_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_breatheLifeCall(this.__wbg_ptr, ptr0, len0, n);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * v3 feed-for: `move_lifeform_forward_n_for(token, n, beneficiary)` — the pet hook.
     * @param {string} token_id_hex
     * @param {number} n
     * @param {string} beneficiary
     * @returns {any}
     */
    breatheLifeForCall(token_id_hex, n, beneficiary) {
        const ptr0 = passStringToWasm0(token_id_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(beneficiary, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_breatheLifeForCall(this.__wbg_ptr, ptr0, len0, n, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * The permissionless path `challenge_burn(older_id, younger_id, d4, dr, dc)` call — burns a
     * proven forward sub-path OR symmetry copy and pays its escrow to the caller. `(0,0,0)` is
     * the plain sub-path witness; get a symmetry witness from `findWitness`.
     * @param {string} older_id
     * @param {string} younger_id
     * @param {number} d4
     * @param {number} dr
     * @param {number} dc
     * @returns {any}
     */
    challengeBurnCall(older_id, younger_id, d4, dr, dc) {
        const ptr0 = passStringToWasm0(older_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(younger_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_challengeBurnCall(this.__wbg_ptr, ptr0, len0, ptr1, len1, d4, dr, dc);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * The LOOP-side `challenge_burn(a_id, b_id, a_state, d4, dr, dc, k)` call. `a_rows` is A's
     * canonical state (checked on-chain against its token id); `k` the phase within A's cycle.
     * @param {string} a_id
     * @param {string} b_id
     * @param {Float64Array} a_rows
     * @param {number} d4
     * @param {number} dr
     * @param {number} dc
     * @param {number} k
     * @returns {any}
     */
    challengeBurnLoopCall(a_id, b_id, a_rows, d4, dr, dc, k) {
        const ptr0 = passStringToWasm0(a_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(b_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayF64ToWasm0(a_rows, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_challengeBurnLoopCall(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, d4, dr, dc, k);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Classify what a drawing settles into: `{ kind: "loop"|"path"|"transient", … }`.
     * - loop → `{ period, canonical: rows }` (mint a loop creature)
     * - path → `{ sequenceLength, loopPeriod, loopCanonical: rows, loopEntry: rows, lifeState }`
     * - transient → `{ steps }` (no loop within `max_steps`)
     * @param {Float64Array} rows
     * @param {number} max_steps
     * @returns {any}
     */
    classifyFate(rows, max_steps) {
        const ptr0 = passArrayF64ToWasm0(rows, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_classifyFate(this.__wbg_ptr, ptr0, len0, max_steps);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * The loop creature's discoverer (the mint's escrow payer) as a hex address, or `null`
     * (unminted, grandfathered pre-field mint, or the deployed class predates the entrypoint).
     * @param {string} token_id
     * @returns {Promise<any>}
     */
    discoverer(token_id) {
        const ptr0 = passStringToWasm0(token_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_discoverer(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * The v3 FAMILY token id for a drawn pattern — the id it would mint under (loops: pass the
     * period; paths/wanderers: pass 0). Use to detect "this creature already lives" before the
     * wallet ever opens: `lifeform(familyTokenId(...))` non-null ⇒ duplicate.
     * @param {Float64Array} rows
     * @param {number} period
     * @returns {any}
     */
    familyTokenId(rows, period) {
        const ptr0 = passArrayF64ToWasm0(rows, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_familyTokenId(this.__wbg_ptr, ptr0, len0, period);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Discover the loop reachable from `rows` within `max_period`: `{ period, smallest }` (the
     * canonical state to mint) or `null` if it doesn't recur in range.
     * @param {Float64Array} rows
     * @param {number} max_period
     * @returns {any}
     */
    findLoop(rows, max_period) {
        const ptr0 = passArrayF64ToWasm0(rows, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_findLoop(this.__wbg_ptr, ptr0, len0, max_period);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Search for a challenge witness relating two start states:
     * `{ d4, dr, dc, k }` with `apply_symmetry(g, step^k(a)) == b`, or `null`. For paths pass
     * `max_k` = the sequence-length gap; for loops `max_k` = period − 1.
     * @param {Float64Array} a_rows
     * @param {Float64Array} b_rows
     * @param {number} max_k
     * @returns {any}
     */
    findWitness(a_rows, b_rows, max_k) {
        const ptr0 = passArrayF64ToWasm0(a_rows, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF64ToWasm0(b_rows, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_findWitness(this.__wbg_ptr, ptr0, len0, ptr1, len1, max_k);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @returns {Promise<any>}
     */
    gridSize() {
        const ret = wasm.golsdk_gridSize(this.__wbg_ptr);
        return ret;
    }
    /**
     * Lifeform by token id (decimal or `0x` hex), or `null` if unminted.
     * @param {string} token_id
     * @returns {Promise<any>}
     */
    lifeform(token_id) {
        const ptr0 = passStringToWasm0(token_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_lifeform(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * `[approve, mint_loop]` calls for the wallet to sign + send. v3: `rows` may be ANY state of
     * the loop (the drawn orientation is preserved for display); the orbit canonical + witness
     * are computed here and ride in the calldata.
     * @param {Float64Array} rows
     * @param {number} loop_length
     * @param {string} recipient
     * @returns {any}
     */
    mintLoopCalls(rows, loop_length, recipient) {
        const ptr0 = passArrayF64ToWasm0(rows, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(recipient, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_mintLoopCalls(this.__wbg_ptr, ptr0, len0, loop_length, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * `network`: "sepolia" | "mainnet". `rpc_url` overrides the default node.
     * @param {string} network
     * @param {string | null} [rpc_url]
     */
    constructor(network, rpc_url) {
        const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(rpc_url) ? 0 : passStringToWasm0(rpc_url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_new(ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        GolSdkFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * NUT balance as a `0x` hex string (wrap with `BigInt()` in JS).
     * @param {string} address
     * @returns {Promise<any>}
     */
    nutBalance(address) {
        const ptr0 = passStringToWasm0(address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_nutBalance(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * Lifeforms currently owned by `address`, via the RPC event scan.
     * @param {string} address
     * @returns {Promise<any>}
     */
    ownedLifeforms(address) {
        const ptr0 = passStringToWasm0(address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_ownedLifeforms(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * The wanderer's discoverer as a hex address, or `null` — same semantics as `discoverer`.
     * @param {string} token_id
     * @returns {Promise<any>}
     */
    pathDiscoverer(token_id) {
        const ptr0 = passStringToWasm0(token_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_pathDiscoverer(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * Path creature by token id (decimal or `0x` hex), or `null` if not minted (or burned).
     * @param {string} token_id
     * @returns {Promise<any>}
     */
    pathLifeform(token_id) {
        const ptr0 = passStringToWasm0(token_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_pathLifeform(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * Per-token render params on the path NFT (`{ bg, cell, speed }`), or `null` if not minted.
     * @param {string} token_id
     * @returns {Promise<any>}
     */
    pathRenderParams(token_id) {
        const ptr0 = passStringToWasm0(token_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_pathRenderParams(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * `pets.pet(creature_id)` — the ceremonial breath (feeds 1 gen, NUT to caller, bond+clock).
     * @param {string} creature_id
     * @returns {any}
     */
    petCall(creature_id) {
        const ptr0 = passStringToWasm0(creature_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_petCall(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Every (creature, holder) pair that has ever petted (deduped, newest first):
     * `[{ creature_id, holder }]` — the caretaker graph. Filter with `bondStatus`.
     * @returns {Promise<any>}
     */
    petPairs() {
        const ret = wasm.golsdk_petPairs(this.__wbg_ptr);
        return ret;
    }
    /**
     * Plan the full transaction sequence to mint a loop. `rows` = the loop's canonical (smallest)
     * state; `loop_length` = its period. Short loops are a single `mint_loop` tx; long loops (whose
     * on-chain verification exceeds the wallet's per-tx gas cap) are tiled into partial-path segments
     * the wallet signs in sequence. Returns
     * `{ steps: [{ label, calls: [{contractAddress, entrypoint, calldata}] }], txCount, singleShot, tooLong }`.
     * Each `step` is one transaction (a multicall); fire them in order, awaiting each.
     * @param {Float64Array} rows
     * @param {number} loop_length
     * @param {string} recipient
     * @param {number} chunk_steps
     * @param {number} single_shot_max
     * @param {number} max_tx
     * @returns {any}
     */
    planLoopMint(rows, loop_length, recipient, chunk_steps, single_shot_max, max_tx) {
        const ptr0 = passArrayF64ToWasm0(rows, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(recipient, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_planLoopMint(this.__wbg_ptr, ptr0, len0, loop_length, ptr1, len1, chunk_steps, single_shot_max, max_tx);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Plan the transaction(s) to mint a PATH creature. `rows` = the path's start state; `sequence_length`
     * = its distance to the loop; `loop_period` = the loop's period. Short paths mint in one tx; longer
     * ones need tiling (not yet built) and come back `tooLong`. Same shape as `planLoopMint`.
     * @param {Float64Array} rows
     * @param {number} sequence_length
     * @param {number} loop_period
     * @param {string} recipient
     * @param {number} chunk_steps
     * @param {number} single_shot_max
     * @param {number} max_tx
     * @returns {any}
     */
    planPathMint(rows, sequence_length, loop_period, recipient, chunk_steps, single_shot_max, max_tx) {
        const ptr0 = passArrayF64ToWasm0(rows, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(recipient, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_planPathMint(this.__wbg_ptr, ptr0, len0, sequence_length, loop_period, ptr1, len1, chunk_steps, single_shot_max, max_tx);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * v3 `prove_malformed` call for a LOOP (witness `(d4, dr, dc, k)` exhibits a smaller family
     * member; bounty = the token's escrow).
     * @param {string} token_id_hex
     * @param {number} d4
     * @param {number} dr
     * @param {number} dc
     * @param {number} k
     * @returns {any}
     */
    proveMalformedLoopCall(token_id_hex, d4, dr, dc, k) {
        const ptr0 = passStringToWasm0(token_id_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_proveMalformedLoopCall(this.__wbg_ptr, ptr0, len0, d4, dr, dc, k);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * v3 `prove_malformed` call for a WANDERER (no phase).
     * @param {string} token_id_hex
     * @param {number} d4
     * @param {number} dr
     * @param {number} dc
     * @returns {any}
     */
    proveMalformedWandererCall(token_id_hex, d4, dr, dc) {
        const ptr0 = passStringToWasm0(token_id_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_proveMalformedWandererCall(this.__wbg_ptr, ptr0, len0, d4, dr, dc);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * `pets.reap(creature_id, holder)` — burn a lapsed bond, 1 NUT minted to the caller.
     * @param {string} creature_id
     * @param {string} holder
     * @returns {any}
     */
    reapCall(creature_id, holder) {
        const ptr0 = passStringToWasm0(creature_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(holder, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_reapCall(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Every minted lifeform (newest first), capped at `limit` (0 = unlimited), via the RPC event
     * scan. The global gallery feed on Sepolia. Each is confirmed live (current owner + state).
     * @param {number} limit
     * @returns {Promise<any>}
     */
    recentLifeforms(limit) {
        const ret = wasm.golsdk_recentLifeforms(this.__wbg_ptr, limit);
        return ret;
    }
    /**
     * Loop mints with their block numbers, newest first: `[{ token_id, block }]` — the recency
     * source for time-windowed leaderboards ("discovery of the week").
     * @returns {Promise<any>}
     */
    recentMints() {
        const ret = wasm.golsdk_recentMints(this.__wbg_ptr);
        return ret;
    }
    /**
     * Path mints with their block numbers, newest first (burned paths still listed — hydrate to
     * filter): `[{ token_id, block }]`.
     * @returns {Promise<any>}
     */
    recentPathMints() {
        const ret = wasm.golsdk_recentPathMints(this.__wbg_ptr);
        return ret;
    }
    /**
     * Token ids ("0x…") of recent PATH mints, newest first — the fast event scan of the path NFT.
     * Hydrate each via `pathLifeform()`; burned paths hydrate to null and should be skipped.
     * @param {number} limit
     * @returns {Promise<any>}
     */
    recentPathTokenIds(limit) {
        const ret = wasm.golsdk_recentPathTokenIds(this.__wbg_ptr, limit);
        return ret;
    }
    /**
     * Every minted PATH creature (newest first), capped at `limit` (0 = unlimited), hydrated in ~2
     * batched round-trips (owner + state). The batched counterpart to `recentPathTokenIds` + per-id
     * `pathLifeform`; burned paths are already dropped.
     * @param {number} limit
     * @returns {Promise<any>}
     */
    recentPaths(limit) {
        const ret = wasm.golsdk_recentPaths(this.__wbg_ptr, limit);
        return ret;
    }
    /**
     * Token ids ("0x…") of recent mints, newest first — the FAST event scan only (no per-token
     * reads). For progressive UIs: get the ids, then hydrate each via `lifeform()` as it renders.
     * @param {number} limit
     * @returns {Promise<any>}
     */
    recentTokenIds(limit) {
        const ret = wasm.golsdk_recentTokenIds(this.__wbg_ptr, limit);
        return ret;
    }
    /**
     * Per-token render params (`{ bg, cell, speed }`), or `null` if unminted.
     * @param {string} token_id
     * @returns {Promise<any>}
     */
    renderParams(token_id) {
        const ptr0 = passStringToWasm0(token_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_renderParams(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * The owner-only path `set_render_params` call for the wallet to sign + send.
     * @param {string} token_id
     * @param {number} bg
     * @param {number} cell
     * @param {number} speed
     * @returns {any}
     */
    setPathRenderParamsCall(token_id, bg, cell, speed) {
        const ptr0 = passStringToWasm0(token_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_setPathRenderParamsCall(this.__wbg_ptr, ptr0, len0, bg, cell, speed);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * The owner-only `set_render_params` call for the wallet to sign + send.
     * @param {string} token_id
     * @param {number} bg
     * @param {number} cell
     * @param {number} speed
     * @returns {any}
     */
    setRenderParamsCall(token_id, bg, cell, speed) {
        const ptr0 = passStringToWasm0(token_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_setRenderParamsCall(this.__wbg_ptr, ptr0, len0, bg, cell, speed);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * One Conway generation (41 row bitmasks in, 41 out) — the pure off-chain engine, for
     * client-side preview/animation without a chain round-trip.
     * @param {Float64Array} rows
     * @returns {any}
     */
    stepRows(rows) {
        const ptr0 = passArrayF64ToWasm0(rows, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_stepRows(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Lexicographically smallest grid in the full 13,448-element symmetry orbit —
     * `{ canonical: rows, d4, dr, dc }`. Two grids are symmetry copies iff their orbit canonicals
     * match: the copy-detection key for mint warnings and indexer dedup.
     * @param {Float64Array} rows
     * @returns {any}
     */
    symmetryCanonical(rows) {
        const ptr0 = passArrayF64ToWasm0(rows, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_symmetryCanonical(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * The token id (`0x` hex) for a grid given as 41 row bitmasks — the off-chain Poseidon identity
     * the contract uses; lets the frontend look up or pre-compute a token before minting.
     * @param {Float64Array} rows
     * @returns {any}
     */
    tokenIdForRows(rows) {
        const ptr0 = passArrayF64ToWasm0(rows, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_tokenIdForRows(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Decoded `token_uri` (name/description/animation_url/attributes), or `null`.
     * @param {string} token_id
     * @returns {Promise<any>}
     */
    tokenUri(token_id) {
        const ptr0 = passStringToWasm0(token_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_tokenUri(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * Total generations breathed per account, descending: `[{ address, generations }]` — the
     * "top breathers" board (NUT faucet mints aggregated; the initial-supply mint excluded).
     * @returns {Promise<any>}
     */
    topBreathers() {
        const ret = wasm.golsdk_topBreathers(this.__wbg_ptr);
        return ret;
    }
    /**
     * `pets.transfer_bond(creature_id, to)` — daycare hand-off (the clock rides along).
     * @param {string} creature_id
     * @param {string} to
     * @returns {any}
     */
    transferBondCall(creature_id, to) {
        const ptr0 = passStringToWasm0(creature_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(to, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.golsdk_transferBondCall(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
}
if (Symbol.dispose) GolSdk.prototype[Symbol.dispose] = GolSdk.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_fdd633d4bb5dd76a: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_String_8564e559799eccda: function(arg0, arg1) {
            const ret = String(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_debug_string_8a447059637473e2: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_is_function_acc5528be2b923f2: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_object_0beba4a1980d3eea: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_undefined_721f8decd50c87a3: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_string_get_71bb4348194e31f0: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_ea4887a5f8f9a9db: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_33c39e13d73b25f6: function(arg0) {
            arg0._wbg_cb_unref();
        },
        __wbg_abort_6e6ea7d259504afc: function(arg0) {
            arg0.abort();
        },
        __wbg_abort_9e39323f373e2585: function(arg0, arg1) {
            arg0.abort(arg1);
        },
        __wbg_append_912a8705e9b6a483: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            arg0.append(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
        }, arguments); },
        __wbg_arrayBuffer_ff96d08b7b6be32e: function() { return handleError(function (arg0) {
            const ret = arg0.arrayBuffer();
            return ret;
        }, arguments); },
        __wbg_call_5575218572ead796: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_call_8e98ed2f3c86c4b5: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.call(arg1);
            return ret;
        }, arguments); },
        __wbg_clearTimeout_6b8d9a38b9263d65: function(arg0) {
            const ret = clearTimeout(arg0);
            return ret;
        },
        __wbg_done_b62d4a7d2286852a: function(arg0) {
            const ret = arg0.done;
            return ret;
        },
        __wbg_error_a6fa202b58aa1cd3: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_fetch_9dad4fe911207b37: function(arg0) {
            const ret = fetch(arg0);
            return ret;
        },
        __wbg_fetch_db87be8a748781a2: function(arg0, arg1) {
            const ret = arg0.fetch(arg1);
            return ret;
        },
        __wbg_get_9a29be2cb383ed9a: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_has_4f060fe202ad7e87: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.has(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_headers_d9123c649c85d441: function(arg0) {
            const ret = arg0.headers;
            return ret;
        },
        __wbg_instanceof_Response_79948c98d1d2ba75: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Response;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_iterator_cc47ba25a2be735a: function() {
            const ret = Symbol.iterator;
            return ret;
        },
        __wbg_length_589238bdcf171f0e: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_new_10e2f2ad134f940f: function() { return handleError(function () {
            const ret = new Headers();
            return ret;
        }, arguments); },
        __wbg_new_227d7c05414eb861: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_new_2e117a478906f062: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_36e147a8ced3c6e0: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_51233fa2a760b272: function() { return handleError(function () {
            const ret = new AbortController();
            return ret;
        }, arguments); },
        __wbg_new_81880fb5002cb255: function(arg0) {
            const ret = new Uint8Array(arg0);
            return ret;
        },
        __wbg_new_from_slice_543b875b27789a8f: function(arg0, arg1) {
            const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_typed_00a409eb4ec4f2d9: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return wasm_bindgen__convert__closures_____invoke__h3fd1d41b9588f30c(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = 0;
            }
        },
        __wbg_new_with_str_and_init_5b299538bdeeec64: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = new Request(getStringFromWasm0(arg0, arg1), arg2);
            return ret;
        }, arguments); },
        __wbg_next_0c4066e251d2eff9: function() { return handleError(function (arg0) {
            const ret = arg0.next();
            return ret;
        }, arguments); },
        __wbg_next_402fa10b59ab20c3: function(arg0) {
            const ret = arg0.next;
            return ret;
        },
        __wbg_prototypesetcall_d721637c7ca66eb8: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_queueMicrotask_1c9b3800e321a967: function(arg0) {
            const ret = arg0.queueMicrotask;
            return ret;
        },
        __wbg_queueMicrotask_311744e534a929a3: function(arg0) {
            queueMicrotask(arg0);
        },
        __wbg_resolve_d82363d90af6928a: function(arg0) {
            const ret = Promise.resolve(arg0);
            return ret;
        },
        __wbg_setTimeout_f757f00851f76c42: function(arg0, arg1) {
            const ret = setTimeout(arg0, arg1);
            return ret;
        },
        __wbg_set_6be42768c690e380: function(arg0, arg1, arg2) {
            arg0[arg1] = arg2;
        },
        __wbg_set_body_97c25d1c0051cb04: function(arg0, arg1) {
            arg0.body = arg1;
        },
        __wbg_set_cache_47f0e68e0309bb63: function(arg0, arg1) {
            arg0.cache = __wbindgen_enum_RequestCache[arg1];
        },
        __wbg_set_credentials_8dece1804391d22f: function(arg0, arg1) {
            arg0.credentials = __wbindgen_enum_RequestCredentials[arg1];
        },
        __wbg_set_dc601f4a69da0bc2: function(arg0, arg1, arg2) {
            arg0[arg1 >>> 0] = arg2;
        },
        __wbg_set_headers_6751c09a8e579ff7: function(arg0, arg1) {
            arg0.headers = arg1;
        },
        __wbg_set_method_1120482abe0934aa: function(arg0, arg1, arg2) {
            arg0.method = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_mode_e41f820af904cdaa: function(arg0, arg1) {
            arg0.mode = __wbindgen_enum_RequestMode[arg1];
        },
        __wbg_set_signal_4a69430cb12800f3: function(arg0, arg1) {
            arg0.signal = arg1;
        },
        __wbg_signal_4d9d567be73ea52c: function(arg0) {
            const ret = arg0.signal;
            return ret;
        },
        __wbg_stack_3b0d974bbf31e44f: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_static_accessor_GLOBAL_THIS_2fee5048bcca5938: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_ce44e66a4935da8c: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_44f6e0cb5e67cdad: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_168f178805d978fe: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_status_0053aa6239760447: function(arg0) {
            const ret = arg0.status;
            return ret;
        },
        __wbg_stringify_747a843de2eb6359: function() { return handleError(function (arg0) {
            const ret = JSON.stringify(arg0);
            return ret;
        }, arguments); },
        __wbg_then_05edfc8a4fea5106: function(arg0, arg1, arg2) {
            const ret = arg0.then(arg1, arg2);
            return ret;
        },
        __wbg_then_591b6b3a75ee817a: function(arg0, arg1) {
            const ret = arg0.then(arg1);
            return ret;
        },
        __wbg_url_0e0eeabf01fb5519: function(arg0, arg1) {
            const ret = arg1.url;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_value_49f783bb59765962: function(arg0) {
            const ret = arg0.value;
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 296, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__h74bcc3753d680b42);
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [], shim_idx: 268, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__hc0e1ada004448962);
            return ret;
        },
        __wbindgen_cast_0000000000000003: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000004: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000005: function(arg0) {
            // Cast intrinsic for `U64 -> Externref`.
            const ret = BigInt.asUintN(64, arg0);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./gol_sdk_wasm_bg.js": import0,
    };
}

function wasm_bindgen__convert__closures_____invoke__hc0e1ada004448962(arg0, arg1) {
    wasm.wasm_bindgen__convert__closures_____invoke__hc0e1ada004448962(arg0, arg1);
}

function wasm_bindgen__convert__closures_____invoke__h74bcc3753d680b42(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen__convert__closures_____invoke__h74bcc3753d680b42(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen__convert__closures_____invoke__h3fd1d41b9588f30c(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen__convert__closures_____invoke__h3fd1d41b9588f30c(arg0, arg1, arg2, arg3);
}


const __wbindgen_enum_RequestCache = ["default", "no-store", "reload", "no-cache", "force-cache", "only-if-cached"];


const __wbindgen_enum_RequestCredentials = ["omit", "same-origin", "include"];


const __wbindgen_enum_RequestMode = ["same-origin", "no-cors", "cors", "navigate"];
const GolSdkFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_golsdk_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => wasm.__wbindgen_destroy_closure(state.a, state.b));

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, f) {
    const state = { a: arg0, b: arg1, cnt: 1 };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            wasm.__wbindgen_destroy_closure(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedFloat64ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('gol_sdk_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
