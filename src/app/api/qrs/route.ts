import { NextResponse } from "next/server";
import {
  QRS_GRAMS_PER_TOKEN,
  QRS_METAL_LABEL,
  QRS_TIERS,
  QRS_TOKEN,
  QRS_TOTAL_KG,
  QRS_TOTAL_SUPPLY,
  marketUrl,
  nextQrsTier,
  qrsGoldBackingUsd,
  qrsGoldKg,
  qrsTierFor,
  type QrsMetal,
  type QrsTier,
} from "@/lib/itdb/config";
import { computeYield, programInputs, type YieldComputed } from "@/lib/server/accrual";
import { milestonesFor, type Milestone } from "@/lib/itdb/milestones";
import { tokenMultiplier } from "@/lib/itdb/early-birds";
import { getDb } from "@/lib/server/db";
import { getFx, type PriceSource } from "@/lib/server/fx";
import { presaleView, type PresaleBonusView } from "@/lib/server/presale";
import { ensureQrsBonus, type QrsBonusView } from "@/lib/server/qrs-bonus";
import { sessionAccountId } from "@/lib/server/session";

export interface MetalPosition {
  metal: QrsMetal | "gold";
  label: string;
  kg: number;
  usdPerKg: number;
  valueUsd: number;
  source: PriceSource;
}

export interface QrsSummary {
  token: { code: string; issuer: string };
  marketUrl: string;
  balance: number;
  tier: QrsTier | null;
  next: (QrsTier & { needed: number }) | null;
  yield: YieldComputed;
  /** Every milestone for THIS token only */
  milestones: Milestone[];
  /** Pre-sale early-bird bonuses; null when this member did not buy */
  presale: PresaleBonusView | null;
  /** The 25% milestone bonus: delivered, locked behind Tier 1, or n/a */
  bonus: QrsBonusView;
  /** Gold reference: 100 g per QRS, the single backing ratio */
  gold: MetalPosition & { gramsPerToken: number };
  /**
   * What 1 QRS is worth as gold — the live price of 100 g. This is the
   * value QRS is presented at; the DEX quote reaches the client through
   * the portfolio and is shown beside it.
   */
  backingUsd: number;
  metals: MetalPosition[];
  reservesUsd: number;
  backing: { totalKg: number; totalSupply: number; gramsPerToken: number };
  tiers: QrsTier[];
}

const amount = (n: number, unit: string, digits = 2) =>
  `${n.toLocaleString("en-US", { maximumFractionDigits: digits })} ${unit}`;

/** The member's own 25% milestone bonus, with its exact figure. */
function bonusMilestone(b: QrsBonusView): Milestone[] {
  if (b.state === "none" || b.state === "pending" || b.state === "duplicate") return [];
  if (b.state === "locked") {
    return [
      {
        id: "qrs-bonus-25",
        token: "QRS",
        title: `QRS ${b.pct}% Milestone Bonus`,
        detail: `Reach Tier 1 (${amount(b.tier1Min, "QRS", 0)}) to unlock — ${amount(b.needed, "QRS", 0)} to go.`,
        status: "locked",
        threshold: `Tier 1 · ${amount(b.tier1Min, "QRS", 0)}`,
      },
    ];
  }
  return [
    {
      id: "qrs-bonus-25",
      token: "QRS",
      title: `QRS ${b.pct}% Milestone Bonus — Delivered`,
      detail:
        `${b.pct}% of your ${amount(b.basisBalance, "QRS", 0)} balance, recorded on ` +
        `${new Date(b.awardedAt ?? Date.now()).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}` +
        (b.paidOnChainAt ? " and paid on chain." : ". Awaiting the on-chain payout from the issuer."),
      status: "delivered",
      amount: amount(b.bonusQrs, "QRS", 0),
    },
  ];
}

/**
 * The two pre-sale bonuses as milestones, with this member's exact
 * figures. Returns nothing at all for a wallet outside the allowlist.
 */
function presaleMilestones(p: PresaleBonusView | null): Milestone[] {
  if (!p) return [];
  return [
    {
      id: "qrs-presale-refund",
      token: "QRS",
      title: `${p.refundPct}% Refund (XLM)`,
      detail: p.paid
        ? `Paid onto your card as ${amount(p.paid.credited, p.paid.currency)}.`
        : `${p.refundPct}% of the ${amount(p.xlmSpent, "XLM")} you committed in the pre-sale, ready to take onto a card.`,
      status: "active",
      restricted: true,
      amount: amount(p.refundXlm, "XLM", 4),
    },
    {
      id: "qrs-presale-x2",
      token: "QRS",
      title: "×2 Tokens Drop (QRS)",
      detail: `Double the ${amount(p.qrsPurchased, "QRS", 0)} you bought in the pre-sale.`,
      status: "active",
      restricted: true,
      amount: amount(p.bonusQrs, "QRS", 0),
    },
  ];
}

/** GET /api/qrs — the member's QRS tier, daily yield and metal reference positions. */
export async function GET(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const db = await getDb();
  const account = db.accounts.find((a) => a.id === id);
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  let inputs: { balance: number; since: number | null; holders: string[] };
  let fx: Awaited<ReturnType<typeof getFx>>;
  try {
    [inputs, fx] = await Promise.all([programInputs("qrs", account.wallets), getFx()]);
  } catch {
    return NextResponse.json(
      { error: "The Stellar network is busy — your figures are safe, try again shortly." },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }

  // Eligibility is the allowlist, nothing else — a member who did not
  // buy in the pre-sale never sees these two bonuses.
  const presale = presaleView(account, db.presaleRefunds[id], fx);

  // Awarded on sight and only once — see lib/server/qrs-bonus.ts. No
  // tokens move here; this records what the issuer owes.
  const bonus = await ensureQrsBonus(
    account,
    db.qrsBonuses[id],
    inputs.balance,
    inputs.since,
    inputs.holders,
  );

  const tier = qrsTierFor(inputs.balance);
  const nxt = nextQrsTier(inputs.balance);

  // Gold follows the holding, not the tier: 100 g per QRS, always.
  const goldKg = qrsGoldKg(inputs.balance);
  const gold = {
    metal: "gold" as const,
    label: QRS_METAL_LABEL.gold,
    kg: goldKg,
    usdPerKg: fx.metalUsdPerKg("gold"),
    valueUsd: goldKg * fx.metalUsdPerKg("gold"),
    source: fx.metalSourceOf("gold"),
    gramsPerToken: QRS_GRAMS_PER_TOKEN,
  };
  const metals: MetalPosition[] = (
    Object.entries(tier?.metalsKg ?? {}) as [QrsMetal, number][]
  ).map(([metal, kg]) => ({
    metal,
    label: QRS_METAL_LABEL[metal],
    kg,
    usdPerKg: fx.metalUsdPerKg(metal),
    valueUsd: kg * fx.metalUsdPerKg(metal),
    source: fx.metalSourceOf(metal),
  }));

  const summary: QrsSummary = {
    token: QRS_TOKEN,
    marketUrl: marketUrl(QRS_TOKEN),
    balance: inputs.balance,
    tier,
    next: nxt ? { ...nxt, needed: Math.max(nxt.min - inputs.balance, 0) } : null,
    milestones: [...bonusMilestone(bonus), ...presaleMilestones(presale), ...milestonesFor("QRS")],
    presale,
    bonus,
    backingUsd: qrsGoldBackingUsd(fx.metalUsdPerKg("gold")),
    yield: computeYield("qrs", inputs.balance, inputs.since, db.qrs[id], fx, tokenMultiplier(account.wallets, "QRS")),
    gold,
    metals,
    reservesUsd: gold.valueUsd + metals.reduce((s, m) => s + m.valueUsd, 0),
    backing: {
      totalKg: QRS_TOTAL_KG,
      totalSupply: QRS_TOTAL_SUPPLY,
      gramsPerToken: QRS_GRAMS_PER_TOKEN,
    },
    tiers: QRS_TIERS,
  };
  return NextResponse.json(summary);
}
