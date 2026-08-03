// Server-only Privy helpers for the email-login door (app/api/privy/*).
//
// Trust model: the browser NEVER talks to Privy's wallet API directly. It authenticates with
// Privy (email OTP → access token) and calls our routes; we verify the token, resolve the
// user's Starknet wallet, and proxy exactly two operations — find-or-create and raw-sign —
// always checking the wallet belongs to the verified user. Keys live in Privy's infrastructure;
// no key material ever passes through here, only transaction hashes and signatures.

import { PrivyClient, verifyAccessToken } from "@privy-io/node";

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET ?? "";
// The app's token-verification key (SPKI), from the Privy dashboard (App settings → Basics).
const PRIVY_VERIFICATION_KEY = process.env.PRIVY_VERIFICATION_KEY ?? "";

export const privyConfigured = () => !!(PRIVY_APP_ID && PRIVY_APP_SECRET && PRIVY_VERIFICATION_KEY);

let client: PrivyClient | null = null;
export function privy(): PrivyClient {
  if (!client) client = new PrivyClient({ appId: PRIVY_APP_ID, appSecret: PRIVY_APP_SECRET });
  return client;
}

export function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** Verify the `Authorization: Bearer <privy access token>` header; return the Privy user id. */
export async function requireUserId(req: Request): Promise<string> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new AuthError("missing bearer token");
  try {
    const claims = await verifyAccessToken({
      access_token: token,
      app_id: PRIVY_APP_ID,
      verification_key: PRIVY_VERIFICATION_KEY,
    });
    return claims.user_id;
  } catch {
    throw new AuthError("invalid or expired token");
  }
}

export class AuthError extends Error {}

export type StarknetWallet = { id: string; publicKey: string };

/** The user's Starknet wallets (usually 0 or 1). */
export async function starknetWalletsOf(userId: string): Promise<StarknetWallet[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page: any = await privy().wallets().list({ user_id: userId, chain_type: "starknet" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = Array.isArray(page?.data) ? page.data : [];
  return items.map((w) => ({ id: String(w.id), publicKey: String(w.public_key ?? w.address ?? "") }));
}

/** Find the user's Starknet wallet, creating one (owned by the user) on first login. */
export async function findOrCreateStarknetWallet(userId: string): Promise<StarknetWallet> {
  const existing = await starknetWalletsOf(userId);
  if (existing.length > 0) return existing[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = await privy().wallets().create({ chain_type: "starknet", owner: { user_id: userId } });
  return { id: String(w.id), publicKey: String(w.public_key ?? w.address ?? "") };
}
