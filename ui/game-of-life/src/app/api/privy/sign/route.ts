import { AuthError, jsonError, privy, privyConfigured, requireUser, starknetWalletsOf } from "@/lib/privyServer";

// POST /api/privy/sign — sign a Starknet transaction hash with the caller's Privy wallet.
// Body: { walletId, hash } (starkzap's PrivySigner posts exactly this shape).
// Auth: Privy access token; the wallet MUST belong to the verified user — without that check
// this route would sign for anyone's wallet, so it is the security boundary of the whole flow.
export async function POST(req: Request) {
  if (!privyConfigured()) return jsonError(503, "email login is not configured on this deployment");
  try {
    const { userId, token } = await requireUser(req);
    const body = (await req.json().catch(() => null)) as { walletId?: string; hash?: string } | null;
    const walletId = body?.walletId ?? "";
    const hash = body?.hash ?? "";
    if (!walletId || !/^0x[0-9a-fA-F]{1,64}$/.test(hash)) return jsonError(400, "expected { walletId, hash }");

    const mine = await starknetWalletsOf(userId);
    if (!mine.some((w) => w.id === walletId)) return jsonError(403, "that wallet is not yours");

    // user-owned wallet: the user's JWT signs the request authorization (see requireUser)
    const res = await privy().wallets().rawSign(walletId, {
      params: { hash: hash as `0x${string}` },
      authorization_context: { user_jwts: [token] },
    });
    const signature = res?.signature;
    if (!signature) return jsonError(502, "Privy returned no signature");
    return Response.json({ signature }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(401, e.message);
    console.error("[privy/sign]", e);
    return jsonError(502, "signing failed");
  }
}
