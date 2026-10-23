/**
 * ITDB 100 — the ICO. Pure data and maths, safe to import on the client.
 *
 * Everything a member is entitled to comes from the CHAIN: what each
 * wallet bought from the distributor, when, and at what price. Early
 * birds are the orders placed at 0.5 XLM before launch, filled when the
 * distributor opened; the public sale is 1 XLM.
 *
 * Bonus TOKENS are paid on chain by scripts/pay-itdb100.mjs (memo
 * "I100 …"). Dollars, stock, metals and dividends are credited in the app.
 */

export const I100_ISSUER = "GC2SCEDYLDH6ZYNQOL7HBMFIH73U4RVYGXHC6P64YQ3BUHKXTTQQITDB";
export const I100_DISTRIBUTOR = "GBAR5C4B6JZIWWD2E5BZHVZM3HZUTZIVZ3HWDFFOV2Q3RKDYSJL44QFS";
/** On sale; "X% sold" and the gates are measured against this, not the 1B issued. */
export const I100_SUPPLY = 100_000;
export const I100_PRICE_XLM = 1;
export const I100_EARLY_PRICE_XLM = 0.5;
/** Bonus payments from the distributor carry a memo starting with this. */
export const I100_MEMO_PREFIX = "I100 ";
export const I100_MEMO = { early: "I100 EB", gate: (pct: number) => `I100 G${pct}` };

/* ------------------------------------------------------------------ */
/*  Tiers                                                              */
/* ------------------------------------------------------------------ */

export interface I100Tier {
  tier: number;
  min: number;
  /** USD a day */
  daily: number;
  welcome: number;
  /** USD of shares of the 100 */
  stock: number;
  silverG: number;
  goldG: number;
  perk: string;
}

const t = (tier: number, min: number, daily: number, welcome: number, stock: number, silverG: number, goldG: number, perk: string): I100Tier =>
  ({ tier, min, daily, welcome, stock, silverG, goldG, perk });

export const I100_TIERS: I100Tier[] = [
  t(1, 100, 25_000, 250_000, 25_000, 100, 0, "Standard card"),
  t(2, 250, 50_000, 500_000, 75_000, 250, 0, "Metal card"),
  t(3, 500, 100_000, 1_000_000, 150_000, 500, 50, "Personal advisor"),
  t(4, 1_000, 200_000, 2_000_000, 300_000, 1_000, 150, "Branch ownership"),
  t(5, 2_500, 500_000, 5_000_000, 750_000, 2_500, 400, "Personal banker"),
  t(6, 5_000, 1_000_000, 10_000_000, 1_500_000, 5_000, 1_000, "Custom vault"),
  t(7, 10_000, 2_000_000, 20_000_000, 3_000_000, 10_000, 2_000, "Vault + board observer"),
  t(8, 25_000, 5_000_000, 35_000_000, 7_500_000, 20_000, 5_000, "Elite"),
  t(9, 50_000, 10_000_000, 50_000_000, 15_000_000, 40_000, 10_000, "Founders Council"),
  t(10, 100_000, 20_000_000, 100_000_000, 30_000_000, 100_000, 25_000, "Council seat · hereditary"),
];

export const i100TierFor = (tokens: number) => [...I100_TIERS].reverse().find((x) => tokens >= x.min) ?? null;
export const i100TierMax = (x: I100Tier) => (I100_TIERS[x.tier] ? I100_TIERS[x.tier].min - 1 : null);

/* ------------------------------------------------------------------ */
/*  Early birds                                                        */
/* ------------------------------------------------------------------ */

/** By XLM spent in the early-bird sale. The highest step reached applies. */
export const I100_EARLY_STEPS = [
  { xlm: 100, pct: 100, usd: 250_000 },
  { xlm: 500, pct: 150, usd: 750_000 },
  { xlm: 1_000, pct: 200, usd: 1_500_000 },
  { xlm: 2_500, pct: 250, usd: 2_500_000 },
  { xlm: 5_000, pct: 300, usd: 5_000_000 },
];
export const earlyStep = (xlm: number) => [...I100_EARLY_STEPS].reverse().find((s) => xlm >= s.xlm) ?? null;
/** Every early bird, whatever they spent: 2x dividend for life, and their tokens doubled (launch is 1 XLM, they paid 0.5). */
export const I100_EARLY_DIVIDEND = 2;

/* ------------------------------------------------------------------ */
/*  Gates — milestones by share sold. They ADD UP.                     */
/* ------------------------------------------------------------------ */

export interface I100Gate {
  pct: number;
  medal: string;
  name: string;
  /** Bonus tokens, % of what each buyer had bought when the gate opened */
  bonusPct: number;
  /** Daily dividend multiplier, for everyone, for life — the highest applies */
  dividend: number;
  metal: { code: string; amount: number };
  perks: string[];
}

export const I100_GATES: I100Gate[] = [
  { pct: 25, medal: "🥉", name: "Silver Gate", bonusPct: 100, dividend: 3, metal: { code: "SILVER", amount: 15_000 }, perks: ["Entry to THE FOUNDING WALL"] },
  { pct: 50, medal: "🥈", name: "Gold Gate", bonusPct: 200, dividend: 5, metal: { code: "GOLD", amount: 1_000 }, perks: ["GUARANTEED seat in Phase 2"] },
  {
    pct: 75, medal: "🥇", name: "Platinum Gate", bonusPct: 300, dividend: 8, metal: { code: "PLATINUM", amount: 250 },
    perks: ["LIFETIME share of settlement fees", "Permanent VIP status"],
  },
  {
    pct: 100, medal: "👑", name: "Palladium Gate", bonusPct: 500, dividend: 15, metal: { code: "PALLADIUM", amount: 20 },
    perks: ["Seat on the FOUNDING COUNCIL", "Access to EVERY future asset, for life", "Your name carved permanently into the ledger"],
  },
];

export const gateTarget = (g: I100Gate) => (I100_SUPPLY * g.pct) / 100;

/* ------------------------------------------------------------------ */
/*  From the chain                                                     */
/* ------------------------------------------------------------------ */

export interface I100Sale {
  wallet: string;
  amount: number;
  /** XLM paid */
  xlm: number;
  at: number;
}

/**
 * An early-bird purchase: one of the orders waiting when the sale opened
 * (they all fill in the opening ledger), or anything bought at the early
 * price. `opening` is the first sale's time.
 */
export const isEarly = (s: I100Sale, opening: number) =>
  s.at <= opening || (s.amount > 0 && s.xlm / s.amount <= I100_EARLY_PRICE_XLM + 1e-6);

/** When each gate opened: the sale that took the total past its target. Sales oldest first. */
export function gateTimes(sales: I100Sale[]): Record<number, number | null> {
  const out: Record<number, number | null> = {};
  let sold = 0;
  for (const g of I100_GATES) out[g.pct] = null;
  for (const s of sales) {
    sold += s.amount;
    for (const g of I100_GATES) if (out[g.pct] === null && sold >= gateTarget(g)) out[g.pct] = s.at;
  }
  return out;
}

export interface WalletDue {
  /** Tokens bought at the early price, XLM spent on them */
  earlyTokens: number;
  earlyXlm: number;
  /** Early-bird bonus tokens: the step's % plus the doubling */
  earlyBonus: number;
  /** Bonus tokens per opened gate: % of what was bought by the moment it opened */
  gateBonus: Record<number, number>;
}

/** What one wallet is owed in bonus tokens. Pure; the script and the app both use these rules. */
export function walletDue(wallet: string, sales: I100Sale[], gates: Record<number, number | null>): WalletDue {
  const mine = sales.filter((s) => s.wallet === wallet);
  const opening = sales[0]?.at ?? Infinity;
  const early = mine.filter((s) => isEarly(s, opening));
  const earlyTokens = early.reduce((t, s) => t + s.amount, 0);
  const earlyXlm = early.reduce((t, s) => t + s.xlm, 0);
  const step = earlyStep(earlyXlm);
  const gateBonus: Record<number, number> = {};
  for (const g of I100_GATES) {
    const at = gates[g.pct];
    if (at === null) continue;
    const bought = mine.filter((s) => s.at <= at).reduce((t, s) => t + s.amount, 0);
    if (bought > 0) gateBonus[g.pct] = (bought * g.bonusPct) / 100;
  }
  return {
    earlyTokens,
    earlyXlm,
    earlyBonus: earlyTokens > 0 ? (earlyTokens * ((step?.pct ?? 0) + 100)) / 100 : 0,
    gateBonus,
  };
}

/**
 * The daily dividend a member has earned from `from` to `now`, walking the
 * tiers they reached (The Ratchet: a tier once reached is never lost) and
 * the multiplier in force at each moment — the highest of the early-bird
 * 2x and every opened gate's.
 */
export function accruedDividend(
  reached: Record<number, number>,
  gates: Record<number, number | null>,
  earlySince: number | null,
  now: number,
): number {
  const marks = [...Object.values(reached), ...Object.values(gates).filter((x): x is number => x !== null), earlySince ?? Infinity]
    .filter((x) => x < now)
    .concat(now)
    .sort((a, b) => a - b);
  let total = 0;
  for (let i = 0; i < marks.length - 1; i++) {
    const from = marks[i];
    const tierNo = Math.max(0, ...Object.entries(reached).filter(([, at]) => at <= from).map(([tierNo]) => Number(tierNo)));
    if (!tierNo) continue;
    const mult = Math.max(
      1,
      earlySince !== null && earlySince <= from ? I100_EARLY_DIVIDEND : 1,
      ...I100_GATES.filter((g) => (gates[g.pct] ?? Infinity) <= from).map((g) => g.dividend),
    );
    total += (I100_TIERS[tierNo - 1].daily * mult * (marks[i + 1] - from)) / 86_400_000;
  }
  return total;
}
