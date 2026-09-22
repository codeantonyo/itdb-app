import { NextResponse } from "next/server";
import type { Milestone } from "@/lib/itdb/milestones";
import {
  BACKED_ASSETS,
  BRANCHES,
  BUYBACK_PREMIUM_PCT,
  EARLY_BIRD_ENDS_AT,
  EARLY_BIRD_REFUND_PCT,
  EARLY_BIRD_REWARD_MULTIPLIER,
  PRICE_XLM_PER_TOKEN,
  SALE_XLM_TOTAL,
  STARTER_PACK,
  TOKENS_PER_VAULT,
  TOKEN_SUPPLY,
  TOTAL_VAULTS,
  VAULTS_PER_CITY,
  VAULT_BENEFITS,
  VAULT_CITY_NAMES,
  VAULT_DISTRIBUTOR,
  VAULT_METALS,
  XLM_PER_VAULT,
  activeMetalBoost,
  currentStage,
  randomFreeNumber,
  remainingByCity,
  vaultEarlyBird,
  vaultMilestones,
  vaultSold,
  vaultsAllowed,
} from "@/lib/itdb/vault";
import {
  VAULT_TIERS,
  nextVaultTier,
  vaultTierFor,
  vaultTierRange,
  type MetalReward,
  type TokenReward,
  type VaultTier,
} from "@/lib/itdb/vault-tiers";
import { getDb, mutateDb, type DbAccount, type DbShape, type VaultClaimRecord } from "@/lib/server/db";
import { memberHoldings, tokenBalance } from "@/lib/server/holdings";
import { sessionAccountId } from "@/lib/server/session";
import { vaultTierBalance, vaultTierNeeded } from "@/lib/server/vault-perks";
import { ITDBVAULT_TOKEN } from "@/lib/stellar/registry";

/* ------------------------------------------------------------------ */
/*  Shapes                                                             */
/* ------------------------------------------------------------------ */

export type LadderTier = VaultTier & { rangeMin: number; rangeMax: number | null };

export interface MyRewards {
  /** Early-bird doubling applied */
  weekly: { USD: number; EUR: number; GBP: number };
  /** Early-bird doubling and any live milestone metal boost applied */
  metals: MetalReward[];
  tokens: TokenReward[];
  earlyBirdMultiplier: number;
  metalBoost: { multiplier: number; until: number | null };
}

export interface MyEarlyBird {
  xlmSpent: number;
  refundXlm: number;
  starterPack: typeof STARTER_PACK;
}

export interface VaultSummary {
  token: { code: string; issuer: string };
  total: number;
  /** Vaults held across every member */
  claimed: number;
  available: number;
  perCity: number;
  remaining: Record<string, number>;
  /** Vault numbers already owned, network-wide */
  takenNumbers: number[];

  sale: {
    xlm: number;
    priceXlm: number;
    supply: number;
    sold: number;
    soldPct: number;
    xlmPerVault: number;
    tokensPerVault: number;
  };
  earlyBird: { endsAt: number; open: boolean; refundPct: number; multiplier: number };

  /** ITDBVAULT held on chain; null when Horizon could not be read */
  holding: number | null;
  tierCounted: number;
  discounted: boolean;
  tier: LadderTier | null;
  next: (LadderTier & { needed: number }) | null;
  tiers: LadderTier[];

  /** How many vaults this member may hold, and which they hold */
  allowed: number;
  vaults: VaultClaimRecord[];
  /** Early birds pick and change their own numbers; others are assigned */
  canChooseNumbers: boolean;

  rewards: MyRewards | null;
  /** Bonus ITDBVAULT from the reached milestone, on the member's holding */
  bonusTokens: number;
  mine: MyEarlyBird | null;

  milestones: Milestone[];
  branches: typeof BRANCHES;
  metals: readonly string[];
  backedAssets: typeof BACKED_ASSETS;
  benefits: string[];
  buybackPremiumPct: number;
}

/* ------------------------------------------------------------------ */
/*  Chain reads                                                        */
/* ------------------------------------------------------------------ */

interface ChainState {
  /** Null when Horizon could not be read — unknown, never zero */
  holding: number | null;
  distributor: number | null;
}

async function readChain(account: DbAccount): Promise<ChainState> {
  const [mine, dist] = await Promise.allSettled([
    memberHoldings(account.wallets),
    memberHoldings([VAULT_DISTRIBUTOR]),
  ]);
  return {
    holding: mine.status === "fulfilled" ? tokenBalance(mine.value, ITDBVAULT_TOKEN) : null,
    distributor: dist.status === "fulfilled" ? tokenBalance(dist.value, ITDBVAULT_TOKEN) : null,
  };
}

/* ------------------------------------------------------------------ */
/*  Derivations                                                        */
/* ------------------------------------------------------------------ */

const allVaults = (db: DbShape) => Object.values(db.vaultClaims).flat();

const takenNumbers = (db: DbShape) => new Set(allVaults(db).map((v) => v.number));

function takenByCity(db: DbShape): Record<string, number> {
  const taken: Record<string, number> = {};
  for (const v of allVaults(db)) taken[v.city] = (taken[v.city] ?? 0) + 1;
  return taken;
}

const withRange = (x: VaultTier): LadderTier => {
  const r = vaultTierRange(x);
  return { ...x, rangeMin: r.min, rangeMax: r.max };
};

/** Everything a member is entitled to, from the chain and their wallets. */
function entitlement(account: DbAccount, chain: ChainState, now: number) {
  const eb = vaultEarlyBird(account.wallets);
  const holding = chain.holding ?? 0;
  const tierCounted = vaultTierBalance(holding, eb !== null);
  const tier = vaultTierFor(tierCounted);
  const sold = vaultSold(chain.distributor);
  return {
    eb,
    holding,
    tierCounted,
    tier,
    sold,
    allowed: vaultsAllowed(tier?.vaults ?? 0, sold, account.wallets),
    boost: activeMetalBoost(sold, now),
  };
}

function rewardsFor(tier: VaultTier, earlyBird: boolean, boost: MyRewards["metalBoost"]): MyRewards {
  const eb = earlyBird ? EARLY_BIRD_REWARD_MULTIPLIER : 1;
  return {
    weekly: { USD: tier.weekly.USD * eb, EUR: tier.weekly.EUR * eb, GBP: tier.weekly.GBP * eb },
    // Early-bird doubling is a status and the milestone boost is an event
    // for everyone; they are separate rewards and both apply to metals.
    metals: tier.metals.map((m) => ({ ...m, grams: m.grams * eb * boost.multiplier })),
    tokens: tier.tokens.map((t) => ({ ...t, amount: t.amount * eb })),
    earlyBirdMultiplier: eb,
    metalBoost: boost,
  };
}

function summarise(db: DbShape, account: DbAccount, chain: ChainState, now = Date.now()): VaultSummary {
  const e = entitlement(account, chain, now);
  const vaults = [...(db.vaultClaims[account.id] ?? [])].sort((a, b) => a.number - b.number);
  const claimed = allVaults(db).length;
  const nxt = nextVaultTier(e.tierCounted);
  const stage = currentStage(e.sold);

  return {
    token: ITDBVAULT_TOKEN,
    total: TOTAL_VAULTS,
    claimed,
    available: Math.max(TOTAL_VAULTS - claimed, 0),
    perCity: VAULTS_PER_CITY,
    remaining: remainingByCity(takenByCity(db)),
    takenNumbers: [...takenNumbers(db)].sort((a, b) => a - b),

    sale: {
      xlm: SALE_XLM_TOTAL,
      priceXlm: PRICE_XLM_PER_TOKEN,
      supply: TOKEN_SUPPLY,
      sold: e.sold,
      soldPct: (e.sold / TOKEN_SUPPLY) * 100,
      xlmPerVault: XLM_PER_VAULT,
      tokensPerVault: TOKENS_PER_VAULT,
    },
    earlyBird: {
      endsAt: EARLY_BIRD_ENDS_AT,
      open: now < EARLY_BIRD_ENDS_AT,
      refundPct: EARLY_BIRD_REFUND_PCT,
      multiplier: EARLY_BIRD_REWARD_MULTIPLIER,
    },

    holding: chain.holding,
    tierCounted: e.tierCounted,
    discounted: e.tierCounted > e.holding,
    tier: e.tier ? withRange(e.tier) : null,
    next: nxt
      ? { ...withRange(nxt), needed: vaultTierNeeded(nxt.min, e.holding, e.tierCounted) }
      : null,
    tiers: VAULT_TIERS.map(withRange),

    allowed: e.allowed,
    vaults,
    canChooseNumbers: e.eb !== null,

    rewards: e.tier ? rewardsFor(e.tier, e.eb !== null, e.boost) : null,
    bonusTokens: stage ? Math.round(e.holding * (stage.bonusPct / 100)) : 0,
    mine: e.eb
      ? {
          xlmSpent: e.eb.xlmSpent,
          refundXlm: (e.eb.xlmSpent * EARLY_BIRD_REFUND_PCT) / 100,
          starterPack: STARTER_PACK,
        }
      : null,

    milestones: vaultMilestones(e.sold),
    branches: BRANCHES,
    metals: VAULT_METALS,
    backedAssets: BACKED_ASSETS,
    benefits: VAULT_BENEFITS,
    buybackPremiumPct: BUYBACK_PREMIUM_PCT,
  };
}

/* ------------------------------------------------------------------ */
/*  Handlers                                                           */
/* ------------------------------------------------------------------ */

type Fail = { ok: false; error: string; status: number };
const fail = (error: string, status: number): Fail => ({ ok: false, error, status });

async function load(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return { error: NextResponse.json({ error: "Sign in again." }, { status: 401 }) };
  const db = await getDb();
  const account = db.accounts.find((a) => a.id === id);
  if (!account) return { error: NextResponse.json({ error: "Account not found" }, { status: 404 }) };
  return { db, account };
}

const validNumber = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= TOTAL_VAULTS;

/** GET /api/vault — the network, and this member's tier and vaults. */
export async function GET(req: Request) {
  const l = await load(req);
  if ("error" in l) return l.error;
  // A Horizon failure leaves the holding unknown rather than zero, and the
  // page still loads — the member's vaults are in our own records.
  const chain = await readChain(l.account);
  return NextResponse.json(summarise(l.db, l.account, chain));
}

/**
 * POST /api/vault — take one more vault, up to what the tier allows.
 *
 * Body: { city, number? }. Early birds may name a free number; everyone
 * else is given a random one. The tier is re-read from the chain here,
 * never taken from the client, and the count, city capacity and number
 * are all re-checked inside the mutation.
 */
export async function POST(req: Request) {
  const l = await load(req);
  if ("error" in l) return l.error;

  let body: { city?: unknown; number?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // an empty body is handled by validation below
  }
  const city = typeof body.city === "string" ? body.city : null;
  if (!city || !VAULT_CITY_NAMES.includes(city))
    return NextResponse.json({ error: "Choose one of our ten cities." }, { status: 400 });
  if (body.number !== undefined && !validNumber(body.number))
    return NextResponse.json(
      { error: `Vault numbers run from 001 to ${TOTAL_VAULTS}.` },
      { status: 400 },
    );

  const chain = await readChain(l.account);
  if (chain.holding === null)
    return NextResponse.json(
      { error: "The Stellar network is busy — we could not confirm your tier. Try again shortly." },
      { status: 503, headers: { "Retry-After": "5" } },
    );

  const now = Date.now();
  const e = entitlement(l.account, chain, now);
  const result = await mutateDb((db): Fail | { ok: true } => {
    const mine = (db.vaultClaims[l.account.id] ??= []);
    if (mine.length >= e.allowed)
      return fail(
        e.allowed === 0
          ? "Tier 1 (2,000 ITDBVAULT) is needed to own a vault."
          : `Your tier gives you ${e.allowed} vault${e.allowed > 1 ? "s" : ""}, and you hold ${mine.length}.`,
        403,
      );
    if (allVaults(db).length >= TOTAL_VAULTS) return fail("Every vault has been claimed.", 409);
    if ((remainingByCity(takenByCity(db))[city] ?? 0) <= 0)
      return fail(`${city} is full — choose another city.`, 409);

    const taken = takenNumbers(db);
    let number: number;
    if (e.eb && validNumber(body.number)) {
      if (taken.has(body.number)) return fail(`Vault #${String(body.number).padStart(3, "0")} is already owned.`, 409);
      number = body.number;
    } else {
      const free = randomFreeNumber(taken);
      if (free === null) return fail("Every vault number is taken.", 409);
      number = free;
    }

    mine.push({ at: now, city, number, index: allVaults(db).length });
    return { ok: true };
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(summarise(await getDb(), l.account, chain, now));
}

/**
 * PATCH /api/vault — an early bird moves one of their own vaults to a
 * different number and/or city. Body: { vault, number?, city? }.
 *
 * This is how an early bird who was given a number before the privilege
 * reached them gets the one they wanted.
 */
export async function PATCH(req: Request) {
  const l = await load(req);
  if ("error" in l) return l.error;

  if (!vaultEarlyBird(l.account.wallets))
    return NextResponse.json(
      { error: "Choosing vault numbers is an early-bird privilege." },
      { status: 403 },
    );

  let body: { vault?: unknown; number?: unknown; city?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // handled below
  }
  if (!validNumber(body.vault))
    return NextResponse.json({ error: "Which vault?" }, { status: 400 });
  if (body.number !== undefined && !validNumber(body.number))
    return NextResponse.json({ error: `Vault numbers run from 001 to ${TOTAL_VAULTS}.` }, { status: 400 });
  if (body.city !== undefined && (typeof body.city !== "string" || !VAULT_CITY_NAMES.includes(body.city)))
    return NextResponse.json({ error: "Choose one of our ten cities." }, { status: 400 });

  const from = body.vault;
  const toNumber = (body.number as number | undefined) ?? from;
  const toCity = body.city as string | undefined;

  const result = await mutateDb((db): Fail | { ok: true } => {
    const mine = db.vaultClaims[l.account.id] ?? [];
    const v = mine.find((x) => x.number === from);
    if (!v) return fail("That vault is not yours.", 404);

    if (toNumber !== v.number && takenNumbers(db).has(toNumber))
      return fail(`Vault #${String(toNumber).padStart(3, "0")} is already owned.`, 409);
    if (toCity && toCity !== v.city && (remainingByCity(takenByCity(db))[toCity] ?? 0) <= 0)
      return fail(`${toCity} is full.`, 409);

    v.number = toNumber;
    if (toCity) v.city = toCity;
    return { ok: true };
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(summarise(await getDb(), l.account, await readChain(l.account)));
}
