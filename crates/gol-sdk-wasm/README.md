# gol-sdk-wasm

WebAssembly bindings for [`gol-sdk`](../gol-sdk) — the surface the web frontend imports. Exposes
**reads + call-building**; signing/broadcast stays in JS (the browser wallet via get-starknet).

## Build

```bash
rustup target add wasm32-unknown-unknown            # once
cargo install wasm-pack                              # once (or the prebuilt installer)
wasm-pack build crates/gol-sdk-wasm --target web     # -> crates/gol-sdk-wasm/pkg/
```

## Use

```ts
import init, { GolSdk } from "gol-sdk-wasm"; // the wasm-pack pkg
await init();

const sdk = new GolSdk("sepolia");                  // or new GolSdk("sepolia", rpcUrl)
const lf    = await sdk.lifeform("98307");           // { token_id, owner, is_loop, … } | null
const uri   = await sdk.tokenUri("98307");           // { name, image, attributes, … } | null
const owned = await sdk.ownedLifeforms(address);     // JsLifeform[]
const bal   = await sdk.nutBalance(address);         // "0x…"  → BigInt(bal)

// writes: the SDK builds the calls, the wallet signs + sends
const calls = sdk.mintLoopCalls("0x18003", 4, recipient); // [{ contractAddress, entrypoint, calldata }]
await walletAccount.execute(calls);                  // get-starknet
```

Token ids accept decimal or `0x` hex; felts/u256 cross the boundary as hex strings (no bigint
precision loss). `ownedLifeforms` scans events from genesis — fine for now; back it with the
indexer route or a deploy-block bound for scale.

See the parent [README](../gol-sdk/README.md) and [docs/sdk-plan.md](../../docs/sdk-plan.md).
