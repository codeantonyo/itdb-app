import { NextResponse } from "next/server";
import {
  ATMS_PER_CITY,
  ATMS_SUPPLY,
  ATM_CITIES,
  CENTRAL_BANK,
  COUNCIL,
  PRESALE_CRYPTO_PER_1000,
  TOTAL_ATMS,
  ATM_TIERS,
  atmEntitlement,
  dailyCrypto,
  firstToReach,
  nextAtmTier,
  placementProblem,
  presaleWindow,
  discountWindow,
  type AtmSale,
  type AtmStage,
} from "@/lib/itdb/atms";
import { atmChain, type AtmBonusPayment } from "@/lib/server/atm-sales";
import { getDb, mutateDb, type AtmWaveRecord, type DbAccount, type DbShape } from "@/lib/server/db";
import { memberHoldings, tokenBalance } from "@/lib/server/holdings";
import { sessionAccountId } from "@/lib/server/session";
import { ITDBATMS_TOKEN } from "@/lib/stellar/registry";

export interface AtmSummary {
  total: number;
  perCity: number;
  /** ATMs placed network-wide, and how many are left in each city */
  placed: number;
  remaining: Record<string, number>;

  /** Null when the sales could not be read */
  sold: number | null;
  soldPct: number;
  presale: { startsAt: number; endsAt: number; open: boolean; ended: boolean };

  /** ITDBATMS held on chain; null when Horizon could not be read */
  holding: number | null;
  presaleBought: number;
  /** Bonus 1 — paid when the pre-sale ends */
  bonusTokens: number;
  /** Bonus ITDBATMS this member earned, and whether each has reached their wallet */
  bonuses: { kind: "presale" | "discount"; amount: number; sent: number; txHash: string | null }[];
  /** x2 on tier rewards, for buying before the tier discount */
  rewardsMultiplier: number;
  freeAtms: number;
  counted: number;
  tier: number | null;
  next: { tier: number; min: number; needed: number } | null;
  baseAtms: number;
  multiplier: number;
  waveExtra: number;
  allowed: number;
  placements: { city: string; count: number }[];

  rewards: { daily: number; crypto: { code: string; amount: number }[]; returnPct: number } | null;
  presaleCrypto: { code: string; amount: number }[];
  /** The current wave's rewards on this member's holding */
  wave: {
    pct: number;
    /** Bonus ITDBATMS due, and how much of it has reached their wallets */
    bonusTokens: number;
    tokensSent: number;
    txHash: string | null;
    crypto: { code: string; amount: number }[];
    goldKg: number;
    extraReturnPct: number;
    /** When the crypto and gold were credited to the account, or null */
    creditedAt: number | null;
  } | null;
  council: boolean;
  centralBank: boolean;
}

const byCity = (db: DbShape, exceptId?: string) => {
  const taken: Record<string, number> = {};
  for (const [id, p] of Object.entries(db.atmPlacements)) {
    if (id === exceptId) continue;
    for (const [city, n] of Object.entries(p)) taken[city] = (taken[city] ?? 0) + n;
  }
  return taken;
};

async function readChain(account: DbAccount) {
  const [mine, chain] = await Promise.all([
    memberHoldings(account.wallets).then(
      (h) => tokenBalance(h, ITDBATMS_TOKEN),
      () => null,
    ),
    atmChain(),
  ]);
  const wallets = new Set(account.wallets);
  return {
    holding: mine,
    sales: chain?.sales ?? null,
    bonuses: (chain?.bonuses ?? []).filter((b) => wallets.has(b.wallet)),
  };
}

/**
 * What wave rewards are counted on: the holding WITHOUT bonus tokens
 * already received, so a paid bonus never earns itself another bonus.
 */
const basisOf = (holding: number, mine: AtmBonusPayment[]) =>
  Math.max(holding - mine.reduce((t, b) => t + b.amount, 0), 0);

/** A wave's in-app rewards (crypto + gold) on a basis. */
function waveRecord(stage: AtmStage, basis: number, at: number): AtmWaveRecord {
  const k = Math.floor(basis / 1_000);
  return { at, basis, crypto: stage.cryptoPer1000.map((c) => ({ code: c.code, amount: c.amount * k })), goldKg: stage.goldKg };
}

function entitlementOf(account: DbAccount, holding: number, sales: AtmSale[] | null, bonuses: AtmBonusPayment[], now: number) {
  const list = sales ?? [];
  const window = presaleWindow(list);
  const wallets = new Set(account.wallets);
  const mine = list.filter((s) => wallets.has(s.wallet));
  const sum = (xs: { amount: number }[]) => xs.reduce((t, x) => t + x.amount, 0);
  const presaleBought = sum(mine.filter((s) => s.at <= window.cutoff));
  const d = discountWindow();
  const discountBought = d ? sum(mine.filter((s) => s.at >= d.startsAt && s.at < d.endsAt)) : 0;
  const sold = sum(list);
  const e = atmEntitlement({
    holding,
    presaleBought,
    presaleEnded: now >= window.endsAt,
    discountBought,
    discountEnded: !!d && now >= d.endsAt,
    boughtBefore: !!d && mine.some((s) => s.at < d.startsAt),
    paid: {
      presale: sum(bonuses.filter((b) => b.kind === "presale")),
      discount: sum(bonuses.filter((b) => b.kind === "discount")),
    },
    sold,
  });
  return { ...e, window, presaleBought, sold };
}

function bonusRows(e: ReturnType<typeof entitlementOf>, bonuses: AtmBonusPayment[]): AtmSummary["bonuses"] {
  const row = (kind: "presale" | "discount", amount: number) => {
    const paid = bonuses.filter((b) => b.kind === kind);
    return { kind, amount, sent: paid.reduce((t, b) => t + b.amount, 0), txHash: paid[0]?.txHash ?? null };
  };
  return [
    ...(e.bonusTokens > 0 ? [row("presale", e.bonusTokens)] : []),
    ...(e.discountBonus > 0 ? [row("discount", e.discountBonus)] : []),
  ];
}

function summarise(
  db: DbShape,
  account: DbAccount,
  holding: number | null,
  sales: AtmSale[] | null,
  bonuses: AtmBonusPayment[],
  now = Date.now(),
): AtmSummary {
  const e = entitlementOf(account, holding ?? 0, sales, bonuses, now);
  const taken = byCity(db);
  const placed = Object.values(taken).reduce((s, n) => s + n, 0);
  const mine = db.atmPlacements[account.id] ?? {};
  const nxt = nextAtmTier(e.counted);
  const owns = (seats: Set<string>) => account.wallets.some((w) => seats.has(w));
  const list = sales ?? [];

  return {
    total: TOTAL_ATMS,
    perCity: ATMS_PER_CITY,
    placed,
    remaining: Object.fromEntries(ATM_CITIES.map((c) => [c.city, Math.max(ATMS_PER_CITY - (taken[c.city] ?? 0), 0)])),

    sold: sales ? e.sold : null,
    soldPct: Math.min((e.sold / ATMS_SUPPLY) * 100, 100),
    presale: {
      startsAt: e.window.startsAt,
      endsAt: e.window.endsAt,
      open: now >= e.window.startsAt && now < e.window.endsAt,
      ended: now >= e.window.endsAt,
    },

    holding,
    presaleBought: e.presaleBought,
    bonusTokens: e.bonusTokens,
    bonuses: bonusRows(e, bonuses),
    rewardsMultiplier: e.rewardsMultiplier,
    freeAtms: e.freeAtms,
    counted: e.counted,
    tier: e.tier?.tier ?? null,
    next: nxt ? { tier: nxt.tier, min: nxt.min, needed: Math.max(nxt.min - e.counted, 0) } : null,
    baseAtms: e.baseAtms,
    multiplier: e.multiplier,
    waveExtra: e.waveExtra,
    allowed: e.allowed,
    placements: Object.entries(mine)
      .filter(([, n]) => n > 0)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count),

    rewards: e.tier
      ? {
          daily: e.tier.daily * e.rewardsMultiplier,
          crypto: dailyCrypto(e.tier).map((c) => ({ ...c, amount: c.amount * e.rewardsMultiplier })),
          returnPct: e.tier.returnPct,
        }
      : null,
    presaleCrypto:
      e.presaleBought >= ATM_TIERS[0].min
        ? PRESALE_CRYPTO_PER_1000.map((c) => ({ code: c.code, amount: c.amount * Math.floor(e.presaleBought / 1_000) }))
        : [],
    wave: e.stage ? waveView(e.stage, basisOf(holding ?? 0, bonuses), bonuses, db.atmWaves[account.id]?.[e.stage.pct]) : null,
    council: owns(firstToReach(list, ATM_TIERS[COUNCIL.tier - 1].min, COUNCIL.seats)),
    centralBank: owns(firstToReach(list, ATM_TIERS[CENTRAL_BANK.tier - 1].min, CENTRAL_BANK.seats)),
  };
}

function waveView(stage: AtmStage, basis: number, mine: AtmBonusPayment[], credited: AtmWaveRecord | undefined): AtmSummary["wave"] {
  const paid = mine.filter((b) => b.wave === stage.pct);
  const r = credited ?? waveRecord(stage, basis, 0);
  return {
    pct: stage.pct,
    bonusTokens: paid.length ? paid.reduce((t, b) => t + b.amount, 0) : Math.round((basis * stage.bonusPct) / 100),
    tokensSent: paid.reduce((t, b) => t + b.amount, 0),
    txHash: paid[0]?.txHash ?? null,
    crypto: r.crypto,
    goldKg: r.goldKg,
    extraReturnPct: stage.extraReturnPct,
    creditedAt: credited?.at ?? null,
  };
}

async function load(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return null;
  const db = await getDb();
  return db.accounts.find((a) => a.id === id) ?? null;
}

/** GET /api/atms — the network, and this member's tier, ATMs and bonuses. */
export async function GET(req: Request) {
  const account = await load(req);
  if (!account) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const { holding, sales, bonuses } = await readChain(account);

  // Credit the current wave's crypto and gold the first time a holder of
  // 1,000+ opens this — automatically, once per wave. An unreadable
  // holding decides nothing.
  if (holding !== null && sales !== null) {
    const { stage } = entitlementOf(account, holding, sales, bonuses, Date.now());
    const basis = basisOf(holding, bonuses);
    if (stage && basis >= ATM_TIERS[0].min && !(await getDb()).atmWaves[account.id]?.[stage.pct])
      await mutateDb((db) => {
        const mine = (db.atmWaves[account.id] ??= {});
        mine[stage.pct] ??= waveRecord(stage, basis, Date.now());
        return null;
      });
  }
  return NextResponse.json(summarise(await getDb(), account, holding, sales, bonuses));
}

/**
 * POST /api/atms — set how many of my ATMs stand in one city.
 * Body: { city, count }. 0 takes them all back. What I own is re-read
 * from the chain here; the city's room is re-checked inside the write.
 */
export async function POST(req: Request) {
  const account = await load(req);
  if (!account) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  let body: { city?: unknown; count?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // validated below
  }
  const city = typeof body.city === "string" ? body.city : "";
  const count = typeof body.count === "number" ? body.count : NaN;

  const { holding, sales, bonuses } = await readChain(account);
  const current = (await getDb()).atmPlacements[account.id]?.[city] ?? 0;
  if (count > current && (holding === null || sales === null))
    return NextResponse.json(
      { error: "The Stellar network is busy — we could not confirm your ATMs. Try again shortly." },
      { status: 503, headers: { "Retry-After": "5" } },
    );

  const now = Date.now();
  const { allowed } = entitlementOf(account, holding ?? 0, sales, bonuses, now);
  const problem = await mutateDb((db) => {
    const mine = (db.atmPlacements[account.id] ??= {});
    const p = placementProblem(city, count, mine, byCity(db, account.id)[city] ?? 0, allowed);
    if (p) return p;
    if (count === 0) delete mine[city];
    else mine[city] = count;
    return null;
  });
  if (problem) return NextResponse.json({ error: problem }, { status: 409 });
  return NextResponse.json(summarise(await getDb(), account, holding, sales, bonuses, now));
}
