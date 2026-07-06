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
    /// The separate NFT for PATH creatures (transients into a loop). See docs/path-creatures-spec.md.
    PathLifeforms,
    Nutrient,
    LoopMinter,
    PathMinter,
    /// The caretaker-bond ERC-1155 (pets). See docs/pet-mechanism-spec.md.
    Pets,
    Bench,
}

#[derive(Clone, Debug)]
pub struct GolAddresses {
    pub lifeforms: Felt,
    /// PATH-creature NFT (separate collection from loops).
    pub path_lifeforms: Felt,
    pub nutrient: Felt,
    pub loop_minter: Felt,
    pub path_minter: Felt,
    /// Caretaker bonds (pets) ERC-1155.
    pub pets: Felt,
    /// Benchmark contract — only where a `GolBench` is deployed (proofs).
    pub bench: Option<Felt>,
    /// Block at/before which this deployment first emitted events. Event scans start here instead
    /// of genesis — critical because some RPC nodes paginate `getEvents` by fixed block windows
    /// (~82k), so a from-genesis scan on a mature chain is hundreds of empty round-trips. `0` = scan
    /// from genesis (unknown deploy block).
    pub deploy_block: u64,
    /// The nutrient token's own deploy block — OLDER than `deploy_block` when NUT is reused across
    /// collection versions (v3 reuses v2's NUT). Feed-reward scans start here so breathing history
    /// survives collection upgrades.
    pub nutrient_deploy_block: u64,
}

impl GolAddresses {
    pub fn get(&self, key: ContractKey) -> Result<Felt, GolError> {
        Ok(match key {
            ContractKey::Lifeforms => self.lifeforms,
            ContractKey::PathLifeforms => self.path_lifeforms,
            ContractKey::Nutrient => self.nutrient,
            ContractKey::LoopMinter => self.loop_minter,
            ContractKey::PathMinter => self.path_minter,
            ContractKey::Pets => self.pets,
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
        // v3 deployment — the orbit-canonical identity collections (docs/v3-deployment.md,
        // 2026-07-06): "Digital Bacteria"/BACT loops + "Digital Wanderers"/WNDR paths, witness-
        // assisted minters. NUT is reused from v2. The superseded v2 addresses live in
        // docs/v2-deployment.md if a reader ever needs the old collections.
        Network::Sepolia => Some(GolAddresses {
            lifeforms: felt("0x001e8e1c75f960faebd6f24c4321aad2f76e54dce00d11d690cb58ff1666ceec"),
            // Wanderers: the PATH-creature NFT (field name kept for API stability).
            path_lifeforms: felt("0x00d43450e4cc02677b193f0a0f25daf1a85a1fcb1071d24674c1db485763042c"),
            nutrient: felt("0x060e0a0bd9aafec5fd0346e49eb4c5c47f9c7d6b7f26c705aaf21fd53a84e2c9"),
            loop_minter: felt("0x0351576a60a9f0423784e0bd2d5e4e630f4b21f49a0b55cf89045e8e1006f3ba"),
            path_minter: felt("0x06d00789bc1808e41fe708aad5f76c978585f184f9a7931f7bb6300c52f23573"),
            // Pet bonds (caretaker layer), deployed 2026-07-06 — docs/v3-deployment.md.
            pets: felt("0x059878490847be8f32e539e60d9cbe849b2b6c77f750ae381236242388f6e337"),
            bench: None,
            // The v3 genesis seed landed at block 11_642_283.
            deploy_block: 11_642_000,
            // NUT is v2's token (first minted at block ~11_075_524) — feed history spans versions.
            nutrient_deploy_block: 11_075_000,
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
