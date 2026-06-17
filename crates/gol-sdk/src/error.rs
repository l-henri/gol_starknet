//! One error type, a handful of categories (mirrors hexposed-sdk's 5-variant `SdkError`). Callers
//! match on the variant, not on dozens of codes; SNIP-36 server reasons ride in the `Proving` text.

#[derive(thiserror::Error, Debug)]
pub enum GolError {
    /// Missing address / RPC / deployment for the requested network.
    #[error("config: {0}")]
    Config(String),
    /// Caller passed an out-of-range or malformed argument.
    #[error("input: {0}")]
    Input(String),
    /// Calldata / felt / result decoding failed.
    #[error("encoding: {0}")]
    Encoding(String),
    /// RPC transport or view-call failure.
    #[error("read: {0}")]
    Read(String),
    /// Signing, broadcast, or gateway rejection.
    #[error("submission: {0}")]
    Submission(String),
    /// Prover error (carries the `SNIP36_*` reason) or a `proof_facts[8]` mismatch.
    #[error("proving: {0}")]
    Proving(String),
}
