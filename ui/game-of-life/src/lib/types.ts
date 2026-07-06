// JS shapes returned across the WASM boundary (felts/u256 as hex strings).
// Mirrors crates/gol-sdk-wasm/src/lib.rs (JsLifeform) and the decoded TokenUri.

export interface JsLifeform {
  token_id: string; // "0x…" (v2: a Poseidon hash, not the state)
  owner: string; // "0x…"
  is_loop: boolean;
  is_still: boolean;
  is_alive: boolean;
  is_dead: boolean;
  sequence_length: number;
  current_state: number[]; // v2: the 41 grid rows as bitmasks (row r, bit k = cell)
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
  animation_url?: string; // v2: data:text/html;base64,… (interactive renderer, no SVG image)
  attributes: JsAttribute[];
}
