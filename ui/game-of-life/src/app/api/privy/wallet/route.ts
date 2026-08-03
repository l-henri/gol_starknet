import { AuthError, findOrCreateStarknetWallet, jsonError, privyConfigured, requireUser } from "@/lib/privyServer";

// POST /api/privy/wallet — resolve (or mint, on first login) the caller's Starknet wallet.
// Auth: Privy access token. Returns { walletId, publicKey } for the starkzap onboarding flow.
export async function POST(req: Request) {
  if (!privyConfigured()) return jsonError(503, "email login is not configured on this deployment");
  try {
    const { userId } = await requireUser(req);
    const w = await findOrCreateStarknetWallet(userId);
    if (!w.publicKey) return jsonError(502, "Privy returned a wallet without a public key");
    return Response.json({ walletId: w.id, publicKey: w.publicKey }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(401, e.message);
    console.error("[privy/wallet]", e);
    return jsonError(502, "could not resolve your keeper account");
  }
}
