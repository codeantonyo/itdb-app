import { randomInt } from "crypto";
import { VAULT_EARLY_BIRD_GRANTS, VAULT_EXTRA_GRANTS } from "./grants";
import type { Milestone } from "./milestones";
import {
  VAULT_EARLY_BIRD_ENDS_AT,
  VAULT_EARLY_BUYERS,
  VAULT_SOLD_AT_BUILD,
  VAULT_STAGE_REACHED_AT,
} from "./vault-early-birds";
import { VAULT_PINS } from "./world-map";

/**
 * ITDBVAULT — 500 personal vaults across ten branches.
 *
 * What a member is entitled to comes from the CHAIN: their tier from the
 * ITDBVAULT they hold, early-bird status from whether they bought during
 * the window, milestone stages from how much the distributor has sold.
 * The app stores only the vaults they have chosen — city and number —
 * because that is the one thing the chain cannot tell it.
 *
 * Every reward figure is SIMULATED, like the rest of the app. Nothing
 * here moves a token, allocates metal, or reserves a physical unit.
 */

export const TOTAL_VAULTS = 500;

/** The 500 vaults are split evenly, so each city holds this many. */
export const VAULTS_PER_CITY = TOTAL_VAULTS / VAULT_PINS.length;

export const VAULT_CITIES = VAULT_PINS;
export const VAULT_CITY_NAMES = VAULT_PINS.map((p) => p.city);

const FLAGS: Record<string, string> = {
  USA: "🇺🇸",
  Canada: "🇨🇦",
  UK: "🇬🇧",
  UAE: "🇦🇪",
  Germany: "🇩🇪",
  Australia: "🇦🇺",
};

export interface Branch {
  city: string;
  country: string;
  flag: string;
}

export const BRANCHES: Branch[] = VAULT_PINS.map((p) => ({
  city: p.city,
  country: p.country,
  flag: FLAGS[p.country] ?? "",
}));

/* ------------------------------------------------------------------ */
/*  Economics                                                          */
/* ------------------------------------------------------------------ */

/**
 * The sale is 100,000 XLM at 0.1 XLM per ITDBVAULT: 1,000,000 tokens,
 * which the tier table confirms — Tier 1 opens at one vault's 2,000 and
 * Tier 10 at the full 1,000,000.
 *
 * 200,000,000 were issued on chain; the rest sits with the distributor.
 * "Sold" is what has left the distributor, so it is measured against the
 * 1,000,000 on sale, not against the issuance.
 */
export const SALE_XLM_TOTAL = 100_000;
export const PRICE_XLM_PER_TOKEN = 0.1;
export const TOKEN_SUPPLY = SALE_XLM_TOTAL / PRICE_XLM_PER_TOKEN;
export const XLM_PER_VAULT = SALE_XLM_TOTAL / TOTAL_VAULTS;
export const TOKENS_PER_VAULT = TOKEN_SUPPLY / TOTAL_VAULTS;

export const VAULT_ISSUED = 200_000_000;
export const VAULT_DISTRIBUTOR = "GCAA2CIQUWBZGOD3D2FHMLRA2476KRHORZYCCSO3CTT5JXWUOFCF3QFS";

/**
 * Tokens sold, from the distributor's live balance. Sales never undo, so
 * this never reports less than was sold when the list was built — a
 * Horizon failure cannot quietly re-lock a milestone (§6.4).
 */
export function vaultSold(distributorBalance: number | null): number {
  const live = distributorBalance === null ? 0 : VAULT_ISSUED - distributorBalance;
  return Math.max(live, VAULT_SOLD_AT_BUILD);
}

/* ------------------------------------------------------------------ */
/*  What a vault holds                                                 */
/* ------------------------------------------------------------------ */

/** The twenty metals a vault is engineered to store. */
export const VAULT_METALS = [
  "Gold", "Silver", "Platinum", "Palladium", "Rhodium",
  "Iridium", "Osmium", "Ruthenium", "Rhenium", "Scandium",
  "Tungsten", "Copper", "Nickel", "Zinc", "Tin",
  "Cobalt", "Lithium", "Titanium", "Chromium", "Manganese",
] as const;

export interface BackedAsset {
  code: string;
  metal: string;
  /** Troy ounces of that metal behind one unit */
  oz: number;
}

/** Assets the vault can receive, hold and swap, each backed 1:1. */
export const BACKED_ASSETS: BackedAsset[] = [
  { code: "XLM", metal: "Silver", oz: 1 },
  { code: "XRP", metal: "Gold", oz: 1 },
  { code: "XDC", metal: "Copper", oz: 1 },
  { code: "ALGO", metal: "Palladium", oz: 1 },
  { code: "IOTA", metal: "Iridium", oz: 1 },
];

/** What ownership comes with. */
export const VAULT_BENEFITS = [
  "Weekly currency payouts — USD, EUR, GBP",
  "Monthly metal accrual — up to 20 metals",
  "Guaranteed buyback — market price + 5% premium",
  "Zero storage fees — forever",
  "Physical access — walk into any branch",
  "Legal ownership certificate in your name",
  "Generational transfer — automatic, tax-free",
  "Digital management",
  "Global access",
  "Instant liquidity",
];

export const BUYBACK_PREMIUM_PCT = 5;

/* ------------------------------------------------------------------ */
/*  Early birds                                                        */
/* ------------------------------------------------------------------ */

export const EARLY_BIRD_ENDS_AT = VAULT_EARLY_BIRD_ENDS_AT;
export const EARLY_BIRD_REFUND_PCT = 50;
/** All vault rewards — currency and metals — doubled, for good. */
export const EARLY_BIRD_REWARD_MULTIPLIER = 2;

/** Credited to an early bird's vault on purchase. */
export const STARTER_PACK: { metal: string; grams: number }[] = [
  { metal: "Gold", grams: 50 },
  { metal: "Silver", grams: 500 },
  { metal: "Platinum", grams: 50 },
  { metal: "Palladium", grams: 25 },
];

/**
 * Early birds take 50% off the ITDBVAULT holding tiers. Set this to 1 to
 * switch the discount off; nothing else needs changing.
 */
export const EARLY_BIRD_TIER_DIVISOR = 2;

const BUYERS = new Map(VAULT_EARLY_BUYERS.map((b) => [b.wallet, b]));
const GRANTED = new Set(VAULT_EARLY_BIRD_GRANTS);

export interface EarlyBirdStatus {
  /** Wallets that bought in the window, or were granted the status */
  wallets: string[];
  /** XLM paid inside the window, across those wallets */
  xlmSpent: number;
}

/** Early-bird status for an account, or null if it has none. */
export function vaultEarlyBird(wallets: string[]): EarlyBirdStatus | null {
  const mine = [...new Set(wallets)].filter((w) => BUYERS.has(w) || GRANTED.has(w));
  if (mine.length === 0) return null;
  return {
    wallets: mine,
    xlmSpent: mine.reduce((s, w) => s + (BUYERS.get(w)?.xlmSpent ?? 0), 0),
  };
}

/* ------------------------------------------------------------------ */
/*  Milestones — reached by what has actually sold                     */
/* ------------------------------------------------------------------ */

export interface Stage {
  pct: number;
  medal: string;
  title: string;
  /** Extra ITDBVAULT, as a percentage of what the member holds */
  bonusPct: number;
  /** Extra vaults, any cities */
  extraVaults: number;
  /** Metal rewards multiplied by this, for metalDays after the stage */
  metalMultiplier: number;
  metalDays: number;
  /** Gold delivered to the vault, grams */
  goldGrams: number;
  rewards: string[];
}

export const VAULT_STAGES: Stage[] = [
  {
    pct: 25, medal: "🥉", title: "25% sold",
    bonusPct: 50, extraVaults: 1, metalMultiplier: 2, metalDays: 14, goldGrams: 0,
    rewards: [
      "+50% bonus ITDBVAULT tokens",
      "1 extra vault, any city",
      "Double metal rewards for 14 days",
      "Priority withdrawal access",
    ],
  },
  {
    pct: 50, medal: "🥈", title: "50% sold",
    bonusPct: 100, extraVaults: 3, metalMultiplier: 3, metalDays: 30, goldGrams: 500,
    rewards: [
      "+100% bonus ITDBVAULT tokens",
      "3 extra vaults, any cities",
      "Triple metal rewards for 30 days",
      "500 g of gold delivered to your vault",
      "Lifetime priority banking",
    ],
  },
  {
    pct: 75, medal: "🥇", title: "75% sold",
    bonusPct: 200, extraVaults: 5, metalMultiplier: 3, metalDays: 60, goldGrams: 2_000,
    rewards: [
      "+200% bonus ITDBVAULT tokens",
      "5 extra vaults, any cities",
      "Triple metal rewards for 60 days",
      "2 kg of gold delivered to your vault",
      "Personal relationship manager",
      "Seat on the ITDB Vault Council",
    ],
  },
  {
    pct: 100, medal: "👑", title: "100% sold out",
    bonusPct: 500, extraVaults: 10, metalMultiplier: 5, metalDays: 90, goldGrams: 10_000,
    rewards: [
      "+500% bonus ITDBVAULT tokens",
      "10 extra vaults, one in every city",
      "Quintuple metal rewards for 90 days",
      "10 kg of gold delivered to your vault",
      "Permanent seat on the ITDB Vault Council",
      "Private events access for life",
      "Personal wealth manager",
      "Your name on the ITDB Vault Wall of Founders",
    ],
  },
];

const DAY_MS = 86_400_000;

/** Tokens that must sell to reach a stage. */
export const stageTarget = (pct: number) => Math.ceil((TOKEN_SUPPLY * pct) / 100);

/** The highest stage reached, or null. Stages replace, they do not add. */
export function currentStage(sold: number): Stage | null {
  return [...VAULT_STAGES].reverse().find((s) => sold >= stageTarget(s.pct)) ?? null;
}

/**
 * When a stage was reached — from the chain history for stages crossed
 * before the list was built, otherwise "now" is the best we know.
 */
export function stageReachedAt(stage: Stage, now: number): number {
  const at = VAULT_STAGE_REACHED_AT[stage.pct];
  return at ? Date.parse(at) : now;
}

/**
 * The metal-reward multiplier in force right now: the highest among the
 * reached stages whose window is still open. When a window closes the
 * boost ends; it does not fall back to a lower stage's expired one.
 */
export function activeMetalBoost(sold: number, now: number): { multiplier: number; until: number | null } {
  let best = { multiplier: 1, until: null as number | null };
  for (const s of VAULT_STAGES) {
    if (sold < stageTarget(s.pct)) continue;
    const until = stageReachedAt(s, now) + s.metalDays * DAY_MS;
    if (now < until && s.metalMultiplier > best.multiplier) best = { multiplier: s.metalMultiplier, until };
  }
  return best;
}

/** The milestones as the rest of the app models them, status from sales. */
export function vaultMilestones(sold: number): Milestone[] {
  return VAULT_STAGES.map((s) => {
    const target = stageTarget(s.pct);
    return {
      id: `vault-${s.pct}`,
      token: "ITDBVAULT" as const,
      title: `${s.medal} ${s.title}`,
      detail: s.rewards.join(" · "),
      status: sold >= target ? "active" : "locked",
      threshold: `${target.toLocaleString("en-US")} of ${TOKEN_SUPPLY.toLocaleString("en-US")} ITDBVAULT sold`,
      soldTarget: target,
      multiplier: 1 + s.bonusPct / 100,
      amount: `+${s.bonusPct}%`,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Entitlement                                                        */
/* ------------------------------------------------------------------ */

/**
 * How many vaults an account may hold: its tier's vaults, plus the
 * reached milestone's extra vaults, plus any hand grant. Nobody below
 * Tier 1 is entitled to a vault — Tier 1 is exactly one vault's tokens.
 */
export function vaultsAllowed(tierVaults: number, sold: number, wallets: string[]): number {
  const stageExtra = tierVaults > 0 ? (currentStage(sold)?.extraVaults ?? 0) : 0;
  const granted = [...new Set(wallets)].reduce((s, w) => s + (VAULT_EXTRA_GRANTS[w] ?? 0), 0);
  return tierVaults + stageExtra + granted;
}

/* ------------------------------------------------------------------ */
/*  Allocation                                                         */
/* ------------------------------------------------------------------ */

/** Remaining vaults per city, from the vaults on record. */
export function remainingByCity(taken: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    VAULT_CITY_NAMES.map((c) => [c, Math.max(VAULTS_PER_CITY - (taken[c] ?? 0), 0)]),
  );
}

/**
 * A random free vault number — what a member without early-bird status
 * is given. Uniform over what is left, so nobody can predict or farm a
 * number by timing their claim.
 */
export function randomFreeNumber(taken: Set<number>): number | null {
  const free: number[] = [];
  for (let n = 1; n <= TOTAL_VAULTS; n += 1) if (!taken.has(n)) free.push(n);
  return free.length === 0 ? null : free[randomInt(free.length)];
}

/** Vault numbers read as 001-500. */
export const vaultLabel = (n: number) => `#${String(n).padStart(3, "0")}`;
