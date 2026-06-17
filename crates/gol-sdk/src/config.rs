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
        Network::Sepolia => Some(GolAddresses {
            lifeforms: felt("0x0535f6cb8e98f78de9b4dc71b78839cd8119af301b8b300d715b32872d07494e"),
            nutrient: felt("0x060e3d6a6f181235e0d4993ddde5a7db7d8ff5275830bcc916969dfdbf3e1858"),
            loop_minter: felt("0x021f2ee4afeb2593fb957911f500c06424bb045ec64e172bd8ee0af5aefd4ffc"),
            path_minter: felt("0x07e46847ece8c083da4e8a3eb17bd8d3f7138b08cda3ad6a2ffa884b918d2503"),
            bench: Some(felt(
                "0x05f62daf5d63c1c6c310247d2155dcc52fa4328ff7bd8ec4ace6f40f8fa3ec5",
            )),
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
        assert!(a.bench.is_some());
        assert_eq!(a.get(ContractKey::Lifeforms).unwrap(), a.lifeforms);
        assert!(deployments(Network::Mainnet).is_none());
    }
}
