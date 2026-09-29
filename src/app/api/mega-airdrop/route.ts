import { NextResponse } from "next/server";
import { MEGA_MILESTONE_PCT } from "@/lib/itdb/mega-airdrop";
import { TOKEN_SUPPLY, VAULT_DISTRIBUTOR, vaultSold } from "@/lib/itdb/vault";
import { getDb, mutateDb, type DbAccount } from "@/lib/server/db";
import { memberHoldings, tokenBalance } from "@/lib/server/holdings";
import { sessionAccountId } from "@/lib/server/session";
import { ITDBVAULT_TOKEN } from "@/lib/stellar/registry";

export interface MegaSummary {
  /** ITDBVAULT held on chain; null when Horizon could not be read */
  held: number | null;
  eligible: boolean;
  claimedAt: number | null;
  /** Share of the vault sale sold, from the distributor */
  soldPct: number;
  milestonePct: number;
}

async function read(account: DbAccount) {
  const [mine, dist] = await Promise.allSettled([
    memberHoldings(account.wallets),
    memberHoldings([VAULT_DISTRIBUTOR]),
  ]);
  return {
    held: mine.status === "fulfilled" ? tokenBalance(mine.value, ITDBVAULT_TOKEN) : null,
    sold: vaultSold(dist.status === "fulfilled" ? tokenBalance(dist.value, ITDBVAULT_TOKEN) : null),
  };
}

async function load(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return null;
  const db = await getDb();
  return db.accounts.find((a) => a.id === id) ?? null;
}

const summary = (held: number | null, sold: number, claimedAt: number | null): MegaSummary => ({
  held,
  eligible: (held ?? 0) > 0,
  claimedAt,
  soldPct: Math.min((sold / TOKEN_SUPPLY) * 100, 100),
  milestonePct: MEGA_MILESTONE_PCT,
});

/** GET /api/mega-airdrop — eligibility (ITDBVAULT held) and any claim. */
export async function GET(req: Request) {
  const account = await load(req);
  if (!account) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const { held, sold } = await read(account);
  const db = await getDb();
  return NextResponse.json(summary(held, sold, db.megaAirdrops[account.id]?.claimedAt ?? null));
}

/**
 * POST /api/mega-airdrop — claim. The holding is re-read from chain here,
 * never taken from the client; a second claim returns the first.
 */
export async function POST(req: Request) {
  const account = await load(req);
  if (!account) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const { held, sold } = await read(account);
  if (held === null)
    return NextResponse.json(
      { error: "The Stellar network is busy — we could not confirm your ITDB Vault holding. Try again shortly." },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  if (held <= 0)
    return NextResponse.json({ error: "Only ITDB Vault holders can claim the Mega Airdrop." }, { status: 403 });

  const claimedAt = await mutateDb((db) => (db.megaAirdrops[account.id] ??= { claimedAt: Date.now() }).claimedAt);
  return NextResponse.json(summary(held, sold, claimedAt));
}
