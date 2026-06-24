//! Networks, the contract address book, and client config.

use crate::error::GolError;
use crate::types::Felt;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Network {
    Sepolia,
    Mainnet,
}

/// Selects which contract a read/call targets.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ContractKey {
    Lifeforms,
    Nutrient,
    LoopMinter,
    PathMinter,
    Bench,
}

#[derive(Clone, Debug)]
pub struct GolAddresses {
    pub lifeforms: Felt,
    pub nutrient: Felt,
    pub loop_minter: Felt,
    pub path_minter: Felt,
    /// Benchmark contract — only where a `GolBench` is deployed (proofs).
    pub bench: Option<Felt>,
    /// Block at/before which this deployment first emitted events. Event scans start here instead
    /// of genesis — critical because some RPC nodes paginate `getEvents` by fixed block windows
    /// (~82k), so a from-genesis scan on a mature chain is hundreds of empty round-trips. `0` = scan
    /// from genesis (unknown deploy block).
    pub deploy_block: u64,
}

impl GolAddresses {
    pub fn get(&self, key: ContractKey) -> Result<Felt, GolError> {
        Ok(match key {
            ContractKey::Lifeforms => self.lifeforms,
            ContractKey::Nutrient => self.nutrient,
            ContractKey::LoopMinter => self.loop_minter,
            ContractKey::PathMinter => self.path_minter,
            ContractKey::Bench => self
                .bench
                .ok_or_else(|| GolError::Config("no bench address for this network".into()))?,
        })
    }
}

/// Known deployments shipped with the SDK. Mainnet filled in when live.
/// Sepolia values are the live deployment (see project-management/STATUS.md); `bench` is the
/// optimized `GolBench` instance used for the SNIP-36 benchmark.
pub fn deployments(net: Network) -> Option<GolAddresses> {
    match net {
        // v2 deployment — a fresh collection (see docs/v2-deployment.md). The `lifeforms` class was
        // later upgraded in place (token_uri gas fix); the address is unchanged.
        Network::Sepolia => Some(GolAddresses {
            lifeforms: felt("0x040380471b403f52ac0ed6e674b391de268f83a8a1778d236bb7acc090c4e633"),
            nutrient: felt("0x060e0a0bd9aafec5fd0346e49eb4c5c47f9c7d6b7f26c705aaf21fd53a84e2c9"),
            loop_minter: felt("0x0024564a234b1bd49aea38efbaf99a0c6d5dc1269fa7fc5ad86ef8f924ea030"),
            path_minter: felt("0x05a3c3aff6117aa8061aa971552c14e2502429a7a9360661daa409f2d510c29f"),
            // v2 has no benchmark contract; the SNIP-36 bench was a separate v1-era deploy.
            bench: None,
            // The v2 collection's first mint (the seeded blinker) landed at block 11_075_524.
            deploy_block: 11_075_000,
        }),
        Network::Mainnet => None,
    }
}

fn felt(hex: &str) -> Felt {
    Felt::from_hex(hex).expect("valid address literal")
}

/// Canonical RPC node per network (see development.md). Callers may override.
pub fn default_rpc_url(net: Network) -> &'static str {
    match net {
        Network::Sepolia => "https://sepolia.nodes.starknet.org/rpc/v0_10",
        Network::Mainnet => "https://mainnet.nodes.starknet.org/rpc/v0_10",
    }
}

#[derive(Clone, Debug)]
pub struct GolConfig {
    pub addresses: GolAddresses,
    pub rpc_url: String,
    pub nut_decimals: u32,
}

impl GolConfig {
    /// Config for a known network using the shipped address book and default RPC.
    pub fn for_network(net: Network) -> Result<Self, GolError> {
        let addresses = deployments(net)
            .ok_or_else(|| GolError::Config("no known deployment for this network".into()))?;
        Ok(Self {
            addresses,
            rpc_url: default_rpc_url(net).to_string(),
            nut_decimals: 18,
        })
    }

    /// Config with caller-supplied addresses and RPC (local/custom deploy).
    pub fn new(addresses: GolAddresses, rpc_url: impl Into<String>) -> Self {
        Self {
            addresses,
            rpc_url: rpc_url.into(),
            nut_decimals: 18,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sepolia_address_book_loads() {
        let a = deployments(Network::Sepolia).unwrap();
        assert!(a.bench.is_none()); // v2 has no benchmark contract
        assert!(a.get(ContractKey::Bench).is_err());
        assert_eq!(a.get(ContractKey::Lifeforms).unwrap(), a.lifeforms);
        assert!(deployments(Network::Mainnet).is_none());
    }
}
