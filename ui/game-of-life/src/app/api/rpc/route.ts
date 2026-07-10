import { NETWORK, UPSTREAM_RPC } from "@/lib/config";

// Same-origin JSON-RPC proxy. The official Starknet nodes (config.UPSTREAM_RPC) don't send CORS
// headers, so the browser can't call them directly; it POSTs here (same origin, no CORS) and we
// forward to the node server-side. Transparent pass-through — the body is the JSON-RPC request.
//
// Tradeoff: every SDK read + wallet-provider read now costs one function invocation. If that gets
// heavy, set NEXT_PUBLIC_GOL_RPC_URL to a CORS-enabled gateway to let the browser read the node
// directly and bypass this route.

export const dynamic = "force-dynamic"; // never cache RPC responses

const upstream = () => UPSTREAM_RPC[NETWORK] ?? UPSTREAM_RPC.sepolia;

export async function POST(req: Request) {
  const body = await req.text();
  try {
    const res = await fetch(upstream(), {
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
