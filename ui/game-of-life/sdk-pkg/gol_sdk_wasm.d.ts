/* tslint:disable */
/* eslint-disable */

export class GolSdk {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The `move_lifeform_forward_n(token_id, n)` call for the wallet to sign + send — advances `n`
     * generations and mints `n` NUT in one tx. `n` is clamped to >= 1 (the contract asserts n > 0).
     */
    breatheLifeCall(token_id: string, n: number): any;
    /**
     * Discover the loop reachable from `rows` within `max_period`: `{ period, smallest }` (the
     * canonical state to mint) or `null` if it doesn't recur in range.
     */
    findLoop(rows: Float64Array, max_period: number): any;
    gridSize(): Promise<any>;
    /**
     * Lifeform by token id (decimal or `0x` hex), or `null` if unminted.
     */
    lifeform(token_id: string): Promise<any>;
    /**
     * `[approve, mint_loop]` calls for the wallet to sign + send. `rows` is the loop's canonical
     * (smallest) state as 41 row bitmasks.
     */
    mintLoopCalls(rows: Float64Array, loop_length: number, recipient: string): any;
    /**
     * `network`: "sepolia" | "mainnet". `rpc_url` overrides the default node.
     */
    constructor(network: string, rpc_url?: string | null);
    /**
     * NUT balance as a `0x` hex string (wrap with `BigInt()` in JS).
     */
    nutBalance(address: string): Promise<any>;
    /**
     * Lifeforms currently owned by `address`, via the RPC event scan.
     */
    ownedLifeforms(address: string): Promise<any>;
    /**
     * Plan the full transaction sequence to mint a loop. `rows` = the loop's canonical (smallest)
     * state; `loop_length` = its period. Short loops are a single `mint_loop` tx; long loops (whose
     * on-chain verification exceeds the wallet's per-tx gas cap) are tiled into partial-path segments
     * the wallet signs in sequence. Returns
     * `{ steps: [{ label, calls: [{contractAddress, entrypoint, calldata}] }], txCount, singleShot, tooLong }`.
     * Each `step` is one transaction (a multicall); fire them in order, awaiting each.
     */
    planLoopMint(rows: Float64Array, loop_length: number, recipient: string, chunk_steps: number, single_shot_max: number, max_tx: number): any;
    /**
     * Every minted lifeform (newest first), capped at `limit` (0 = unlimited), via the RPC event
     * scan. The global gallery feed on Sepolia. Each is confirmed live (current owner + state).
     */
    recentLifeforms(limit: number): Promise<any>;
    /**
     * Token ids ("0x…") of recent mints, newest first — the FAST event scan only (no per-token
     * reads). For progressive UIs: get the ids, then hydrate each via `lifeform()` as it renders.
     */
    recentTokenIds(limit: number): Promise<any>;
    /**
     * Per-token render params (`{ bg, cell, speed }`), or `null` if unminted.
     */
    renderParams(token_id: string): Promise<any>;
    /**
     * The owner-only `set_render_params` call for the wallet to sign + send.
     */
    setRenderParamsCall(token_id: string, bg: number, cell: number, speed: number): any;
    /**
     * One Conway generation (41 row bitmasks in, 41 out) — the pure off-chain engine, for
     * client-side preview/animation without a chain round-trip.
     */
    stepRows(rows: Float64Array): any;
    /**
     * The token id (`0x` hex) for a grid given as 41 row bitmasks — the off-chain Poseidon identity
     * the contract uses; lets the frontend look up or pre-compute a token before minting.
     */
    tokenIdForRows(rows: Float64Array): any;
    /**
     * Decoded `token_uri` (name/description/animation_url/attributes), or `null`.
     */
    tokenUri(token_id: string): Promise<any>;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_golsdk_free: (a: number, b: number) => void;
    readonly golsdk_breatheLifeCall: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly golsdk_findLoop: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly golsdk_gridSize: (a: number) => any;
    readonly golsdk_lifeform: (a: number, b: number, c: number) => any;
    readonly golsdk_mintLoopCalls: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly golsdk_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly golsdk_nutBalance: (a: number, b: number, c: number) => any;
    readonly golsdk_ownedLifeforms: (a: number, b: number, c: number) => any;
    readonly golsdk_planLoopMint: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number];
    readonly golsdk_recentLifeforms: (a: number, b: number) => any;
    readonly golsdk_recentTokenIds: (a: number, b: number) => any;
    readonly golsdk_renderParams: (a: number, b: number, c: number) => any;
    readonly golsdk_setRenderParamsCall: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly golsdk_stepRows: (a: number, b: number, c: number) => [number, number, number];
    readonly golsdk_tokenIdForRows: (a: number, b: number, c: number) => [number, number, number];
    readonly golsdk_tokenUri: (a: number, b: number, c: number) => any;
    readonly wasm_bindgen__convert__closures_____invoke__h74bcc3753d680b42: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__h3fd1d41b9588f30c: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__hc0e1ada004448962: (a: number, b: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
