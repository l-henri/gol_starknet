//! The ownership/enumeration seam. Two implementations behind one trait:
//! [`EventScanDataSource`] (raw `starknet_getEvents`, no API key — works on any node) and
//! [`IndexerDataSource`] (Starkscan REST, pre-indexed — fast, needs a key). The operator picks.
//!
//! Both reconstruct ownership from `Transfer` events (there's no first-class ERC721-holdings
//! endpoint), then confirm current ownership with `owner_of` + fetch live data via the RPC reader —
//! so a later transfer or burn can't produce a stale result.

mod event_scan;
mod indexer;

pub use event_scan::EventScanDataSource;
pub use indexer::IndexerDataSource;

use async_trait::async_trait;
use std::collections::HashSet;

use crate::error::GolError;
use crate::reader::Reader;
use crate::rpc::RpcReader;
use crate::types::{Felt, OwnedLifeform, U256};

/// A `NewMove` activity entry.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MoveEvent {
    pub token_id: U256,
    pub age: u32,
    pub block_number: u64,
    pub tx_hash: Felt,
}

#[async_trait]
pub trait DataSource: Send + Sync {
    /// Lifeforms currently owned by `owner`.
    async fn owned_lifeforms(&self, owner: Felt) -> Result<Vec<OwnedLifeform>, GolError>;
    /// A single lifeform (owner + current state), or `None` if unminted.
    async fn lifeform(&self, token_id: U256) -> Result<Option<OwnedLifeform>, GolError>;
    /// `NewMove` activity, most-recent first, capped at `limit` (0 = unlimited). Optionally for one token.
    async fn activity(&self, token_id: Option<U256>, limit: u32) -> Result<Vec<MoveEvent>, GolError>;
}

/// Given candidate token ids, keep those `owner` still holds, with their live data.
/// `owner_of` is the source of truth — candidates from event history are only a shortlist.
pub(crate) async fn confirm_owned<I>(
    reader: &RpcReader,
    owner: Felt,
    token_ids: I,
) -> Result<Vec<OwnedLifeform>, GolError>
where
    I: IntoIterator<Item = U256>,
{
    let mut out = Vec::new();
    for tid in token_ids {
        if let Some(lf) = reader.lifeform(tid).await? {
            if lf.owner == owner {
                out.push(lf);
            }
        }
    }
    Ok(out)
}

/// Dedupe token ids preserving first-seen order.
pub(crate) fn dedupe(ids: impl IntoIterator<Item = U256>) -> Vec<U256> {
    let mut seen = HashSet::new();
    ids.into_iter()
        .filter(|t| seen.insert((t.low, t.high)))
        .collect()
}
