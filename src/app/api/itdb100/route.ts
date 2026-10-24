import { NextResponse } from "next/server";
import {
  I100_EARLY_DIVIDEND,
  I100_GATES,
  I100_MEMO,
  I100_SUPPLY,
  I100_TIERS,
  accruedDividend,
  earlyStep,
  gateTimes,
  i100TierFor,
  isEarly,
  saleUnits,
  walletDue,
} from "@/lib/itdb/itdb100";
import { getDb, mutateDb } from "@/lib/server/db";
import { memberHoldings, tokenBalance } from "@/lib/server/holdings";
import { i100Chain, type I100Bonus } from "@/lib/server/itdb100-chain";
import { sessionAccountId } from "@/lib/server/session";
import { ITDB100_TOKEN } from "@/lib/stellar/registry";

export interface I100Summary {
  /** Of the 100,000: XLM raised at the 1 XLM price. Null when the sales could not be read */
  sold: number | null;
  soldPct: number;
  gates: { pct: number; openedAt: number | null }[];

  /** ITDB100 held on chain; null when Horizon could not be read */
  holding: number | null;
  bought: number;
  /** Bonus tokens owed and not yet received — counted toward the tier */
  pending: number;
  counted: number;
  /** The Ratchet: the highest tier ever reached, never lower */
  tier: number | null;
  next: { tier: number; min: number; needed: number } | null;

  early: { tokens: number; xlm: number; pct: number; usd: number } | null;
  /** Bonus tokens, each with how much has reached the wallet */
  bonusTokens: { kind: "early" | "gate"; gate?: number; due: number; sent: number; txHash: string | null }[];

  dividend: { perDay: number; multiplier: number; accrued: number };
  credited: {
    welcome: number;
    stock: number;
    silverG: number;
    goldG: number;
    earlyUsd: number;
    metals: { code: string; amount: number }[];
    perks: string[];
  };
}

async function load(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return null;
  const db = await getDb();
  return db.accounts.find((a) => a.id === id) ?? null;
}

const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);
const sentFor = (bonuses: I100Bonus[], wallets: Set<string>, memo: string) =>
  bonuses.filter((b) => wallets.has(b.wallet) && b.memo === memo);

/** GET /api/itdb100 — the sale, and this member's tier, dividend and bonuses. */
export async function GET(req: Request) {
  const me = await load(req);
  if (!me) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const [holding, chain] = await Promise.all([
    memberHoldings(me.wallets).then(
      (h) => tokenBalance(h, ITDB100_TOKEN),
      () => null,
    ),
    i100Chain(),
  ]);
  const sales = chain?.sales ?? [];
  const bonuses = chain?.bonuses ?? [];
  const now = Date.now();
  const gates = gateTimes(sales);
  const sold = sum(sales.map(saleUnits));
  const wallets = new Set(me.wallets);
  const opening = sales[0]?.at ?? Infinity;

  // ---- what each of my wallets is owed, and what has arrived ----------
  const dues = me.wallets.map((w) => ({ w, d: walletDue(w, sales, gates) }));
  const bonusTokens: I100Summary["bonusTokens"] = [];
  const row = (kind: "early" | "gate", memo: string, due: number, gate?: number) => {
    if (due <= 0) return;
    const paid = sentFor(bonuses, wallets, memo);
    bonusTokens.push({ kind, gate, due, sent: sum(paid.map((b) => b.amount)), txHash: paid[0]?.txHash ?? null });
  };
  row("early", I100_MEMO.early, sum(dues.map((x) => x.d.earlyBonus)));
  for (const g of I100_GATES) row("gate", I100_MEMO.gate(g.pct), sum(dues.map((x) => x.d.gateBonus[g.pct] ?? 0)), g.pct);
  const pending = sum(bonusTokens.map((b) => Math.max(b.due - b.sent, 0)));

  // ---- the tier, and The Ratchet --------------------------------------
  const counted = (holding ?? 0) + pending;
  const live = i100TierFor(counted)?.tier ?? 0;
  const stored = (await getDb()).itdb100[me.id]?.reached ?? {};
  const peak = Math.max(0, ...Object.keys(stored).map(Number));
  if (holding !== null && live > peak)
    await mutateDb((db) => {
      const r = ((db.itdb100[me.id] ??= { reached: {} }).reached);
      for (let t = 1; t <= live; t++) r[t] ??= now;
      return null;
    });
  const reached = (await getDb()).itdb100[me.id]?.reached ?? {};
  const tierNo = Math.max(peak, holding !== null ? live : 0);
  const tier = tierNo ? I100_TIERS[tierNo - 1] : null;
  const nxt = I100_TIERS[tierNo] ?? null;

  // ---- dividend ---------------------------------------------------------
  const myEarly = sales.filter((s) => wallets.has(s.wallet) && isEarly(s, opening));
  const earlySince = myEarly[0]?.at ?? null;
  const multiplier = Math.max(
    1,
    earlySince !== null ? I100_EARLY_DIVIDEND : 1,
    ...I100_GATES.filter((g) => gates[g.pct] !== null).map((g) => g.dividend),
  );

  // ---- early birds and gate credits -----------------------------------
  const earlyTokens = sum(dues.map((x) => x.d.earlyTokens));
  const earlyXlm = sum(dues.map((x) => x.d.earlyXlm));
  const earlyUsd = sum(dues.map((x) => earlyStep(x.d.earlyXlm)?.usd ?? 0));
  const boughtBefore = (at: number) => sales.some((s) => wallets.has(s.wallet) && s.at <= at);
  const opened = I100_GATES.filter((g) => gates[g.pct] !== null && boughtBefore(gates[g.pct]!));

  const summary: I100Summary = {
    sold: chain ? sold : null,
    soldPct: Math.min((sold / I100_SUPPLY) * 100, 100),
    gates: I100_GATES.map((g) => ({ pct: g.pct, openedAt: gates[g.pct] })),

    holding,
    bought: sum(sales.filter((s) => wallets.has(s.wallet)).map((s) => s.amount)),
    pending,
    counted,
    tier: tier?.tier ?? null,
    next: nxt ? { tier: nxt.tier, min: nxt.min, needed: Math.max(nxt.min - counted, 0) } : null,

    early: earlyTokens > 0 ? { tokens: earlyTokens, xlm: earlyXlm, pct: earlyStep(earlyXlm)?.pct ?? 0, usd: earlyUsd } : null,
    bonusTokens,

    dividend: {
      perDay: (tier?.daily ?? 0) * multiplier,
      multiplier,
      accrued: accruedDividend(reached as Record<number, number>, gates, earlySince, now),
    },
    credited: {
      welcome: tier?.welcome ?? 0,
      stock: tier?.stock ?? 0,
      silverG: tier?.silverG ?? 0,
      goldG: tier?.goldG ?? 0,
      earlyUsd,
      metals: opened.map((g) => g.metal),
      perks: [
        ...I100_TIERS.slice(0, tierNo).map((x) => x.perk),
        ...(earlySince !== null ? ["First priority on every future phase"] : []),
        ...opened.flatMap((g) => g.perks),
      ],
    },
  };
  return NextResponse.json(summary);
}
