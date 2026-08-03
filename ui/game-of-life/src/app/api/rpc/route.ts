import { unstable_cache } from "next/cache";
import { createHash } from "node:crypto";
import { NETWORK, UPSTREAM_RPC, UPSTREAM_RPC_COMPAT, UPSTREAM_RPC_V9 } from "@/lib/config";

// Same-origin JSON-RPC proxy. The official Starknet nodes don't send CORS headers, so the browser
// can't call them directly; it POSTs here (same origin, no CORS) and we forward server-side. The
// body is the JSON-RPC request, passed through unchanged. `?spec=compat` targets the node's v0_8
// endpoint (starknet.js); default targets v0.10 (the WASM SDK).
//
// Read-only calls (`starknet_call` / `starknet_getEvents`, including JSON-RPC batches of them) are
// cached in the Next Data Cache for a short TTL, so the gallery's reads are SHARED across visitors:
// the first load populates the cache; the rest are served without a round-trip to the node. New
// mints/breaths/pets appear with <= TTL lag. Writes, fee estimates, and tx-status reads are never
// cached — they pass straight through. (Only applies when the app routes through this proxy, i.e.
// NEXT_PUBLIC_GOL_RPC_URL is unset; a direct CORS gateway bypasses it.)

// `spec`: default → v0.10 (WASM SDK) · "compat" → v0.8 (starknet.js 7) · "v9" → v0.9 (starkzap).
type Spec = "default" | "compat" | "v9";
const upstream = (spec: Spec) =>
  spec === "compat"
    ? UPSTREAM_RPC_COMPAT[NETWORK] ?? UPSTREAM_RPC_COMPAT.sepolia
    : spec === "v9"
    ? UPSTREAM_RPC_V9[NETWORK] ?? UPSTREAM_RPC_V9.sepolia
    : UPSTREAM_RPC[NETWORK] ?? UPSTREAM_RPC.sepolia;

const READ_METHODS = new Set(["starknet_call", "starknet_getEvents"]);
const TTL_SECONDS = 20;

/** A request (single or JSON-RPC batch) is cacheable iff every sub-request is a read-only method. */
function isCacheable(body: string): boolean {
  try {
    const parsed = JSON.parse(body);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items.length > 0 && items.every((r) => READ_METHODS.has(r?.method));
  } catch {
    return false;
  }
}

async function forward(spec: Spec, body: string): Promise<{ status: number; text: string }> {
  const res = await fetch(upstream(spec), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    cache: "no-store", // caching is handled at the unstable_cache layer, not per-fetch
  });
  return { status: res.status, text: await res.text() };
}

export async function POST(req: Request) {
  const specParam = new URL(req.url).searchParams.get("spec");
  const spec: Spec = specParam === "compat" ? "compat" : specParam === "v9" ? "v9" : "default";
  const body = await req.text();
  try {
    if (isCacheable(body)) {
      const key = createHash("sha1").update(`${spec}:${body}`).digest("hex");
      // Cache only successful responses; a non-200 throws so it isn't cached (the caller retries).
      const cached = unstable_cache(
        async () => {
          const r = await forward(spec, body);
          if (r.status !== 200) throw new Error(`upstream ${r.status}`);
          return r;
        },
        ["rpc", key],
        { revalidate: TTL_SECONDS },
      );
      const { status, text } = await cached();
      return new Response(text, {
        status,
        headers: { "content-type": "application/json", "cache-control": `public, max-age=${TTL_SECONDS}` },
      });
    }
    const { status, text } = await forward(spec, body);
    return new Response(text, {
      status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: `RPC proxy error: ${e instanceof Error ? e.message : String(e)}` } }),
      { status: 502, headers: { "content-type": "application/json", "cache-control": "no-store" } }
    );
  }
}
