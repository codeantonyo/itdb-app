import { NextResponse } from "next/server";
import {
  BACKED_ASSETS,
  BRANCHES,
  BUYBACK_PREMIUM_PCT,
  EARLY_BIRD_ENDS_AT,
  EARLY_BIRD_REFUND_PCT,
  EARLY_BIRD_REWARD_MULTIPLIER,
  MONTHLY_METAL_GRAMS,
  PRICE_XLM_PER_TOKEN,
  SALE_XLM_TOTAL,
  STARTER_PACK,
  TOKENS_PER_VAULT,
  TOKEN_SUPPLY,
  TOTAL_VAULTS,
  VAULTS_PER_CITY,
  VAULT_BENEFITS,
  VAULT_CITY_NAMES,
  VAULT_METALS,
  WEEKLY_PAYOUT,
  XLM_PER_VAULT,
  cityForClaim,
  isEarlyBird,
  lowestFreeNumber,
  remainingByCity,
  vaultMilestones,
  vaultTokenBonusPct,
} from "@/lib/itdb/vault";
import type { Milestone } from "@/lib/itdb/milestones";
import {
  VAULT_TIERS,
  nextVaultTier,
  vaultTierFor,
  vaultTierRange,
  type VaultTier,
} from "@/lib/itdb/vault-tiers";
import { memberHoldings, tokenBalance } from "@/lib/server/holdings";
import { vaultTierBalance, vaultTierNeeded } from "@/lib/server/vault-perks";
import { ITDBVAULT_TOKEN } from "@/lib/stellar/registry";
import { getDb, mutateDb, type VaultClaimRecord } from "@/lib/server/db";
import { sessionAccountId } from "@/lib/server/session";

export interface MyVault {
  number: number;
  city: string;
  at: number;
  earlyBird: boolean;
  /** ITDBVAULT allocated, after the milestone bonus */
  tokens: number;
  baseTokens: number;
  xlmPaid: number;
  /** 50% of that, credited in-app — early birds only */
  refundXlm: number;
  /** Weekly currency payouts, doubled for early birds */
  weekly: typeof WEEKLY_PAYOUT;
  /** Grams per metal each month, doubled for early birds */
  monthlyMetalGrams: number;
  starterPack: typeof STARTER_PACK;
}

export type LadderTier = VaultTier & { rangeMin: number; rangeMax: number | null };

export interface VaultHolding {
  /** ITDBVAULT held on chain (null when Horizon could not be read) */
  onChain: number | null;
  /** Tokens allocated by this member's claim, before distribution */
  allocated: number;
  /** What the tier is read against */
  counted: number;
  /** Doubled for early birds — the 50% threshold discount */
  tierCounted: number;
  discounted: boolean;
  tier: LadderTier | null;
  next: (LadderTier & { needed: number }) | null;
}

export interface VaultSummary {
  token: { code: string; issuer: string };
  total: number;
  claimed: number;
  available: number;
  perCity: number;
  soldPct: number;
  remaining: Record<string, number>;
  /** Vault numbers already taken, so the picker can grey them out */
  takenNumbers: number[];
  earlyBird: { endsAt: number; open: boolean; refundPct: number; multiplier: number };
  economics: {
    saleXlm: number;
    priceXlm: number;
    supply: number;
    xlmPerVault: number;
    tokensPerVault: number;
    bonusPct: number;
    buybackPremiumPct: number;
  };
  branches: typeof BRANCHES;
  metals: readonly string[];
  backedAssets: typeof BACKED_ASSETS;
  benefits: string[];
  milestones: Milestone[];
  tiers: LadderTier[];
  holding: VaultHolding;
  mine: MyVault | null;
}

const takenByCity = (claims: Record<string, VaultClaimRecord>): Record<string, number> => {
  const taken: Record<string, number> = {};
  for (const c of Object.values(claims)) taken[c.city] = (taken[c.city] ?? 0) + 1;
  return taken;
};

const numberOf = (c: VaultClaimRecord) => c.number ?? c.index + 1;

const takenNumbers = (claims: Record<string, VaultClaimRecord>) =>
  new Set(Object.values(claims).map(numberOf));

/** Everything a member's own vault pays, derived from the claim. */
function mineFrom(claim: VaultClaimRecord, claimed: number): MyVault {
  const early = isEarlyBird(claim.at);
  const boost = early ? EARLY_BIRD_REWARD_MULTIPLIER : 1;
  const bonusPct = vaultTokenBonusPct(claimed);
  return {
    number: numberOf(claim),
    city: claim.city,
    at: claim.at,
    earlyBird: early,
    baseTokens: TOKENS_PER_VAULT,
    tokens: Math.round(TOKENS_PER_VAULT * (1 + bonusPct / 100)),
    xlmPaid: XLM_PER_VAULT,
    refundXlm: early ? (XLM_PER_VAULT * EARLY_BIRD_REFUND_PCT) / 100 : 0,
    weekly: {
      USD: WEEKLY_PAYOUT.USD * boost,
      EUR: WEEKLY_PAYOUT.EUR * boost,
      GBP: WEEKLY_PAYOUT.GBP * boost,
    },
    monthlyMetalGrams: MONTHLY_METAL_GRAMS * boost,
    starterPack: early ? STARTER_PACK : [],
  };
}

const withRange = (x: VaultTier): LadderTier => {
  const r = vaultTierRange(x);
  return { ...x, rangeMin: r.min, rangeMax: r.max };
};

/**
 * The holding a tier is read against.
 *
 * On-chain ITDBVAULT is the real measure, but the sale's tokens are not
 * distributed yet, so a claim's allocation counts until they are. Taking
 * the larger of the two means distribution can never drop a member's
 * tier on the day it happens.
 */
function holdingFrom(
  onChain: number | null,
  claim: VaultClaimRecord | undefined,
  claimed: number,
): VaultHolding {
  const allocated = claim ? Math.round(TOKENS_PER_VAULT * (1 + vaultTokenBonusPct(claimed) / 100)) : 0;
  const counted = Math.max(onChain ?? 0, allocated);
  const tierCounted = vaultTierBalance(counted, claim);
  const tier = vaultTierFor(tierCounted);
  const nxt = nextVaultTier(tierCounted);
  return {
    onChain,
    allocated,
    counted,
    tierCounted,
    discounted: tierCounted > counted,
    tier: tier ? withRange(tier) : null,
    next: nxt ? { ...withRange(nxt), needed: vaultTierNeeded(nxt.min, counted, tierCounted) } : null,
  };
}

function summarise(
  claims: Record<string, VaultClaimRecord>,
  mine: VaultClaimRecord | undefined,
  now = Date.now(),
  onChain: number | null = null,
): VaultSummary {
  const claimed = Object.keys(claims).length;
  return {
    token: ITDBVAULT_TOKEN,
    total: TOTAL_VAULTS,
    claimed,
    available: Math.max(TOTAL_VAULTS - claimed, 0),
    perCity: VAULTS_PER_CITY,
    soldPct: (claimed / TOTAL_VAULTS) * 100,
    remaining: remainingByCity(takenByCity(claims)),
    takenNumbers: [...takenNumbers(claims)].sort((a, b) => a - b),
    earlyBird: {
      endsAt: EARLY_BIRD_ENDS_AT,
      open: now < EARLY_BIRD_ENDS_AT,
      refundPct: EARLY_BIRD_REFUND_PCT,
      multiplier: EARLY_BIRD_REWARD_MULTIPLIER,
    },
    economics: {
      saleXlm: SALE_XLM_TOTAL,
      priceXlm: PRICE_XLM_PER_TOKEN,
      supply: TOKEN_SUPPLY,
      xlmPerVault: XLM_PER_VAULT,
      tokensPerVault: TOKENS_PER_VAULT,
      bonusPct: vaultTokenBonusPct(claimed),
      buybackPremiumPct: BUYBACK_PREMIUM_PCT,
    },
    branches: BRANCHES,
    metals: VAULT_METALS,
    backedAssets: BACKED_ASSETS,
    benefits: VAULT_BENEFITS,
    milestones: vaultMilestones(claimed),
    tiers: VAULT_TIERS.map(withRange),
    holding: holdingFrom(onChain, mine, claimed),
    mine: mine ? mineFrom(mine, claimed) : null,
  };
}

/** GET /api/vault — the network's state and this member's vault. */
export async function GET(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const db = await getDb();
  const account = db.accounts.find((a) => a.id === id);

  // A Horizon wobble must not take the whole page down — the tier simply
  // falls back to the allocation until the balance can be read (§6.4).
  let onChain: number | null = null;
  try {
    if (account) onChain = tokenBalance(await memberHoldings(account.wallets), ITDBVAULT_TOKEN);
  } catch {
    onChain = null;
  }

  return NextResponse.json(summarise(db.vaultClaims, db.vaultClaims[id], Date.now(), onChain));
}

/**
 * POST /api/vault — claim one vault, in the city the member picked, and
 * at the number they picked if the early-bird window is still open.
 *
 * City capacity and number uniqueness are both re-checked inside the
 * mutation, so neither can be talked past by a stale page nor split
 * between two people claiming at the same moment.
 */
export async function POST(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const db = await getDb();
  if (!db.accounts.some((a) => a.id === id))
    return NextResponse.json({ error: "Account not found" }, { status: 404 });

  let wantedCity: string | undefined;
  let wantedNumber: number | undefined;
  try {
    const body = (await req.json()) as { city?: unknown; number?: unknown };
    if (typeof body?.city === "string") wantedCity = body.city;
    if (typeof body?.number === "number") wantedNumber = body.number;
  } catch {
    // No body is fine — next city in rotation, lowest free number.
  }

  if (wantedCity !== undefined && !VAULT_CITY_NAMES.includes(wantedCity))
    return NextResponse.json({ error: "That is not one of our vault cities." }, { status: 400 });
  if (
    wantedNumber !== undefined &&
    (!Number.isInteger(wantedNumber) || wantedNumber < 1 || wantedNumber > TOTAL_VAULTS)
  )
    return NextResponse.json(
      { error: `Pick a vault number between 1 and ${TOTAL_VAULTS}.` },
      { status: 400 },
    );

  const result = await mutateDb((store) => {
    const existing = store.vaultClaims[id];
    if (existing) return { ok: true as const, summary: summarise(store.vaultClaims, existing) };

    const index = Object.keys(store.vaultClaims).length;
    if (index >= TOTAL_VAULTS)
      return { ok: false as const, error: "Every vault has been claimed.", status: 409 };

    const city = wantedCity ?? cityForClaim(index);
    if ((remainingByCity(takenByCity(store.vaultClaims))[city] ?? 0) <= 0)
      return {
        ok: false as const,
        error: `${city} is fully claimed — choose another city.`,
        status: 409,
      };

    const now = Date.now();
    const taken = takenNumbers(store.vaultClaims);
    // Choosing your own number is an early-bird privilege; after the
    // window everyone takes the lowest that is left.
    let num: number;
    if (wantedNumber !== undefined && isEarlyBird(now)) {
      if (taken.has(wantedNumber))
        return {
          ok: false as const,
          error: `Vault #${wantedNumber} is already owned — pick another.`,
          status: 409,
        };
      num = wantedNumber;
    } else {
      const free = lowestFreeNumber(taken);
      if (free === null)
        return { ok: false as const, error: "Every vault number is taken.", status: 409 };
      num = free;
    }

    const record: VaultClaimRecord = { at: now, city, index, number: num };
    store.vaultClaims[id] = record;
    return { ok: true as const, summary: summarise(store.vaultClaims, record, now) };
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.summary);
}
