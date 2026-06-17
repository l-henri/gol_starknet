//! The read seam. Implemented by [`crate::rpc::RpcReader`] now; an indexer-backed `DataSource`
//! can implement the ownership reads later behind the same trait.

use async_trait::async_trait;

use crate::config::ContractKey;
use crate::error::GolError;
use crate::types::{Felt, LifeformData, LoopCheck, OwnedLifeform, TokenUri, U256};

#[async_trait(?Send)]
// `?Send` so the same trait compiles on wasm32, where reqwest's fetch-backed futures are !Send.
pub trait Reader {
    /// Grid edge length (`get_grid_size`).
    async fn grid_size(&self) -> Result<u32, GolError>;

    /// Owner + on-chain state, or `None` if the token isn't minted.
    async fn lifeform(&self, token_id: U256) -> Result<Option<OwnedLifeform>, GolError>;

    /// `get_lifeform_data` (returns the zeroed struct for an unminted id; `None` only on revert).
    async fn lifeform_data(&self, token_id: U256) -> Result<Option<LifeformData>, GolError>;

    /// `owner_of`, or `None` if the token isn't minted.
    async fn owner_of(&self, token_id: U256) -> Result<Option<Felt>, GolError>;

    /// NUT balance (`balance_of`).
    async fn nut_balance(&self, account: Felt) -> Result<U256, GolError>;

    /// NUT allowance (`allowance`).
    async fn nut_allowance(&self, owner: Felt, spender: Felt) -> Result<U256, GolError>;

    /// Decoded `token_uri` (ERC721 metadata + grid SVG), or `None` if the token isn't minted.
    async fn token_uri(&self, token_id: U256) -> Result<Option<TokenUri>, GolError>;

    // on-chain GoL engine views (off-chain discovery stays in the app):
    async fn iterate_once(&self, state: U256) -> Result<U256, GolError>;
    async fn iterate_several(&self, state: U256, generations: u32) -> Result<Vec<U256>, GolError>;
    async fn is_single_loop(&self, state: U256, generations: u32) -> Result<LoopCheck, GolError>;

    /// Escape hatch for view functions not surfaced above.
    async fn call(
        &self,
        target: ContractKey,
        entrypoint: &str,
        calldata: &[Felt],
    ) -> Result<Vec<Felt>, GolError>;
}
