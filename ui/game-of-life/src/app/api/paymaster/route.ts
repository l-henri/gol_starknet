import { NETWORK, UPSTREAM_PAYMASTER, UPSTREAM_RPC_COMPAT } from "@/lib/config";

// Same-origin SNIP-29 paymaster proxy → AVNU. Two jobs:
//  1. keep the AVNU api key server-side (sponsored mode requires it; the browser never sees it);
//  2. enforce the per-account sponsorship cap on `paymaster_executeTransaction`.
//
// The cap needs no database: a Starknet account's nonce IS its lifetime count of executed
// transactions, read straight from the chain. Once an email keeper has burned through
// SPONSORED_TX_CAP transactions, sponsorship stops (they can fund the account and pay their
// own way — the address is a normal ArgentX account). Deployments (nonce 0) always pass.

const CAP = Math.max(1, Number(process.env.SPONSORED_TX_CAP ?? "25") || 25);
const API_KEY = process.env.PAYMASTER_API_KEY ?? "";

const upstream = () => UPSTREAM_PAYMASTER[NETWORK] ?? UPSTREAM_PAYMASTER.sepolia;
const rpcUpstream = () => UPSTREAM_RPC_COMPAT[NETWORK] ?? UPSTREAM_RPC_COMPAT.sepolia;

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The account a paymaster-execute request acts for (wire format is snake_case per SNIP-29,
 *  but starknet.js has used camelCase in places — accept both). */
function userAddressOf(params: any): string | null {
  const tx = params?.transaction ?? params;
  const invoke = tx?.invoke;
  const addr = invoke?.user_address ?? invoke?.userAddress ?? null;
  return typeof addr === "string" ? addr : null;
}

async function nonceOf(address: string): Promise<number | null> {
  try {
    const res = await fetch(rpcUpstream(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "starknet_getNonce", params: ["latest", address] }),
      cache: "no-store",
    });
    const j: any = await res.json();
    if (typeof j?.result === "string") return Number(BigInt(j.result));
    return null; // undeployed account (or node hiccup) — treated as nonce 0 / allowed
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const body = await req.text();
  let parsed: any = null;
  try { parsed = JSON.parse(body); } catch { /* forward as-is; AVNU will reject it */ }

  // Sponsorship cap — only executes spend our credit, so only they are gated.
  const items: any[] = parsed ? (Array.isArray(parsed) ? parsed : [parsed]) : [];
  for (const item of items) {
    if (item?.method !== "paymaster_executeTransaction") continue;
    const addr = userAddressOf(item.params);
    if (!addr) continue; // pure deployment — the account's first breath, always sponsored
    const nonce = await nonceOf(addr);
    if (nonce !== null && nonce >= CAP) {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: item.id ?? null,
          error: {
            code: -32099,
            message: `sponsorship cap reached: this account has already sent ${nonce} transactions (cap ${CAP}). Fund it with STRK to keep going.`,
          },
        }),
        { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } }
      );
    }
  }

  try {
    const res = await fetch(upstream(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(API_KEY ? { "x-paymaster-api-key": API_KEY } : {}),
      },
      body,
      cache: "no-store",
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: `paymaster proxy error: ${e instanceof Error ? e.message : String(e)}` } }),
      { status: 502, headers: { "content-type": "application/json", "cache-control": "no-store" } }
    );
  }
}
