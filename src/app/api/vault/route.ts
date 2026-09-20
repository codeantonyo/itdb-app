import { NextResponse } from "next/server";
import { TOTAL_VAULTS, cityForClaim } from "@/lib/itdb/vault";
import { ITDBVAULT_TOKEN } from "@/lib/stellar/registry";
import { getDb, mutateDb, type VaultClaimRecord } from "@/lib/server/db";
import { sessionAccountId } from "@/lib/server/session";

export interface VaultSummary {
  token: { code: string; issuer: string };
  total: number;
  claimed: number;
  available: number;
  /** This member's vault, or null if they have not claimed one */
  mine: VaultClaimRecord | null;
}

const summarise = (
  claims: Record<string, VaultClaimRecord>,
  mine: VaultClaimRecord | undefined,
): VaultSummary => {
  const claimed = Object.keys(claims).length;
  return {
    token: ITDBVAULT_TOKEN,
    total: TOTAL_VAULTS,
    claimed,
    available: Math.max(TOTAL_VAULTS - claimed, 0),
    mine: mine ?? null,
  };
};

/** GET /api/vault — the network's state and this member's vault. */
export async function GET(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const db = await getDb();
  return NextResponse.json(summarise(db.vaultClaims, db.vaultClaims[id]));
}

/**
 * POST /api/vault — claim one vault.
 *
 * The count is recomputed inside the mutation, so two people claiming
 * the last vault at once cannot both get it, and a member who already
 * holds one is handed theirs back rather than issued a second.
 */
export async function POST(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const db = await getDb();
  if (!db.accounts.some((a) => a.id === id))
    return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const result = await mutateDb((store) => {
    const existing = store.vaultClaims[id];
    if (existing) return { ok: true as const, summary: summarise(store.vaultClaims, existing) };

    const index = Object.keys(store.vaultClaims).length;
    if (index >= TOTAL_VAULTS) {
      return { ok: false as const, error: "Every vault has been claimed.", status: 409 };
    }

    const record: VaultClaimRecord = { at: Date.now(), city: cityForClaim(index), index };
    store.vaultClaims[id] = record;
    return { ok: true as const, summary: summarise(store.vaultClaims, record) };
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.summary);
}
