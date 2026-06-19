// JS shapes returned across the WASM boundary (felts/u256 as hex strings).
// Mirrors crates/gol-sdk-wasm/src/lib.rs (JsLifeform) and the decoded TokenUri.

export interface JsLifeform {
  token_id: string; // "0x…"
  owner: string; // "0x…"
  is_loop: boolean;
  is_still: boolean;
  is_alive: boolean;
  is_dead: boolean;
  sequence_length: number;
  current_state: string; // "0x…" packed grid
  age: number;
}

export interface JsAttribute {
  trait_type: string;
  value: string;
}

export interface JsTokenUri {
  raw: string;
  name?: string;
  description?: string;
  image?: string; // data:image/svg+xml;base64,…
  attributes: JsAttribute[];
}
