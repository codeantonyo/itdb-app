import { ATM_PINS } from "./world-map";

/**
 * ITDB ATMS — 4,000 ATMs across 80 cities in 32 countries.
 *
 * What a member is entitled to comes from the CHAIN: their tier from the
 * ITDBATMS they hold, their pre-sale multiplier from what they bought in
 * the 48-hour pre-sale, the milestone wave from how much has sold. The
 * app stores only where they placed their ATMs.
 *
 * Every reward figure is SIMULATED, like the rest of the app.
 * Pure data and maths only — safe to import on the client.
 */

export const ATMS_ISSUER = "GDEIVYTG65ECPXM2SMFPAL5GRFASAYDPDMJ6NY3WKMCWCRLOC2OAOATM";
/** Holds the sale supply; every ITDBATMS a member owns started here. */
export const ATMS_DISTRIBUTOR = "GA7I3HKV3AN7OSCKNU625D6SN6YDMMYTY3AUVXQ6HZQRNBY47M7AQQFS";

export const ATMS_PER_CITY = 50;
export const ATM_CITIES = ATM_PINS;
export const TOTAL_ATMS = ATM_CITIES.length * ATMS_PER_CITY; // 4,000
export const ATM_REGIONS = ["North America", "Latin America", "Europe", "Middle East", "Oceania"] as const;

const FLAGS: Record<string, string> = {
  USA: "🇺🇸", Canada: "🇨🇦", Australia: "🇦🇺", "New Zealand": "🇳🇿", Mexico: "🇲🇽", Brazil: "🇧🇷",
  Argentina: "🇦🇷", Chile: "🇨🇱", Colombia: "🇨🇴", UK: "🇬🇧", France: "🇫🇷", Germany: "🇩🇪", Spain: "🇪🇸",
  Italy: "🇮🇹", Netherlands: "🇳🇱", Switzerland: "🇨🇭", Belgium: "🇧🇪", Austria: "🇦🇹", Czechia: "🇨🇿",
  Poland: "🇵🇱", Portugal: "🇵🇹", Ireland: "🇮🇪", Sweden: "🇸🇪", Norway: "🇳🇴", Denmark: "🇩🇰",
  Finland: "🇫🇮", Greece: "🇬🇷", Hungary: "🇭🇺", UAE: "🇦🇪", Qatar: "🇶🇦", "Saudi Arabia": "🇸🇦", Kuwait: "🇰🇼",
};
export const flagOf = (country: string) => FLAGS[country] ?? "";

/* ------------------------------------------------------------------ */
/*  Sale                                                               */
/* ------------------------------------------------------------------ */

export const ATMS_PRICE_XLM = 0.1;
/** On sale; milestones are measured against this, not the 10M issued. */
export const ATMS_SUPPLY = 1_000_000;

/**
 * The 48-hour pre-sale ended 2026-10-05 16:00 UTC (19:00 in Romania).
 * Members placed buy orders during it; the distributor opened its sell
 * offer at 16:56:52 UTC and every waiting order filled in that ledger.
 */
export const ATMS_PRESALE_ENDS_AT = "2026-10-05T16:00:00Z";
export const PRESALE_HOURS = 48;

/* ------------------------------------------------------------------ */
/*  Tiers                                                              */
/* ------------------------------------------------------------------ */

/** The nine stablecoins and XLM paid at the tier's daily amount; XRP at 70%. */
export const DAILY_COINS = ["XLM", "USDC", "EURC", "USDT", "DAI", "BUSD", "TUSD", "PYUSD", "FDUSD"] as const;

export interface AtmTier {
  tier: number;
  min: number;
  /** Daily app balance in USD, and each DAILY_COINS amount per day */
  daily: number;
  /** % of cash withdrawals returned */
  returnPct: number;
  /** ATMs owned at this tier, before any multiplier */
  atms: number;
  bonus?: string;
}

export const ATM_TIERS: AtmTier[] = [
  { tier: 1, min: 1_000, daily: 25_000, returnPct: 5, atms: 1 },
  { tier: 2, min: 5_000, daily: 50_000, returnPct: 8, atms: 3 },
  { tier: 3, min: 10_000, daily: 100_000, returnPct: 12, atms: 5 },
  { tier: 4, min: 25_000, daily: 200_000, returnPct: 18, atms: 10 },
  { tier: 5, min: 50_000, daily: 500_000, returnPct: 22, atms: 20 },
  { tier: 6, min: 100_000, daily: 1_000_000, returnPct: 27, atms: 30 },
  { tier: 7, min: 250_000, daily: 2_000_000, returnPct: 32, atms: 40 },
  { tier: 8, min: 500_000, daily: 5_000_000, returnPct: 37, atms: 60, bonus: "Elite status, custom vault in every city" },
  { tier: 9, min: 700_000, daily: 10_000_000, returnPct: 41, atms: 80 },
  { tier: 10, min: 1_000_000, daily: 20_000_000, returnPct: 45, atms: 100 },
];

export const atmTierFor = (tokens: number) => [...ATM_TIERS].reverse().find((t) => tokens >= t.min) ?? null;
export const nextAtmTier = (tokens: number) => ATM_TIERS.find((t) => tokens < t.min) ?? null;
/** The top of a tier's range, or null for the last. */
export const tierMax = (t: AtmTier) => (ATM_TIERS[t.tier] ? ATM_TIERS[t.tier].min - 1 : null);

/** A tier's daily crypto rewards. */
export function dailyCrypto(t: AtmTier): { code: string; amount: number }[] {
  return [...DAILY_COINS.map((code) => ({ code, amount: t.daily })), { code: "XRP", amount: t.daily * 0.7 }];
}

/* ------------------------------------------------------------------ */
/*  Pre-sale bonuses                                                   */
/* ------------------------------------------------------------------ */

/** Bonus 3: for every 1,000 ITDBATMS bought in the pre-sale. */
export const PRESALE_CRYPTO_PER_1000 = [
  { code: "XLM", amount: 5_000 },
  { code: "USDC", amount: 2_500 },
  { code: "EURC", amount: 2_500 },
  { code: "XRP", amount: 2_500 },
  { code: "DAI", amount: 1_000 },
  { code: "BUSD", amount: 1_000 },
  { code: "TUSD", amount: 1_000 },
  { code: "PYUSD", amount: 1_000 },
  { code: "FDUSD", amount: 1_000 },
];
/** Bonus 4 and 5: the first holders to reach these tiers. */
export const COUNCIL = { seats: 100, tier: 3 };
export const CENTRAL_BANK = { seats: 10, tier: 5 };

/* ------------------------------------------------------------------ */
/*  Milestone roadmap                                                  */
/* ------------------------------------------------------------------ */

export interface AtmStage {
  pct: number;
  medal: string;
  name: string;
  /** Bonus ITDBATMS, % of the holding */
  bonusPct: number;
  /** Extra ATMs for every 10,000 held */
  extraPer10k: number;
  /** Extra crypto for every 1,000 held */
  cryptoPer1000: { code: string; amount: number }[];
  goldKg: number;
  /** Extra % on ATM cash withdrawals */
  extraReturnPct: number;
  perks: string[];
}

const c4 = (xlm: number, rest: number) => [
  { code: "XLM", amount: xlm },
  { code: "USDC", amount: rest },
  { code: "EURC", amount: rest },
  { code: "XRP", amount: rest },
];

export const ATM_STAGES: AtmStage[] = [
  { pct: 25, medal: "🥉", name: "The First Wave", bonusPct: 100, extraPer10k: 10, cryptoPer1000: c4(20_000, 10_000), goldKg: 2, extraReturnPct: 0, perks: [] },
  { pct: 50, medal: "🥈", name: "The Mega Wave", bonusPct: 200, extraPer10k: 20, cryptoPer1000: c4(50_000, 25_000), goldKg: 10, extraReturnPct: 4, perks: [] },
  { pct: 75, medal: "🥇", name: "The Empire Wave", bonusPct: 300, extraPer10k: 50, cryptoPer1000: c4(200_000, 100_000), goldKg: 30, extraReturnPct: 10, perks: ["Custom vault in every city, in your name"] },
  { pct: 100, medal: "👑", name: "The Final Wave", bonusPct: 500, extraPer10k: 100, cryptoPer1000: c4(1_000_000, 500_000), goldKg: 100, extraReturnPct: 20, perks: ["Lifetime royalties from the global ITDB ATMS network, paid weekly"] },
];

/**
 * Bonus ITDBATMS are paid from the distributor with a memo starting
 * "ATMS ": "ATMS PRE" (pre-sale doubling), "ATMS DSC" (tier-discount
 * doubling), "ATMS W25" (a milestone wave). scripts/pay-atms-wave.mjs
 * writes them; the app reads them to tell sales from bonuses and to show
 * members theirs arrived.
 */
export const BONUS_MEMO_PREFIX = "ATMS ";
export const BONUS_MEMO = { presale: "ATMS PRE", discount: "ATMS DSC", wave: (pct: number) => `ATMS W${pct}` };

/* ------------------------------------------------------------------ */
/*  The tier discount                                                  */
/* ------------------------------------------------------------------ */

/**
 * The tier-system discount ended 12 Oct 2026 at 13:00 Romania time.
 * Its START decides who bought "before" (rewards x2) and who bought
 * "during" (tokens x2); until it is set, neither applies.
 */
export const DISCOUNT_STARTS_AT: string | null = null;
export const DISCOUNT_ENDS_AT = "2026-10-12T10:00:00Z";
/** Every ITDBATMS holder, whatever they hold. */
export const FREE_ATMS = 10;

/** The wave reached by what has sold. Waves replace each other, never add. */
export const atmStage = (sold: number) =>
  [...ATM_STAGES].reverse().find((s) => sold >= (ATMS_SUPPLY * s.pct) / 100) ?? null;

/* ------------------------------------------------------------------ */
/*  Entitlement                                                        */
/* ------------------------------------------------------------------ */

export interface AtmEntitlementInput {
  /** ITDBATMS held on chain now */
  holding: number;
  /** Bought from the distributor inside the pre-sale window */
  presaleBought: number;
  presaleEnded: boolean;
  /** Bought from the distributor while the tier discount ran */
  discountBought: number;
  discountEnded: boolean;
  /** Bought anything before the tier discount began */
  boughtBefore: boolean;
  /** Bonus ITDBATMS already received on chain — already in `holding` */
  paid: { presale: number; discount: number };
  sold: number;
}

/**
 * What a member's ITDBATMS are worth.
 *
 *   tier         from the holding plus any bonus tokens earned but not
 *                yet received: the pre-sale doubling (Bonus 1) once the
 *                pre-sale ended, the discount doubling once the discount
 *                ended. Received bonuses are already in the holding.
 *                Tiers replace: Tier 3 → 4 is 10 ATMs, not 5 + 10.
 *   multiplier   1x per 1,000 bought IN THE PRE-SALE (Bonus 2). The
 *                token doubling does not raise it.
 *   wave extra   per 10,000 held, from the current milestone wave.
 *   free         10 ATMs for every holder.
 *   rewards x2   for anyone who bought before the discount — applied to
 *                the tier reached AFTER their tokens are doubled.
 *
 *   allowed = tier ATMs × multiplier + wave extra + free
 */
export function atmEntitlement(i: AtmEntitlementInput) {
  const presaleHolder = i.presaleBought >= ATM_TIERS[0].min;
  const bonusTokens = presaleHolder ? i.presaleBought : 0;
  const discountBonus = i.discountBought;
  const pending =
    (i.presaleEnded && i.paid.presale === 0 ? bonusTokens : 0) +
    (i.discountEnded && i.paid.discount === 0 ? discountBonus : 0);
  const counted = i.holding + pending;
  const tier = atmTierFor(counted);
  const multiplier = presaleHolder ? Math.floor(i.presaleBought / 1_000) : 1;
  const stage = i.holding >= ATM_TIERS[0].min ? atmStage(i.sold) : null;
  const waveExtra = stage ? Math.floor(i.holding / 10_000) * stage.extraPer10k : 0;
  const freeAtms = i.holding > 0 ? FREE_ATMS : 0;
  const baseAtms = tier?.atms ?? 0;
  return {
    counted,
    tier,
    bonusTokens,
    discountBonus,
    multiplier,
    stage,
    baseAtms,
    waveExtra,
    freeAtms,
    rewardsMultiplier: i.boughtBefore ? 2 : 1,
    allowed: baseAtms * multiplier + waveExtra + freeAtms,
  };
}

/** The discount window, or null until its start is set. */
export function discountWindow(): { startsAt: number; endsAt: number } | null {
  return DISCOUNT_STARTS_AT ? { startsAt: Date.parse(DISCOUNT_STARTS_AT), endsAt: Date.parse(DISCOUNT_ENDS_AT) } : null;
}

/**
 * Why setting `count` ATMs in `city` is not allowed, or null.
 * `mine` is this member's placements, `othersInCity` everyone else's there.
 */
export function placementProblem(
  city: string,
  count: number,
  mine: Record<string, number>,
  othersInCity: number,
  allowed: number,
): string | null {
  if (!ATM_CITIES.some((c) => c.city === city)) return "Choose one of the 80 cities.";
  if (!Number.isInteger(count) || count < 0) return "Choose a whole number of ATMs.";
  const current = mine[city] ?? 0;
  if (count <= current) return null; // fewer is always allowed
  if (othersInCity + count > ATMS_PER_CITY)
    return othersInCity >= ATMS_PER_CITY
      ? `${city} is full.`
      : `${city} has ${ATMS_PER_CITY - othersInCity - current} left.`;
  const elsewhere = Object.entries(mine).reduce((s, [c, n]) => (c === city ? s : s + n), 0);
  if (elsewhere + count > allowed)
    return allowed === 0
      ? "Tier 1 (1,000 ITDBATMS) is needed to own an ATM."
      : `You own ${allowed} ATM${allowed === 1 ? "" : "s"} and ${elsewhere} are placed elsewhere.`;
  return null;
}

/* ------------------------------------------------------------------ */
/*  Sales from the chain                                               */
/* ------------------------------------------------------------------ */

export interface AtmSale {
  wallet: string;
  amount: number;
  at: number;
}

/**
 * The pre-sale, and which sales belong to it. Orders were placed in the
 * window but filled only when the sale opened, after it — so a sale is a
 * pre-sale purchase if it filled by the end OR in the opening fill, which
 * is the orders that were already waiting.
 */
export function presaleWindow(sales: AtmSale[]): { startsAt: number; endsAt: number; cutoff: number } {
  const endsAt = Date.parse(ATMS_PRESALE_ENDS_AT);
  const opening = sales[0]?.at ?? endsAt;
  return { startsAt: endsAt - PRESALE_HOURS * 3_600_000, endsAt, cutoff: Math.max(endsAt, opening) };
}

/**
 * The first `seats` wallets whose purchases add up to `threshold`, in the
 * order they got there (sales must be sorted by time).
 */
export function firstToReach(sales: AtmSale[], threshold: number, seats: number): Set<string> {
  const total = new Map<string, number>();
  const out = new Set<string>();
  for (const s of sales) {
    if (out.size >= seats) break;
    const t = (total.get(s.wallet) ?? 0) + s.amount;
    total.set(s.wallet, t);
    if (t >= threshold) out.add(s.wallet);
  }
  return out;
}
