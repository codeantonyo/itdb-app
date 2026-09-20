import type { Milestone } from "./milestones";
import { VAULT_PINS } from "./world-map";

/**
 * ITDBVAULT — 500 personal vaults across ten branches.
 *
 * Almost everything here is DERIVED rather than stored: early-bird
 * status from the claim's timestamp, the starter pack and doubled
 * rewards from that status, milestone stages from how many vaults have
 * gone. The only thing a claim records beyond its city is the vault
 * number, because that is the one fact nothing else can imply.
 *
 * Every figure is SIMULATED, like the rest of the app. Nothing here
 * moves a token, allocates metal, or reserves a physical unit.
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
 * The whole sale is 100,000 XLM at 0.1 XLM per ITDBVAULT, which is
 * 1,000,000 tokens over 500 vaults — 200 XLM and 2,000 tokens a vault.
 *
 * TODO(tony): confirm. "The entire supply is 100,000 XLM" is read here
 * as the size of the raise, not as a token count, because the token is
 * priced in XLM rather than being XLM.
 */
export const SALE_XLM_TOTAL = 100_000;
export const PRICE_XLM_PER_TOKEN = 0.1;
export const TOKEN_SUPPLY = SALE_XLM_TOTAL / PRICE_XLM_PER_TOKEN;
export const XLM_PER_VAULT = SALE_XLM_TOTAL / TOTAL_VAULTS;
export const TOKENS_PER_VAULT = TOKEN_SUPPLY / TOTAL_VAULTS;

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

/**
 * Simulated payout rates for one vault. Early birds take double.
 */
export const WEEKLY_PAYOUT = { USD: 250, EUR: 230, GBP: 195 };
/** Grams accrued each month, per metal, across the twenty. */
export const MONTHLY_METAL_GRAMS = 5;

/* ------------------------------------------------------------------ */
/*  Early birds                                                        */
/* ------------------------------------------------------------------ */

/** The 48-hour window. A claim before this instant is an early bird. */
export const EARLY_BIRD_ENDS_AT = Date.UTC(2026, 8, 22, 0, 0, 0);

export const EARLY_BIRD_REFUND_PCT = 50;
export const EARLY_BIRD_REWARD_MULTIPLIER = 2;

/** Credited to an early bird's vault on purchase. */
export const STARTER_PACK: { metal: string; grams: number }[] = [
  { metal: "Gold", grams: 50 },
  { metal: "Silver", grams: 500 },
  { metal: "Platinum", grams: 50 },
  { metal: "Palladium", grams: 25 },
];

/**
 * Early birds take 50% off the ITDBVAULT holding tiers — the ladder in
 * vault-tiers.ts, not the ITDBONE or QRS ones. Set this to 1 to switch
 * the discount off; nothing else needs changing.
 */
export const EARLY_BIRD_TIER_DIVISOR = 2;

export function isEarlyBird(claimedAt: number): boolean {
  return claimedAt < EARLY_BIRD_ENDS_AT;
}

/* ------------------------------------------------------------------ */
/*  Milestones — status comes from how many vaults have actually gone  */
/* ------------------------------------------------------------------ */

interface Stage {
  pct: number;
  medal: string;
  title: string;
  /** Extra ITDBVAULT tokens, as a percentage on top */
  bonusPct: number;
  rewards: string[];
}

const STAGES: Stage[] = [
  {
    pct: 25,
    medal: "🥉",
    title: "25% sold",
    bonusPct: 50,
    rewards: [
      "+50% bonus ITDBVAULT tokens",
      "1 extra vault, any city",
      "Double metal rewards for 14 days",
      "Priority withdrawal access",
    ],
  },
  {
    pct: 50,
    medal: "🥈",
    title: "50% sold",
    bonusPct: 100,
    rewards: [
      "+100% bonus ITDBVAULT tokens",
      "3 extra vaults, any cities",
      "Triple metal rewards for 30 days",
      "500 g of gold delivered to your vault",
      "Lifetime priority banking",
    ],
  },
  {
    pct: 75,
    medal: "🥇",
    title: "75% sold",
    bonusPct: 200,
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
    pct: 100,
    medal: "👑",
    title: "100% sold out",
    bonusPct: 500,
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

export const VAULT_STAGES = STAGES;

/** Vaults that must be claimed to reach a stage. */
export const stageTarget = (pct: number) => Math.ceil((TOTAL_VAULTS * pct) / 100);

/**
 * The milestones as the rest of the app models them, with status read
 * from real sales rather than declared — the app can count claimed
 * vaults, so there is nothing here to keep in step by hand.
 */
export function vaultMilestones(claimed: number): Milestone[] {
  return STAGES.map((s) => {
    const target = stageTarget(s.pct);
    return {
      id: `vault-${s.pct}`,
      token: "ITDBVAULT" as const,
      title: `${s.medal} ${s.title}`,
      detail: s.rewards.join(" · "),
      status: claimed >= target ? "active" : "locked",
      threshold: `${target} of ${TOTAL_VAULTS} vaults claimed`,
      soldTarget: target,
      multiplier: 1 + s.bonusPct / 100,
      amount: `+${s.bonusPct}%`,
    };
  });
}

/** The highest bonus reached, never the sum of the stages passed. */
export function vaultTokenBonusPct(claimed: number): number {
  return STAGES.filter((s) => claimed >= stageTarget(s.pct)).reduce(
    (best, s) => Math.max(best, s.bonusPct),
    0,
  );
}

/* ------------------------------------------------------------------ */
/*  Allocation                                                         */
/* ------------------------------------------------------------------ */

/** Members pick their city; this is only the fallback when none is sent. */
export function cityForClaim(index: number): string {
  return VAULT_PINS[index % VAULT_PINS.length].city;
}

/** Remaining vaults per city, from the claims on record. */
export function remainingByCity(taken: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    VAULT_CITY_NAMES.map((c) => [c, Math.max(VAULTS_PER_CITY - (taken[c] ?? 0), 0)]),
  );
}

/** The lowest vault number nobody holds — what a latecomer is given. */
export function lowestFreeNumber(taken: Set<number>): number | null {
  for (let n = 1; n <= TOTAL_VAULTS; n += 1) if (!taken.has(n)) return n;
  return null;
}
