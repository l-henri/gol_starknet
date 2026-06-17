//! `DataSource` backed by raw `starknet_getEvents`. No API key; works against any node. Reconstructs
//! ownership from `Transfer` events filtered to the owner, then confirms via `owner_of`.
//!
//! Event layouts verified on Sepolia (lifeforms `0x0535…`):
//! - Transfer: `keys = [selector, from, to, token_id.low, token_id.high]`, `data = []`
//! - NewMove:  `keys = [selector]`, `data = [token_id.low, token_id.high, age]`

use async_trait::async_trait;

use crate::config::GolAddresses;
use crate::datasource::{confirm_owned, dedupe, DataSource, MoveEvent};
use crate::encoding::selector;
use crate::error::GolError;
use crate::rpc::{RawEvent, RpcReader};
use crate::types::{felt_to_u128, Felt, OwnedLifeform, U256};

pub struct EventScanDataSource {
    reader: RpcReader,
    addresses: GolAddresses,
    from_block: u64,
}

impl EventScanDataSource {
    pub fn new(rpc_url: impl Into<String>, addresses: GolAddresses) -> Self {
        let rpc_url = rpc_url.into();
        Self {
            reader: RpcReader::new(rpc_url, addresses.clone()),
            addresses,
            from_block: 0,
        }
    }

    /// Start scans from a known deployment block instead of genesis (fewer empty windows).
    pub fn from_deploy_block(mut self, block: u64) -> Self {
        self.from_block = block;
        self
    }

    /// Page through every matching event, following the continuation token.
    async fn scan_all(&self, address: Felt, keys: Vec<Vec<Felt>>) -> Result<Vec<RawEvent>, GolError> {
        let mut all = Vec::new();
        let mut continuation = None;
        loop {
            let (events, next) = self
                .reader
                .get_events(address, keys.clone(), self.from_block, 100, continuation)
                .await?;
            all.extend(events);
            match next {
                Some(token) => continuation = Some(token),
                None => break,
            }
        }
        Ok(all)
    }
}

#[async_trait]
impl DataSource for EventScanDataSource {
    async fn owned_lifeforms(&self, owner: Felt) -> Result<Vec<OwnedLifeform>, GolError> {
        // Transfers INTO `owner`: filter keys = [Transfer, <any from>, owner].
        let keys = vec![vec![selector("Transfer")], vec![], vec![owner]];
        let events = self.scan_all(self.addresses.lifeforms, keys).await?;
        let candidates = dedupe(events.iter().filter_map(|ev| {
            // keys = [selector, from, to, token_id.low, token_id.high]
            (ev.keys.len() >= 5).then(|| U256::from_felts(&ev.keys[3], &ev.keys[4]))
        }));
        confirm_owned(&self.reader, owner, candidates).await
    }

    async fn lifeform(&self, token_id: U256) -> Result<Option<OwnedLifeform>, GolError> {
        use crate::reader::Reader;
        self.reader.lifeform(token_id).await
    }

    async fn activity(&self, token_id: Option<U256>, limit: u32) -> Result<Vec<MoveEvent>, GolError> {
        let keys = vec![vec![selector("NewMove")]];
        let events = self.scan_all(self.addresses.lifeforms, keys).await?;
        let mut out: Vec<MoveEvent> = events
            .iter()
            .filter_map(|ev| {
                // data = [token_id.low, token_id.high, age]
                if ev.data.len() < 3 {
                    return None;
                }
                let tid = U256::from_felts(&ev.data[0], &ev.data[1]);
                if let Some(filter) = token_id {
                    if filter != tid {
                        return None;
                    }
                }
                Some(MoveEvent {
                    token_id: tid,
                    age: felt_to_u128(&ev.data[2]) as u32,
                    block_number: ev.block_number,
                    tx_hash: ev.tx_hash,
                })
            })
            .collect();
        out.reverse(); // getEvents returns ascending; we want most-recent first
        if limit > 0 {
            out.truncate(limit as usize);
        }
        Ok(out)
    }
}
