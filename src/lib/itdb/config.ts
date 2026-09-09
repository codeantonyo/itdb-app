/**
 * ITDB / ITDBONE / QRS — tier data.
 *
 * The ITDBONE hold ranges were the blocking question in §8.1 of the
 * brief; the reward-engine spec settles them and they are now stated
 * once, below. The QRS gold basis (§8.2) is still open: the spec gives
 * BOTH "100 grams per QRS" and a tier table worth exactly twice that,
 * so the one-line switch stays.
 *
 * Every basket here is a SIMULATED position held against the member's
 * account, priced at live rates — the same model NEWBANK uses for
 * NEWVAULT metals and NEWXUSD yield. Nothing is allocated off-chain,
 * and the UI says so on every surface where a member sees a figure.
 */

export { ITDB_TOKEN, ITDBONE_TOKEN, QRS_TOKEN, marketUrl } from "@/lib/stellar/registry";

export const DAY_MS = 86_400_000;

/**
 * Wallets a member may link: the primary they registered with, plus two
 * more. Holdings across all of them count toward every tier, so the cap
 * bounds how much Horizon work one account can trigger per read.
 */
export const MAX_WALLETS = 3;

/**
 * Yield accrues continuously, so without a floor a member could collect
 * a fraction of a dollar every second — spamming the ledger and their
 * own Telegram. A minimum plus a cooldown keeps collecting meaningful
 * without ever costing anyone their yield (it keeps accruing either way).
 */
export const MIN_COLLECT_USD = 1;
export const COLLECT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

/* ------------------------------------------------------------------ */
/*  ITDB — the reserve basket, per 1 ITDB held                         */
/* ------------------------------------------------------------------ */

export interface ReserveLine {
  id: string;
  label: string;
  /** Plain-language name for older members */
  name: string;
  /** Units per 1 ITDB, before the tier multiplier */
  perToken: number;
  /** "asset" converts at live price; "fiat" at live FX; "usd" is a dollar basket */
  kind: "asset" | "fiat" | "usd";
  /** Asset/currency ticker for pricing; null for USD baskets */
  ticker: string | null;
  /** Indicative USD value per 1 ITDB, for display only */
  indicativeUsd: number;
  color: string;
}

export const ITDB_RESERVES: ReserveLine[] = [
  { id: "ixlm",   label: "IXLM",   name: "Stellar Lumens",     perToken: 100_000, kind: "asset", ticker: "XLM", indicativeUsd:  15_000, color: "#8ecbff" },
  { id: "ixrp",   label: "IXRP",   name: "XRP",                perToken: 100_000, kind: "asset", ticker: "XRP", indicativeUsd:  50_000, color: "#b6c2d4" },
  { id: "ixdc",   label: "IXDC",   name: "XDC Network",        perToken: 100_000, kind: "asset", ticker: "XDC", indicativeUsd:  10_000, color: "#5fd0c8" },
  { id: "iusd",   label: "IUSD",   name: "US Dollars",         perToken:  10_000, kind: "fiat",  ticker: "USD", indicativeUsd:  10_000, color: "#46e5b0" },
  { id: "iaud",   label: "IAUD",   name: "Australian Dollars", perToken:  10_000, kind: "fiat",  ticker: "AUD", indicativeUsd:  10_000, color: "#f0b78e" },
  { id: "igbp",   label: "IGBP",   name: "Pounds Sterling",    perToken:  10_000, kind: "fiat",  ticker: "GBP", indicativeUsd:  15_000, color: "#c9a0ff" },
  { id: "ieur",   label: "IEUR",   name: "Euros",              perToken:  10_000, kind: "fiat",  ticker: "EUR", indicativeUsd:  12_000, color: "#7fa8ff" },
  { id: "istock", label: "ISTOCK", name: "Global stocks",      perToken: 100_000, kind: "usd",   ticker: null,  indicativeUsd: 100_000, color: "#ffd782" },
  { id: "imetal", label: "IMETAL", name: "Precious metals",    perToken: 100_000, kind: "usd",   ticker: null,  indicativeUsd: 100_000, color: "#d4a017" },
];

/** ~$322,000 per 1 ITDB at the indicative rates above. */
export const ITDB_INDICATIVE_PER_TOKEN = ITDB_RESERVES.reduce(
  (sum, r) => sum + r.indicativeUsd,
  0,
);

export interface ItdbTier {
  tier: number;
  min: number;
  max: number | null;
  multiplier: number;
  /** Indicative basket value per 1 ITDB held at this tier, display only */
  indicativeUsd: number;
}

export const ITDB_TIERS: ItdbTier[] = [
  { tier: 1,  min:     100, max:     500, multiplier:     1, indicativeUsd:     322_000 },
  { tier: 2,  min:     501, max:   1_000, multiplier:     3, indicativeUsd:     966_000 },
  { tier: 3,  min:   1_001, max:   2_500, multiplier:     8, indicativeUsd:   2_576_000 },
  { tier: 4,  min:   2_501, max:   5_000, multiplier:    20, indicativeUsd:   6_440_000 },
  { tier: 5,  min:   5_001, max:  10_000, multiplier:    50, indicativeUsd:  16_100_000 },
  { tier: 6,  min:  10_001, max:  20_000, multiplier:   100, indicativeUsd:  32_200_000 },
  { tier: 7,  min:  20_001, max:  50_000, multiplier:   250, indicativeUsd:  80_500_000 },
  { tier: 8,  min:  50_001, max: 100_000, multiplier:   500, indicativeUsd: 161_000_000 },
  { tier: 9,  min: 100_001, max: 250_000, multiplier: 1_000, indicativeUsd: 322_000_000 },
  { tier: 10, min: 250_001, max:    null, multiplier: 2_500, indicativeUsd: 805_000_000 },
];

/* ------------------------------------------------------------------ */
/*  ITDBONE — the bank stablecoin                                      */
/* ------------------------------------------------------------------ */

export type MetalsPerk = "quarterly-gs" | "quarterly-gsp" | "monthly-gsp";

export const METALS_PERK_LABEL: Record<MetalsPerk, string> = {
  "quarterly-gs": "Quarterly gold & silver",
  "quarterly-gsp": "Quarterly gold, silver & platinum",
  "monthly-gsp": "Monthly gold, silver & platinum",
};

export interface ItdboneTier {
  tier: number;
  /** Entry threshold. The tier's upper bound is derived — see itdboneRange. */
  min: number;
  /** Daily currency allowance, USD */
  dailyUsd: number;
  dailyXlm: number;
  dailyXrp: number;
  dailyXdc: number;
  apyPct: number;
  cashbackPct: number;
  goldAccess: boolean;
  priorityWithdrawals: boolean;
  /** null = none */
  metals: MetalsPerk | null;
  vipSupport: boolean;
  privateBanking: boolean;
  founderStatus: boolean;
  lifetimeRewards: boolean;
}

/**
 * Perks are derived from the tier number rather than set per row, so a
 * threshold can only ever be stated once. Thresholds are the ones in
 * the reward-engine spec: gold access from 3, priority withdrawals
 * from 4, VIP support from 5, private banking from 7, founder status
 * from 8, lifetime rewards at 10.
 */
const metalsAt = (tier: number): MetalsPerk | null =>
  tier >= 8 ? "monthly-gsp" : tier >= 6 ? "quarterly-gsp" : tier >= 4 ? "quarterly-gs" : null;

const one = (
  tier: number,
  min: number,
  dailyUsd: number,
  daily: number,
  apyPct: number,
  cashbackPct: number,
): ItdboneTier => ({
  tier,
  min,
  dailyUsd,
  dailyXlm: daily,
  dailyXrp: daily,
  dailyXdc: daily,
  apyPct,
  cashbackPct,
  goldAccess: tier >= 3,
  priorityWithdrawals: tier >= 4,
  vipSupport: tier >= 5,
  privateBanking: tier >= 7,
  founderStatus: tier >= 8,
  lifetimeRewards: tier >= 10,
  metals: metalsAt(tier),
});

/**
 * The authoritative ladder — entry thresholds ONLY.
 *
 * These are the "50% OFF ALL TIERS" figures Tony announced on
 * 2026-09-07, taken verbatim from the marketing post, including Tier 7
 * at 25,000 (he confirmed to use exactly what the post shows even
 * though every other tier is exactly half its old threshold and half of
 * 250,000 would be 125,000). The discount is permanent and the rewards
 * per tier are unchanged; only the entry bar moved.
 *
 * CONSEQUENCE OF TIER 7 AT 25,000: a member is put in the highest tier
 * whose threshold they clear, so anyone from 25,000 upward clears Tier
 * 7 and Tiers 5 and 6 can no longer be reached by anybody. Nothing is
 * hidden — `itdboneRange` derives each tier's real span from the
 * thresholds, so an unreachable tier reports itself as such rather than
 * displaying a range it would never assign. Setting Tier 7 back to
 * 125_000 restores Tiers 5 and 6 with no other change.
 *
 * No `max` is stored: a second column can disagree with the thresholds,
 * and that is exactly the kind of drift that produces a wrong tier.
 */
export const ITDBONE_TIERS: ItdboneTier[] = [
  one(1,        500,     250_000,     2_500_000,    100, 40),
  one(2,      2_500,     500_000,     5_000_000,    200, 45),
  one(3,      5_000,   1_000_000,    10_000_000,    400, 50),
  one(4,     12_500,   2_500_000,    25_000_000,    600, 55),
  one(5,     25_000,   5_000_000,    50_000_000,  1_000, 60),
  one(6,     50_000,  10_000_000,   100_000_000,  1_500, 65),
  one(7,     25_000,  25_000_000,   250_000_000,  2_500, 70),
  one(8,    250_000,  50_000_000,   500_000_000,  4_000, 75),
  one(9,    500_000, 100_000_000, 1_000_000_000,  6_000, 80),
  one(10, 2_500_000, 250_000_000, 2_500_000_000, 10_000, 90),
];

/**
 * A tier's real span, derived from the thresholds rather than stored.
 *
 * Assignment puts a member in the highest-numbered tier whose threshold
 * they clear, so tier i holds balances from its own threshold up to
 * just below the LOWEST threshold of any tier above it. When a higher
 * tier undercuts this one, `max` comes out below `min` and the tier is
 * unreachable — see `itdboneReachable`.
 */
export function itdboneRange(t: ItdboneTier): { min: number; max: number | null } {
  const above = ITDBONE_TIERS.filter((x) => x.tier > t.tier).map((x) => x.min);
  return { min: t.min, max: above.length > 0 ? Math.min(...above) - 1 : null };
}

/** False when a higher tier's threshold sits at or below this one's. */
export function itdboneReachable(t: ItdboneTier): boolean {
  const { min, max } = itdboneRange(t);
  return max === null || max >= min;
}

/* ------------------------------------------------------------------ */
/*  QRS — gold-referenced reserve token                                */
/* ------------------------------------------------------------------ */

/**
 * QRS gold backing — SETTLED 2026-09-06 by Tony. One QRS is referenced
 * to 100 g of gold, so 10,000 QRS = 1 tonne and the whole 100,000,000
 * supply stands against 10,000 t. The tier table no longer carries a
 * gold column of its own: every gold figure in the app derives from
 * this one ratio, so the two can never drift apart again.
 *
 * QRS is therefore valued at the live gold price of 100 g rather than
 * at its DEX quote (`qrsGoldBackingUsd`). The DEX quote stays visible
 * beside it — a member who sells on the open market gets that price,
 * and hiding it would misrepresent what they can actually realise.
 */
export const QRS_GRAMS_PER_TOKEN = 100;
export const QRS_TOTAL_KG = 10_000_000;
export const QRS_TOTAL_SUPPLY = 100_000_000;

export type QrsCrypto =
  | "XLM" | "XRP" | "XDC" | "QNT" | "HBAR" | "ADA" | "SOL" | "DOT" | "MATIC" | "LINK";

export type QrsMetal =
  | "platinum" | "silver" | "palladium" | "rhodium" | "iridium" | "osmium" | "tungsten";

export const QRS_METAL_LABEL: Record<QrsMetal | "gold", string> = {
  gold: "Gold",
  platinum: "Platinum",
  silver: "Silver",
  palladium: "Palladium",
  rhodium: "Rhodium",
  iridium: "Iridium",
  osmium: "Osmium",
  tungsten: "Tungsten",
};

export interface QrsTier {
  tier: number;
  min: number;
  max: number | null;
  dailyUsd: number;
  /** Daily crypto yield by ticker; absent = not granted at this tier */
  daily: Partial<Record<QrsCrypto, number>>;
  /** Precious-metal reserve positions, kg by metal */
  metalsKg: Partial<Record<QrsMetal, number>>;
}

export const QRS_TIERS: QrsTier[] = [
  { tier: 1, min: 10_000, max: 24_999,
    dailyUsd: 500_000,
    daily: { XLM: 50_000_000, XRP: 5_000_000 },
    metalsKg: { platinum: 100 } },

  { tier: 2, min: 25_000, max: 49_999,
    dailyUsd: 2_000_000,
    daily: { XLM: 200_000_000, XRP: 20_000_000, XDC: 10_000_000 },
    metalsKg: { platinum: 250 } },

  { tier: 3, min: 50_000, max: 99_999,
    dailyUsd: 10_000_000,
    daily: { XLM: 1_000_000_000, XRP: 100_000_000, XDC: 50_000_000, QNT: 20_000_000 },
    metalsKg: { platinum: 1_000 } },

  { tier: 4, min: 100_000, max: 249_999,
    dailyUsd: 50_000_000,
    daily: { XLM: 5_000_000_000, XRP: 500_000_000, XDC: 200_000_000, QNT: 100_000_000, HBAR: 50_000_000 },
    metalsKg: { palladium: 5_000, rhodium: 2_000 } },

  { tier: 5, min: 250_000, max: 499_999,
    dailyUsd: 200_000_000,
    daily: { XLM: 20_000_000_000, XRP: 5_000_000_000, XDC: 2_000_000_000, QNT: 1_000_000_000, HBAR: 500_000_000, ADA: 250_000_000 },
    metalsKg: { silver: 15_000, iridium: 6_000 } },

  { tier: 6, min: 500_000, max: 999_999,
    dailyUsd: 1_000_000_000,
    daily: { XLM: 100_000_000_000, XRP: 50_000_000_000, XDC: 20_000_000_000, QNT: 10_000_000_000, HBAR: 5_000_000_000, ADA: 2_500_000_000, SOL: 1_000_000_000 },
    metalsKg: { silver: 50_000, rhodium: 20_000, osmium: 10_000 } },

  { tier: 7, min: 1_000_000, max: 2_499_999,
    dailyUsd: 5_000_000_000,
    daily: { XLM: 500_000_000_000, XRP: 200_000_000_000, XDC: 100_000_000_000, QNT: 50_000_000_000, HBAR: 25_000_000_000, ADA: 10_000_000_000, SOL: 5_000_000_000, DOT: 2_500_000_000 },
    metalsKg: { silver: 200_000, platinum: 100_000, iridium: 40_000 } },

  { tier: 8, min: 2_500_000, max: 4_999_999,
    dailyUsd: 20_000_000_000,
    daily: { XLM: 2_000_000_000_000, XRP: 1_000_000_000_000, XDC: 500_000_000_000, QNT: 200_000_000_000, HBAR: 100_000_000_000, ADA: 50_000_000_000, SOL: 20_000_000_000, DOT: 10_000_000_000 },
    metalsKg: { silver: 1_000_000, platinum: 500_000, palladium: 200_000, rhodium: 100_000 } },

  { tier: 9, min: 5_000_000, max: 9_999_999,
    dailyUsd: 100_000_000_000,
    daily: { XLM: 10_000_000_000_000, XRP: 5_000_000_000_000, XDC: 2_000_000_000_000, QNT: 1_000_000_000_000, HBAR: 500_000_000_000, ADA: 200_000_000_000, SOL: 100_000_000_000, DOT: 50_000_000_000, MATIC: 20_000_000_000 },
    metalsKg: { silver: 5_000_000, platinum: 2_000_000, palladium: 1_000_000, rhodium: 500_000, tungsten: 200_000 } },

  { tier: 10, min: 10_000_000, max: null,
    dailyUsd: 500_000_000_000,
    daily: { XLM: 50_000_000_000_000, XRP: 20_000_000_000_000, XDC: 10_000_000_000_000, QNT: 5_000_000_000_000, HBAR: 2_500_000_000_000, ADA: 1_000_000_000_000, SOL: 500_000_000_000, DOT: 200_000_000_000, MATIC: 100_000_000_000, LINK: 50_000_000_000 },
    metalsKg: { silver: 20_000_000, platinum: 10_000_000, palladium: 5_000_000, rhodium: 2_000_000, iridium: 1_000_000, tungsten: 500_000 } },
];

/* ------------------------------------------------------------------ */
/*  Lookups                                                            */
/* ------------------------------------------------------------------ */

/**
 * Tier from what the member HOLDS — and only that (§6.3). Never derive
 * eligibility by subtracting one funding route from another.
 */
const findTier = <T extends { min: number }>(tiers: T[], balance: number): T | null =>
  balance > 0 ? ([...tiers].reverse().find((t) => balance >= t.min) ?? null) : null;

export const itdbTierFor = (balance: number) => findTier(ITDB_TIERS, balance);
export const qrsTierFor = (balance: number) => findTier(QRS_TIERS, balance);

export function itdboneTierFor(balance: number): ItdboneTier | null {
  if (!(balance > 0)) return null;
  return (
    [...ITDBONE_TIERS]
      .reverse()
      .find((t) => balance >= itdboneRange(t).min) ?? null
  );
}

/** The tier above the member's current one, for the "next step" line. */
export function nextItdbTier(balance: number): ItdbTier | null {
  const n = (itdbTierFor(balance)?.tier ?? 0) + 1;
  return ITDB_TIERS.find((t) => t.tier === n) ?? null;
}
/**
 * The tier a member would actually reach next: the lowest threshold
 * above their balance among tiers that are reachable at all. Picking
 * "current tier + 1" would point at an unreachable tier and promise a
 * step up that buying more would not deliver.
 */
export function nextItdboneTier(balance: number): ItdboneTier | null {
  return (
    ITDBONE_TIERS.filter((t) => itdboneReachable(t) && t.min > balance).sort(
      (a, b) => a.min - b.min,
    )[0] ?? null
  );
}
export function nextQrsTier(balance: number): QrsTier | null {
  const n = (qrsTierFor(balance)?.tier ?? 0) + 1;
  return QRS_TIERS.find((t) => t.tier === n) ?? null;
}

/**
 * A member's ITDB basket, per the reward-engine formula:
 *
 *   units = (per-token entitlement x balance) x tier multiplier
 *
 * The milestone multiplier is applied on top of this by the caller, so
 * the full rule is (Base x Tier) x Milestone. Tony confirmed 2026-09-06
 * that the balance term belongs here and that the tier table's
 * `indicativeUsd` is a PER-TOKEN reference, not the member's total.
 */
export function itdbBasket(balance: number): { line: ReserveLine; units: number }[] {
  const tier = itdbTierFor(balance);
  if (!tier) return [];
  return ITDB_RESERVES.map((line) => ({
    line,
    units: line.perToken * balance * tier.multiplier,
  }));
}

/**
 * Gold reference for a QRS holding: 1 QRS = 100 g, so 10,000 QRS = 1 t.
 * This is the single ratio — there is no tier-table alternative.
 */
export function qrsGoldKg(balance: number): number {
  return (balance * QRS_GRAMS_PER_TOKEN) / 1000;
}

/** What a tier's entry holding is worth in gold, on the same ratio. */
export function qrsTierGoldKg(tier: QrsTier): number {
  return qrsGoldKg(tier.min);
}

/** USD backing of 1 QRS: the live price of 100 g of gold. */
export function qrsGoldBackingUsd(goldUsdPerKg: number): number {
  return (goldUsdPerKg * QRS_GRAMS_PER_TOKEN) / 1000;
}
