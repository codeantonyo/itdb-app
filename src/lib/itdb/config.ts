/**
 * ITDB / ITDBONE / QRS — tier data, transcribed once from Tony's spec
 * (tiers.draft.ts in the project root).
 *
 * Two things are unresolved and marked TODO(tony) below — see §8 of
 * ITDB-BRIEF.md. Each has a one-line switch so the app ships now and
 * flips the moment he confirms.
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
  /** Indicative basket total at this tier, display only */
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

/**
 * TODO(tony): Tony's spec lists TWO hold ranges per tier. "primary" uses
 * the FIRST (higher) set, "alt" the second. Flip this one constant once
 * he confirms which ladder is authoritative — nothing else changes.
 */
export const ITDBONE_LADDER: "primary" | "alt" = "primary";

export type MetalsPerk = "quarterly-gs" | "quarterly-gsp" | "monthly-gsp";

export const METALS_PERK_LABEL: Record<MetalsPerk, string> = {
  "quarterly-gs": "Quarterly gold & silver",
  "quarterly-gsp": "Quarterly gold, silver & platinum",
  "monthly-gsp": "Monthly gold, silver & platinum",
};

export interface ItdboneTier {
  tier: number;
  min: number;
  max: number | null;
  altMin: number;
  altMax: number | null;
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

const one = (
  tier: number, min: number, max: number | null, altMin: number, altMax: number | null,
  dailyUsd: number, daily: number, apyPct: number, cashbackPct: number,
  extra: Partial<ItdboneTier> = {},
): ItdboneTier => ({
  tier, min, max, altMin, altMax,
  dailyUsd, dailyXlm: daily, dailyXrp: daily, dailyXdc: daily,
  apyPct, cashbackPct,
  goldAccess: true,
  priorityWithdrawals: false,
  metals: null,
  vipSupport: false,
  privateBanking: false,
  founderStatus: false,
  lifetimeRewards: false,
  ...extra,
});

export const ITDBONE_TIERS: ItdboneTier[] = [
  one(1,     1_000,     5_000,     500,     2_500,       250_000,     2_500_000,    100, 40),
  one(2,     5_001,    10_000,   2_501,     5_000,       500_000,     5_000_000,    200, 45),
  one(3,    10_001,    25_000,   5_001,    12_500,     1_000_000,    10_000_000,    400, 50, { priorityWithdrawals: true }),
  one(4,    25_001,    50_000,  12_501,    25_000,     2_500_000,    25_000_000,    600, 55, { priorityWithdrawals: true, metals: "quarterly-gs" }),
  one(5,    50_001,   100_000,  25_001,    50_000,     5_000_000,    50_000_000,  1_000, 60, { priorityWithdrawals: true, metals: "quarterly-gs", vipSupport: true }),
  one(6,   100_001,   250_000,  50_001,   125_000,    10_000_000,   100_000_000,  1_500, 65, { priorityWithdrawals: true, metals: "quarterly-gsp", vipSupport: true }),
  one(7,   250_001,   500_000, 125_001,   250_000,    25_000_000,   250_000_000,  2_500, 70, { priorityWithdrawals: true, metals: "quarterly-gsp", vipSupport: true, privateBanking: true }),
  one(8,   500_001, 1_000_000, 250_001,   500_000,    50_000_000,   500_000_000,  4_000, 75, { priorityWithdrawals: true, metals: "monthly-gsp", vipSupport: true, privateBanking: true, founderStatus: true }),
  one(9, 1_000_001, 5_000_000, 500_001, 2_500_000,   100_000_000, 1_000_000_000,  6_000, 80, { priorityWithdrawals: true, metals: "monthly-gsp", vipSupport: true, privateBanking: true, founderStatus: true }),
  one(10, 5_000_001,     null, 2_500_001,     null,   250_000_000, 2_500_000_000, 10_000, 90, { priorityWithdrawals: true, metals: "monthly-gsp", vipSupport: true, privateBanking: true, founderStatus: true, lifetimeRewards: true }),
];

/** The hold range in force for a tier under the active ladder. */
export function itdboneRange(t: ItdboneTier): { min: number; max: number | null } {
  return ITDBONE_LADDER === "alt"
    ? { min: t.altMin, max: t.altMax }
    : { min: t.min, max: t.max };
}

/* ------------------------------------------------------------------ */
/*  QRS — gold-referenced reserve token                                */
/* ------------------------------------------------------------------ */

/**
 * Stated backing rule: 10,000,000 kg over 100,000,000 tokens
 * = 100 g per QRS.
 *
 * TODO(tony): the tier table below grants exactly 2x that rule at every
 * tier (Tier 1 gives 2,000 kg for 10,000 QRS = 200 g/token). Until he
 * confirms which governs, the app shows the CONSERVATIVE per-token rule
 * as the member's gold reference and keeps the tier figure alongside.
 * Flip `QRS_GOLD_BASIS` to "tier-table" to reverse that.
 */
export const QRS_GOLD_BASIS: "per-token" | "tier-table" = "per-token";
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
  goldKg: number;
  /** Precious-metal reserve positions, kg by metal */
  metalsKg: Partial<Record<QrsMetal, number>>;
}

export const QRS_TIERS: QrsTier[] = [
  { tier: 1, min: 10_000, max: 24_999,
    dailyUsd: 500_000,
    daily: { XLM: 50_000_000, XRP: 5_000_000 },
    goldKg: 2_000, metalsKg: { platinum: 100 } },

  { tier: 2, min: 25_000, max: 49_999,
    dailyUsd: 2_000_000,
    daily: { XLM: 200_000_000, XRP: 20_000_000, XDC: 10_000_000 },
    goldKg: 4_000, metalsKg: { platinum: 250 } },

  { tier: 3, min: 50_000, max: 99_999,
    dailyUsd: 10_000_000,
    daily: { XLM: 1_000_000_000, XRP: 100_000_000, XDC: 50_000_000, QNT: 20_000_000 },
    goldKg: 10_000, metalsKg: { platinum: 1_000 } },

  { tier: 4, min: 100_000, max: 249_999,
    dailyUsd: 50_000_000,
    daily: { XLM: 5_000_000_000, XRP: 500_000_000, XDC: 200_000_000, QNT: 100_000_000, HBAR: 50_000_000 },
    goldKg: 20_000, metalsKg: { palladium: 5_000, rhodium: 2_000 } },

  { tier: 5, min: 250_000, max: 499_999,
    dailyUsd: 200_000_000,
    daily: { XLM: 20_000_000_000, XRP: 5_000_000_000, XDC: 2_000_000_000, QNT: 1_000_000_000, HBAR: 500_000_000, ADA: 250_000_000 },
    goldKg: 50_000, metalsKg: { silver: 15_000, iridium: 6_000 } },

  { tier: 6, min: 500_000, max: 999_999,
    dailyUsd: 1_000_000_000,
    daily: { XLM: 100_000_000_000, XRP: 50_000_000_000, XDC: 20_000_000_000, QNT: 10_000_000_000, HBAR: 5_000_000_000, ADA: 2_500_000_000, SOL: 1_000_000_000 },
    goldKg: 100_000, metalsKg: { silver: 50_000, rhodium: 20_000, osmium: 10_000 } },

  { tier: 7, min: 1_000_000, max: 2_499_999,
    dailyUsd: 5_000_000_000,
    daily: { XLM: 500_000_000_000, XRP: 200_000_000_000, XDC: 100_000_000_000, QNT: 50_000_000_000, HBAR: 25_000_000_000, ADA: 10_000_000_000, SOL: 5_000_000_000, DOT: 2_500_000_000 },
    goldKg: 250_000, metalsKg: { silver: 200_000, platinum: 100_000, iridium: 40_000 } },

  { tier: 8, min: 2_500_000, max: 4_999_999,
    dailyUsd: 20_000_000_000,
    daily: { XLM: 2_000_000_000_000, XRP: 1_000_000_000_000, XDC: 500_000_000_000, QNT: 200_000_000_000, HBAR: 100_000_000_000, ADA: 50_000_000_000, SOL: 20_000_000_000, DOT: 10_000_000_000 },
    goldKg: 500_000, metalsKg: { silver: 1_000_000, platinum: 500_000, palladium: 200_000, rhodium: 100_000 } },

  { tier: 9, min: 5_000_000, max: 9_999_999,
    dailyUsd: 100_000_000_000,
    daily: { XLM: 10_000_000_000_000, XRP: 5_000_000_000_000, XDC: 2_000_000_000_000, QNT: 1_000_000_000_000, HBAR: 500_000_000_000, ADA: 200_000_000_000, SOL: 100_000_000_000, DOT: 50_000_000_000, MATIC: 20_000_000_000 },
    goldKg: 1_000_000, metalsKg: { silver: 5_000_000, platinum: 2_000_000, palladium: 1_000_000, rhodium: 500_000, tungsten: 200_000 } },

  { tier: 10, min: 10_000_000, max: null,
    dailyUsd: 500_000_000_000,
    daily: { XLM: 50_000_000_000_000, XRP: 20_000_000_000_000, XDC: 10_000_000_000_000, QNT: 5_000_000_000_000, HBAR: 2_500_000_000_000, ADA: 1_000_000_000_000, SOL: 500_000_000_000, DOT: 200_000_000_000, MATIC: 100_000_000_000, LINK: 50_000_000_000 },
    goldKg: 2_000_000, metalsKg: { silver: 20_000_000, platinum: 10_000_000, palladium: 5_000_000, rhodium: 2_000_000, iridium: 1_000_000, tungsten: 500_000 } },
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
export function nextItdboneTier(balance: number): ItdboneTier | null {
  const n = (itdboneTierFor(balance)?.tier ?? 0) + 1;
  return ITDBONE_TIERS.find((t) => t.tier === n) ?? null;
}
export function nextQrsTier(balance: number): QrsTier | null {
  const n = (qrsTierFor(balance)?.tier ?? 0) + 1;
  return QRS_TIERS.find((t) => t.tier === n) ?? null;
}

/** A member's ITDB basket: per-token entitlement x tier multiplier. */
export function itdbBasket(balance: number): { line: ReserveLine; units: number }[] {
  const tier = itdbTierFor(balance);
  if (!tier) return [];
  return ITDB_RESERVES.map((line) => ({
    line,
    units: line.perToken * tier.multiplier,
  }));
}

/** Gold reference for a QRS holding under the active basis (see TODO). */
export function qrsGoldKg(balance: number, tier: QrsTier | null): number {
  if (QRS_GOLD_BASIS === "tier-table") return tier?.goldKg ?? 0;
  return (balance * QRS_GRAMS_PER_TOKEN) / 1000;
}
