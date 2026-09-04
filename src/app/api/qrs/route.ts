import { NextResponse } from "next/server";
import {
  QRS_GOLD_BASIS,
  QRS_GRAMS_PER_TOKEN,
  QRS_METAL_LABEL,
  QRS_TIERS,
  QRS_TOKEN,
  QRS_TOTAL_KG,
  QRS_TOTAL_SUPPLY,
  marketUrl,
  nextQrsTier,
  qrsGoldKg,
  qrsTierFor,
  type QrsMetal,
  type QrsTier,
} from "@/lib/itdb/config";
import { computeYield, programInputs, type YieldComputed } from "@/lib/server/accrual";
import { getDb } from "@/lib/server/db";
import { getFx, type PriceSource } from "@/lib/server/fx";
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
  /** Gold reference under the active basis (see config TODO) */
  gold: MetalPosition & { basis: typeof QRS_GOLD_BASIS; tierTableKg: number; gramsPerToken: number };
  metals: MetalPosition[];
  reservesUsd: number;
  backing: { totalKg: number; totalSupply: number; gramsPerToken: number };
  tiers: QrsTier[];
}

/** GET /api/qrs — the member's QRS tier, daily yield and metal reference positions. */
export async function GET(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const db = await getDb();
  const account = db.accounts.find((a) => a.id === id);
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  let inputs: { balance: number; since: number | null };
  let fx: Awaited<ReturnType<typeof getFx>>;
  try {
    [inputs, fx] = await Promise.all([programInputs("qrs", account.wallets), getFx()]);
  } catch {
    return NextResponse.json(
      { error: "The Stellar network is busy — your figures are safe, try again shortly." },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }

  const tier = qrsTierFor(inputs.balance);
  const nxt = nextQrsTier(inputs.balance);

  const goldKg = tier ? qrsGoldKg(inputs.balance, tier) : 0;
  const gold = {
    metal: "gold" as const,
    label: QRS_METAL_LABEL.gold,
    kg: goldKg,
    usdPerKg: fx.metalUsdPerKg("gold"),
    valueUsd: goldKg * fx.metalUsdPerKg("gold"),
    source: fx.metalSourceOf("gold"),
    basis: QRS_GOLD_BASIS,
    tierTableKg: tier?.goldKg ?? 0,
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
    yield: computeYield("qrs", inputs.balance, inputs.since, db.qrs[id], fx),
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
