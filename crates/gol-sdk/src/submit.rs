//! The submission seam: turn built [`Call`]s into a broadcast tx. Decoupled from call-building so
//! the same builders feed a native key, the strkd companion, the browser wallet (on the WASM path,
//! signing happens in JS), or a future paymaster. The optional `proof`/`proof_facts` fold the
//! SNIP-36 verify into the normal submit path.

use async_trait::async_trait;

use crate::error::GolError;
use crate::types::{Call, Felt};

#[derive(Clone, Debug, Default)]
pub struct SubmitOpts {
    /// SNIP-36 base64 proof (attach to fold a proof-bearing verify into a normal submit).
    pub proof: Option<String>,
    /// SNIP-36 `proof_facts` accompanying `proof`.
    pub proof_facts: Option<Vec<Felt>>,
    /// Explicit nonce; otherwise the submitter resolves it.
    pub nonce: Option<Felt>,
}

#[derive(Clone, Debug)]
pub struct SubmitResult {
    pub transaction_hash: Felt,
}

#[async_trait(?Send)]
pub trait Submitter {
    async fn submit(&self, calls: &[Call], opts: SubmitOpts) -> Result<SubmitResult, GolError>;
}

/// Placeholder for the strkd wallet companion submitter (sign-only / submit). Wiring the strkd
/// JSON-RPC protocol — pairing, bearer/`X-Companion-Client` headers, `proof_facts` —
/// is a follow-up (see docs/sdk-plan.md §6.4 and docs/development.md "strkd").
pub struct StrkdSubmitter {
    pub url: String,
    pub account: Felt,
    /// `true` to broadcast via strkd's node; `false` for sign-only (returns a signed tx).
    pub submit: bool,
}

impl StrkdSubmitter {
    pub fn new(url: impl Into<String>, account: Felt, submit: bool) -> Self {
        Self { url: url.into(), account, submit }
    }
}

#[async_trait(?Send)]
impl Submitter for StrkdSubmitter {
    async fn submit(&self, _calls: &[Call], _opts: SubmitOpts) -> Result<SubmitResult, GolError> {
        Err(GolError::Submission(
            "StrkdSubmitter not yet wired — see docs/sdk-plan.md §6.4".into(),
        ))
    }
}
