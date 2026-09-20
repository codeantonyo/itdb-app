import { NextResponse } from "next/server";
import {
  TOTAL_VAULTS,
  VAULTS_PER_CITY,
  VAULT_CITY_NAMES,
  cityForClaim,
  remainingByCity,
} from "@/lib/itdb/vault";
import { ITDBVAULT_TOKEN } from "@/lib/stellar/registry";
import { getDb, mutateDb, type VaultClaimRecord } from "@/lib/server/db";
import { sessionAccountId } from "@/lib/server/session";

export interface VaultSummary {
  token: { code: string; issuer: string };
  total: number;
  claimed: number;
  available: number;
  perCity: number;
  /** Vaults still free in each city */
  remaining: Record<string, number>;
  /** This member's vault, or null if they have not claimed one */
  mine: VaultClaimRecord | null;
}

/** How many vaults each city has given out. */
const takenByCity = (claims: Record<string, VaultClaimRecord>): Record<string, number> => {
  const taken: Record<string, number> = {};
  for (const c of Object.values(claims)) taken[c.city] = (taken[c.city] ?? 0) + 1;
  return taken;
};

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
    perCity: VAULTS_PER_CITY,
    remaining: remainingByCity(takenByCity(claims)),
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
 * POST /api/vault — claim one vault, in the city the member picked.
 *
 * The city is validated against the real list and its remaining count is
 * recomputed inside the mutation, so a city cannot be talked past its
 * fifty by a stale page or two people claiming its last vault at once.
 * Omitting the city falls back to round-robin.
 */
export async function POST(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const db = await getDb();
  if (!db.accounts.some((a) => a.id === id))
    return NextResponse.json({ error: "Account not found" }, { status: 404 });

  let wanted: string | undefined;
  try {
    const body = (await req.json()) as { city?: unknown };
    if (typeof body?.city === "string") wanted = body.city;
  } catch {
    // No body is fine — the member gets the next city in rotation.
  }
  if (wanted !== undefined && !VAULT_CITY_NAMES.includes(wanted))
    return NextResponse.json({ error: "That is not one of our vault cities." }, { status: 400 });

  const result = await mutateDb((store) => {
    const existing = store.vaultClaims[id];
    if (existing) return { ok: true as const, summary: summarise(store.vaultClaims, existing) };

    const index = Object.keys(store.vaultClaims).length;
    if (index >= TOTAL_VAULTS)
      return { ok: false as const, error: "Every vault has been claimed.", status: 409 };

    const city = wanted ?? cityForClaim(index);
    const remaining = remainingByCity(takenByCity(store.vaultClaims))[city] ?? 0;
    if (remaining <= 0)
      return {
        ok: false as const,
        error: `${city} is fully claimed — choose another city.`,
        status: 409,
      };

    const record: VaultClaimRecord = { at: Date.now(), city, index };
    store.vaultClaims[id] = record;
    return { ok: true as const, summary: summarise(store.vaultClaims, record) };
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.summary);
}
