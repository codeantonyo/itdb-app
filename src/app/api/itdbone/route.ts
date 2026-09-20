import { NextResponse } from "next/server";
import {
  ITDBONE_TIERS,
  ITDBONE_TOKEN,
  itdboneRange,
  itdboneReachable,
  itdboneTierFor,
  marketUrl,
  nextItdboneTier,
  type ItdboneTier,
} from "@/lib/itdb/config";
import { computeYield, programInputs, type YieldComputed } from "@/lib/server/accrual";
import { milestonesFor, type Milestone } from "@/lib/itdb/milestones";
import { earlyBirdMultiplier } from "@/lib/itdb/early-birds";
import { getDb } from "@/lib/server/db";
import { getFx } from "@/lib/server/fx";
import { sessionAccountId } from "@/lib/server/session";

export type LadderTier = ItdboneTier & {
  rangeMin: number;
  rangeMax: number | null;
  /** False when a higher tier's threshold undercuts this one */
  reachable: boolean;
};

export interface ItdboneSummary {
  token: { code: string; issuer: string };
  marketUrl: string;
  tier: LadderTier | null;
  next: (LadderTier & { needed: number }) | null;
  yield: YieldComputed;
  /** Every milestone for THIS token only */
  milestones: Milestone[];
  tiers: LadderTier[];
}

const withRange = (t: ItdboneTier): LadderTier => {
  const r = itdboneRange(t);
  return { ...t, rangeMin: r.min, rangeMax: r.max, reachable: itdboneReachable(t) };
};

/** GET /api/itdbone — the member's stablecoin tier, perks and daily yield. */
export async function GET(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const db = await getDb();
  const account = db.accounts.find((a) => a.id === id);
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  let inputs: { balance: number; since: number | null };
  let fx: Awaited<ReturnType<typeof getFx>>;
  try {
    [inputs, fx] = await Promise.all([programInputs("itdbone", account.wallets), getFx()]);
  } catch {
    return NextResponse.json(
      { error: "The Stellar network is busy — your figures are safe, try again shortly." },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }

  const tier = itdboneTierFor(inputs.balance);
  const nxt = nextItdboneTier(inputs.balance);
  const summary: ItdboneSummary = {
    token: ITDBONE_TOKEN,
    marketUrl: marketUrl(ITDBONE_TOKEN),
    tier: tier ? withRange(tier) : null,
    next: nxt
      ? { ...withRange(nxt), needed: Math.max(itdboneRange(nxt).min - inputs.balance, 0) }
      : null,
    milestones: milestonesFor("ITDBONE"),
    yield: computeYield("itdbone", inputs.balance, inputs.since, db.itdbone[id], fx, earlyBirdMultiplier(account.wallets)),
    tiers: ITDBONE_TIERS.map(withRange),
  };
  return NextResponse.json(summary);
}
