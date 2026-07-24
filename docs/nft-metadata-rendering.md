# Displaying lifeforms safely (wallet / marketplace / app integration)

Lifeforms render their art **fully on-chain** — the metadata embeds the artwork itself rather
than linking a hosted image. That makes them self-contained and censorship-resistant, but it
means one of the two visual fields is **untrusted, on-chain-controlled HTML+JavaScript**. This
doc is for anyone building a surface that displays a lifeform (a wallet, an explorer, a
marketplace, or a third-party app) and explains how to render each field **without executing
untrusted code in your origin**.

> If you're building the official web app, you don't consume `animation_url` at all — you rebuild
> the renderer locally from cheap reads. See [frontend.md](frontend.md#the-on-chain-render-artifact-libonchainrenderts).
> This doc is for everyone else, who only has the on-chain `token_uri` to work from.

## Where the art lives

`token_uri(token_id)` returns a **`data:` URI**, decoded locally with no network round-trip:

- v1 (`src/gol_metadata.cairo:121`): `data:application/json;base64,<json>`
- v2/v3 (`src/gol_metadata_v2.cairo:298`): `data:application/json,<json>` (raw, not base64)

Decode it (percent-decode or base64 per the header) and parse the JSON. Alongside `name`,
`description`, and `attributes`, it carries **up to two visual fields**:

| Field | Value | Contract | Trust |
|-------|-------|----------|-------|
| `image` | `data:image/svg+xml;base64,<svg>` — a static grid snapshot | v1 (`gol_metadata.cairo:122`), v2/v3 (`gol_metadata_v2.cairo:273`) | **Safe** in `<img>` |
| `animation_url` | `data:text/html;base64,<html>` — a live Conway canvas | v2/v3 only (`gol_metadata_v2.cairo:276`) | **Untrusted code** |

- **v1** metadata has `image` only.
- **v2/v3** metadata (`gol_metadata_v2.cairo:3-11`) is designed to carry **both**: `animation_url`
  is the canonical piece; `image` is a static fallback explicitly "for wallets/marketplaces that
  don't execute `animation_url`."

> ⚠️ **Version skew (verify against the token you're rendering).** The v2/v3 metadata *source*
> emits both fields, but lifeforms deployed from an **earlier** v2 build expose `animation_url`
> **with no `image`**. A live Sepolia token verified 2026-07-24 had `animation_url` only. So do
> **not** assume `image` is present — always handle its absence.

## Rendering `image` — safe, do this first

An SVG loaded through an `<img src>` runs in the browser's restricted mode: **no scripts, no
external fetches**. So the `image` field is safe to drop straight into an image element (escape it
when interpolating into HTML). This is the cheapest, safest path — **prefer it whenever `image`
is present**, and use it as the still preview even when you also offer the animation.

```html
<img src="data:image/svg+xml;base64,…" alt="Lifeform #…" />
```

Do **not** feed `animation_url` to an `<img>` — it's an HTML document, not an image.

## Rendering `animation_url` — untrusted, sandbox it

`animation_url` is a `data:text/html` page with an inline `<script>`. Treat it as **hostile code
you must run without giving it anything**. It's produced deterministically by the current
contract, but a consumer cannot tell a benign renderer from a malicious one, and the safe pattern
costs nothing.

**Never** render it inline, via `innerHTML`, or in a same-origin / unsandboxed iframe — that
executes arbitrary JS in your origin (your app's DOM, storage, cookies, and — for a wallet — its
keys and messaging).

**Do** render it behind **two independent boundaries**:

1. **Code isolation** — a cross-origin **sandboxed** iframe: `sandbox="allow-scripts"` **without
   `allow-same-origin`** forces an opaque origin, so the script can't touch your DOM, storage, or
   APIs. (In a browser extension, use a manifest-declared *sandbox page* — it gets an opaque
   origin and no extension-API access.)
2. **Network egress** — a **Content-Security-Policy**, because the sandbox attribute does **not**
   block the network. `fetch`, `WebSocket`, `sendBeacon`, and remote `<img>` all still fire from a
   sandboxed frame. Without a CSP, a malicious `animation_url` can phone home the moment it renders
   and correlate the viewer's IP with the wallet address. Block egress with:

   ```
   default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:;
   ```

   (No `connect-src`, no remote `img-src` → no network. `script-src 'unsafe-inline'` is what lets
   the canvas script run; the Conway animation needs nothing more.)

Additional hardening:

- **Inject via `srcdoc` or `document.write` into a wrapper you control**, so *your* CSP governs the
  content. Do **not** point an iframe `src` directly at the `data:text/html` URL — CSP inheritance
  into `data:` frames is browser-dependent and unreliable, and your egress protection may not apply.
- **Don't expose your message bus** to the frame. If you need to hand it the HTML, prefer the frame
  URL hash or a `postMessage` channel that verifies `event.source` (the opaque origin serializes to
  `"null"`, so an origin check alone is insufficient). Never act on a message from the frame.
- **Reveal on explicit user action** (a "Play" affordance), not on list paint, so simply browsing a
  gallery never starts untrusted code.
- **Bound the size** of the decoded HTML and **fail closed** to the static `image` (or a
  placeholder) on any decode/validation error.

## Decision summary

1. `image` present → render it in an `<img>`. Done, safe.
2. Want the live animation (or no `image`) → render `animation_url` in a sandboxed, egress-blocked
   iframe as above, revealed on user action, with the static image (if any) as the fallback.
3. Can't/won't run HTML → show the `image` if present, else a placeholder. Never inline the HTML.

## Reference implementation

MC Wallet added exactly this: a manifest-sandboxed render page (opaque origin), an egress-blocking
CSP, hash-based delivery of the untrusted HTML, and a play-to-reveal control — see
[starknet-innovation/mc-wallet#166](https://github.com/starknet-innovation/mc-wallet/pull/166) and
its `docs/security-audit/releases/v0.8.md` for the threat model. It also renders the static SVG
`image` directly in an `<img>` for v1 and for v2/v3 tokens that carry one.
