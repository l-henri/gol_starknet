// Universal stand-in for optional starkzap peer deps we don't install (bridging, Solana,
// confidential transfers…). Unlike webpack's IgnorePlugin — which makes the module THROW at
// load time and killed `import("starkzap")` (its root statically re-exports modules that
// statically import these peers) — this evaluates harmlessly: any named import yields the
// proxy, which survives property access, calls, construction, and `class X extends Peer`.
// The features backed by these peers are never used by this app.
const stub = new Proxy(function OptionalPeerStub() {}, {
  get: (_t, prop) => (prop === Symbol.toPrimitive ? () => "[optional-peer-stub]" : stub),
  apply: () => stub,
  construct: () => ({}),
});
module.exports = stub;
