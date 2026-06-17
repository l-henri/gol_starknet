//! Event names + selector helpers. Full typed decoders land with the `DataSource` (the event-scan
//! impl should track ERC721 `Transfer` as the authoritative ownership signal — `NewLifeForm`
//! covers mints only and misses transfers).

use crate::encoding::selector;
use crate::types::Felt;

/// `(owner, token_id, lifeform_data)` — emitted on mint.
pub const NEW_LIFE_FORM: &str = "NewLifeForm";
/// `(token_id, age)` — emitted on each `move_lifeform_forward`.
pub const NEW_MOVE: &str = "NewMove";
/// ERC721 `(from, to, token_id)` — authoritative ownership.
pub const TRANSFER: &str = "Transfer";

/// Event key (selector) for an event name.
pub fn event_key(name: &str) -> Felt {
    selector(name)
}
