//! The read seam. Implemented by [`crate::rpc::RpcReader`] now; an indexer-backed `DataSource`
//! can implement the ownership reads later behind the same trait.

use async_trait::async_trait;

use crate::config::ContractKey;
use crate::error::GolError;
use crate::types::{Felt, LifeformData, OwnedLifeform, OwnedPath, PathForm, RenderParams, TokenUri, U256};

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

    /// `get_discoverer` on the loop NFT — the mint's escrow payer (permanent artist attribution,
    /// v3). `None` when the token is unminted, the field is grandfathered (zero), or the call
    /// reverts because the deployed class predates the entrypoint.
    async fn discoverer(&self, token_id: U256) -> Result<Option<Felt>, GolError>;

    /// `get_discoverer` on the path NFT (wanderers) — same semantics as [`Self::discoverer`].
    async fn path_discoverer(&self, token_id: U256) -> Result<Option<Felt>, GolError>;

    /// NUT balance (`balance_of`).
    async fn nut_balance(&self, account: Felt) -> Result<U256, GolError>;

    /// NUT allowance (`allowance`).
    async fn nut_allowance(&self, owner: Felt, spender: Felt) -> Result<U256, GolError>;

    /// Decoded `token_uri` (ERC721 metadata + HTML renderer), or `None` if the token isn't minted.
    async fn token_uri(&self, token_id: U256) -> Result<Option<TokenUri>, GolError>;

    /// Per-token render params (`get_render_params`), or `None` if the token isn't minted.
    async fn render_params(&self, token_id: U256) -> Result<Option<RenderParams>, GolError>;

    /// PATH creature (owner + `get_path_data`) on the path NFT, or `None` if not minted.
    async fn path_lifeform(&self, token_id: U256) -> Result<Option<OwnedPath>, GolError>;

    /// `get_path_data` on the path NFT (returns the zeroed struct for an unminted id).
    async fn path_form(&self, token_id: U256) -> Result<Option<PathForm>, GolError>;

    /// Per-token render params on the path NFT, or `None` if not minted.
    async fn path_render_params(&self, token_id: U256) -> Result<Option<RenderParams>, GolError>;

    // NB: v2 exposes no on-chain step/loop-check views (v1 had iterate_life_*). That logic is the
    // pure off-chain engine in `crate::engine` (operating on `GridState`/`Rows`).

    /// Escape hatch for view functions not surfaced above.
    async fn call(
        &self,
        target: ContractKey,
        entrypoint: &str,
        calldata: &[Felt],
    ) -> Result<Vec<Felt>, GolError>;
}
