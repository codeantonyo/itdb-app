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
  /** Units at the member's tier (per-token entitlement × multiplier) */
  units: number;
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
  tiers: ItdbTier[];
  reserves: typeof ITDB_RESERVES;
  ratesAt: number;
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
  const basket: ItdbBasketLine[] = itdbBasket(balance).map(({ line, units }) => {
    const usdPerUnit = line.kind === "usd" ? 1 : fx.usdOf(line.ticker!);
    return {
      id: line.id,
      label: line.label,
      name: line.name,
      kind: line.kind,
      ticker: line.ticker,
      units,
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
    tiers: ITDB_TIERS,
    reserves: ITDB_RESERVES,
    ratesAt: fx.at,
  };
  return NextResponse.json(summary);
}
