// Server-only Privy helpers for the email-login door (app/api/privy/*).
//
// Trust model: the browser NEVER talks to Privy's wallet API directly. It authenticates with
// Privy (email OTP → access token) and calls our routes; we verify the token, resolve the
// user's Starknet wallet, and proxy exactly two operations — find-or-create and raw-sign —
// always checking the wallet belongs to the verified user. Keys live in Privy's infrastructure;
// no key material ever passes through here, only transaction hashes and signatures.

import { PrivyClient, verifyAccessToken } from "@privy-io/node";
import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET ?? "";
// Optional: the app's token-verification key (SPKI) from the Privy dashboard (Settings).
// When unset we verify against Privy's public JWKS endpoint for the app instead — one less
// credential to manage; the key override just saves the (cached) JWKS fetch.
const PRIVY_VERIFICATION_KEY = process.env.PRIVY_VERIFICATION_KEY ?? "";

export const privyConfigured = () => !!(PRIVY_APP_ID && PRIVY_APP_SECRET);

let jwks: JWTVerifyGetKey | null = null;
function verificationKey(): string | JWTVerifyGetKey {
  if (PRIVY_VERIFICATION_KEY) return PRIVY_VERIFICATION_KEY;
  if (!jwks) jwks = createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`));
  return jwks;
}

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

/** Verify the `Authorization: Bearer <privy access token>` header. Returns the Privy user id
 *  AND the raw token — wallets are USER-owned, so actions on them (rawSign) must carry the
 *  user's JWT as authorization context; the app secret alone is deliberately not enough. */
export async function requireUser(req: Request): Promise<{ userId: string; token: string }> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new AuthError("missing bearer token");
  try {
    const claims = await verifyAccessToken({
      access_token: token,
      app_id: PRIVY_APP_ID,
      verification_key: verificationKey(),
    });
    return { userId: claims.user_id, token };
  } catch {
    throw new AuthError("invalid or expired token");
  }
}

export class AuthError extends Error {}

export type StarknetWallet = { id: string; publicKey: string };

// Ownership model: wallets are APP-MANAGED, mapped to the user via `external_id` — NOT
// `owner: { user_id }`. A user-OWNED wallet requires the owner's key-quorum authorization on
// every action ("No valid authorization keys or user signing keys available"), a flow built
// for third-party-JWT auth setups. Privy's own Tier-2/Starknet recipe signs with the app
// secret; user↔wallet enforcement lives in OUR routes (verified access token + this mapping).
// external_id allows only [a-zA-Z0-9_-], and Privy user ids look like "did:privy:…" — sanitize.
const extIdOf = (userId: string) => userId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64);

/** The user's Starknet wallets (usually 0 or 1), by external-id mapping. */
export async function starknetWalletsOf(userId: string): Promise<StarknetWallet[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page: any = await privy().wallets().list({ external_id: extIdOf(userId), chain_type: "starknet" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = Array.isArray(page?.data) ? page.data : [];
  return items.map((w) => ({ id: String(w.id), publicKey: String(w.public_key ?? w.address ?? "") }));
}

/** Find the user's Starknet wallet, creating one (app-managed, user-mapped) on first login. */
export async function findOrCreateStarknetWallet(userId: string): Promise<StarknetWallet> {
  const existing = await starknetWalletsOf(userId);
  if (existing.length > 0) return existing[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = await privy().wallets().create({ chain_type: "starknet", external_id: extIdOf(userId) });
  return { id: String(w.id), publicKey: String(w.public_key ?? w.address ?? "") };
}
