import { NextResponse } from "next/server";
import {
  ITDB_INDICATIVE_PER_TOKEN,
  ITDB_RESERVES,
  ITDB_TIERS,
  ITDB_TOKEN,
  itdbBasket,
  itdbTierFor,
  marketUrl,
  nextItdbTier,
  type ItdbTier,
} from "@/lib/itdb/config";
import {
  activeMultiplier,
  milestonesFor,
  type ActiveMultiplier,
  type Milestone,
} from "@/lib/itdb/milestones";
import { earlyBirdWallets, tokenMultiplier } from "@/lib/itdb/early-birds";
import { getDb } from "@/lib/server/db";
import { getFx, type PriceSource } from "@/lib/server/fx";
import { memberHoldings, tokenBalance } from "@/lib/server/holdings";
import { sessionAccountId } from "@/lib/server/session";

export interface ItdbBasketLine {
  id: string;
  label: string;
  name: string;
  kind: "asset" | "fiat" | "usd";
  ticker: string | null;
  /** Units at the member's tier, after the ITDB milestone multiplier */
  units: number;
  /** Units before that multiplier */
  baseUnits: number;
  usdPerUnit: number;
  valueUsd: number;
  source: PriceSource;
  color: string;
}

export interface ItdbSummary {
  token: { code: string; issuer: string };
  marketUrl: string;
  balance: number;
  tier: ItdbTier | null;
  next: (ItdbTier & { needed: number }) | null;
  basket: ItdbBasketLine[];
  basketUsd: number;
  indicativePerToken: number;
  /** Indicative value of the member's whole basket, same formula as `basket` */
  indicativeUsd: number;
  tiers: ItdbTier[];
  reserves: typeof ITDB_RESERVES;
  ratesAt: number;
  /** ITDB's milestone multiplier and what would raise it next */
  milestone: ActiveMultiplier;
  /** The early-bird lifetime status, or null when not held */
  earlyBird: { multiplier: number; wallets: string[] } | null;
  /** Every ITDB milestone, for the ACTIVE / LOCKED list */
  milestones: Milestone[];
}

/** GET /api/itdb — the member's ITDB tier and live-valued reserve basket. */
export async function GET(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const db = await getDb();
  const account = db.accounts.find((a) => a.id === id);
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  let balance: number;
  let fx: Awaited<ReturnType<typeof getFx>>;
  try {
    const [holdings, rates] = await Promise.all([memberHoldings(account.wallets), getFx()]);
    balance = tokenBalance(holdings, ITDB_TOKEN);
    fx = rates;
  } catch {
    // Unknown is NOT zero (§6.4) — say so, don't show an empty basket.
    return NextResponse.json(
      { error: "The Stellar network is busy — your figures are safe, try again shortly." },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }

  const tier = itdbTierFor(balance);
  const nxt = nextItdbTier(balance);

  // ITDB's own milestone multiplier, and only ITDB's. Highest active
  // value, never the sum of the milestones already passed.
  const milestone = activeMultiplier("ITDB", "basket");

  // The lifetime early-bird status is an ACCOUNT multiplier and stacks
  // on top of the token milestone, per Tony's "applies to everything".
  const ebWallets = earlyBirdWallets(account.wallets);
  const accountMultiplier = tokenMultiplier(account.wallets, "ITDB");

  const basket: ItdbBasketLine[] = itdbBasket(balance).map(({ line, units: baseUnits }) => {
    const usdPerUnit = line.kind === "usd" ? 1 : fx.usdOf(line.ticker!);
    const units = baseUnits * milestone.value * accountMultiplier;
    return {
      id: line.id,
      label: line.label,
      name: line.name,
      kind: line.kind,
      ticker: line.ticker,
      units,
      baseUnits,
      usdPerUnit,
      valueUsd: units * usdPerUnit,
      source: line.kind === "usd" ? "reference" : fx.sourceOf(line.ticker!),
      color: line.color,
    };
  });

  const summary: ItdbSummary = {
    token: ITDB_TOKEN,
    marketUrl: marketUrl(ITDB_TOKEN),
    balance,
    tier,
    next: nxt ? { ...nxt, needed: Math.max(nxt.min - balance, 0) } : null,
    basket,
    basketUsd: basket.reduce((s, l) => s + l.valueUsd, 0),
    indicativePerToken: ITDB_INDICATIVE_PER_TOKEN,
    // (per-token indicative x balance x tier) x milestone — the same
    // chain as `basket`, so the two are directly comparable.
    indicativeUsd: (tier?.indicativeUsd ?? 0) * balance * milestone.value * accountMultiplier,
    tiers: ITDB_TIERS,
    reserves: ITDB_RESERVES,
    ratesAt: fx.at,
    milestone,
    milestones: milestonesFor("ITDB"),
    earlyBird:
      ebWallets.length > 0 ? { multiplier: accountMultiplier, wallets: ebWallets } : null,
  };
  return NextResponse.json(summary);
}
