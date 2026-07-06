//! The top-level client. Today it composes a [`RpcReader`] and exposes reads + call-builders; the
//! injected `Submitter`/prover seams (and a builder over `Box<dyn _>`) are wired in a later cut.

use crate::config::{GolConfig, Network};
use crate::error::GolError;
use crate::reader::Reader;
use crate::rpc::RpcReader;
use crate::writes::GolWrites;

pub struct GolClient {
    pub config: GolConfig,
    reader: RpcReader,
}

impl GolClient {
    /// Build a client from explicit config.
    pub fn new(config: GolConfig) -> Self {
        let reader = RpcReader::new(config.rpc_url.clone(), config.addresses.clone());
        Self { config, reader }
    }

    /// Convenience: a client for a known network using the shipped address book + default RPC.
    pub fn for_network(net: Network) -> Result<Self, GolError> {
        Ok(Self::new(GolConfig::for_network(net)?))
    }

    /// Read-only access (the [`Reader`] seam).
    pub fn reads(&self) -> &dyn Reader {
        &self.reader
    }

    /// The concrete RPC reader, for reads not on the `Reader` trait (e.g. pet-bond status).
    pub fn rpc(&self) -> &crate::rpc::RpcReader {
        &self.reader
    }

    /// Pure call-builders (no signer required).
    pub fn writes(&self) -> GolWrites<'_> {
        GolWrites::new(&self.config.addresses, self.config.nut_decimals)
    }
}
