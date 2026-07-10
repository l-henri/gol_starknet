import { NETWORK, UPSTREAM_RPC, UPSTREAM_RPC_COMPAT } from "@/lib/config";

// Same-origin JSON-RPC proxy. The official Starknet nodes don't send CORS headers, so the browser
// can't call them directly; it POSTs here (same origin, no CORS) and we forward server-side. The
// body is the JSON-RPC request, passed through unchanged. `?spec=compat` targets the node's v0_8
// endpoint (starknet.js); default targets v0.10 (the WASM SDK).
//
// Tradeoff: every read costs one function invocation. If that gets heavy, set NEXT_PUBLIC_GOL_RPC_URL
// to a CORS-enabled gateway to let the browser read the node directly and bypass this route.

export const dynamic = "force-dynamic"; // never cache RPC responses

const upstream = (compat: boolean) =>
  (compat ? UPSTREAM_RPC_COMPAT[NETWORK] ?? UPSTREAM_RPC_COMPAT.sepolia : UPSTREAM_RPC[NETWORK] ?? UPSTREAM_RPC.sepolia);

export async function POST(req: Request) {
  const compat = new URL(req.url).searchParams.get("spec") === "compat";
  const body = await req.text();
  try {
    const res = await fetch(upstream(compat), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: `RPC proxy error: ${e instanceof Error ? e.message : String(e)}` } }),
      { status: 502, headers: { "content-type": "application/json", "cache-control": "no-store" } }
    );
  }
}
