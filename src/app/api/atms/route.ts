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
  type AtmSale,
} from "@/lib/itdb/atms";
import { atmSales } from "@/lib/server/atm-sales";
import { getDb, mutateDb, type DbAccount, type DbShape } from "@/lib/server/db";
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
  presale: { startsAt: number; endsAt: number; open: boolean; ended: boolean } | null;

  /** ITDBATMS held on chain; null when Horizon could not be read */
  holding: number | null;
  presaleBought: number;
  /** Bonus 1 — paid when the pre-sale ends */
  bonusTokens: number;
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
    bonusTokens: number;
    crypto: { code: string; amount: number }[];
    goldKg: number;
    extraReturnPct: number;
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
  const [mine, sales] = await Promise.all([
    memberHoldings(account.wallets).then(
      (h) => tokenBalance(h, ITDBATMS_TOKEN),
      () => null,
    ),
    atmSales(),
  ]);
  return { holding: mine, sales };
}

function entitlementOf(account: DbAccount, holding: number, sales: AtmSale[] | null, now: number) {
  const list = sales ?? [];
  const window = presaleWindow(list);
  const wallets = new Set(account.wallets);
  const presaleBought = window
    ? list.filter((s) => wallets.has(s.wallet) && s.at >= window.startsAt && s.at < window.endsAt).reduce((t, s) => t + s.amount, 0)
    : 0;
  const sold = list.reduce((t, s) => t + s.amount, 0);
  const e = atmEntitlement({ holding, presaleBought, presaleEnded: !!window && now >= window.endsAt, sold });
  return { ...e, window, presaleBought, sold };
}

function summarise(db: DbShape, account: DbAccount, holding: number | null, sales: AtmSale[] | null, now = Date.now()): AtmSummary {
  const e = entitlementOf(account, holding ?? 0, sales, now);
  const taken = byCity(db);
  const placed = Object.values(taken).reduce((s, n) => s + n, 0);
  const mine = db.atmPlacements[account.id] ?? {};
  const nxt = nextAtmTier(e.counted);
  const k = Math.floor((holding ?? 0) / 1_000);
  const owns = (seats: Set<string>) => account.wallets.some((w) => seats.has(w));
  const list = sales ?? [];

  return {
    total: TOTAL_ATMS,
    perCity: ATMS_PER_CITY,
    placed,
    remaining: Object.fromEntries(ATM_CITIES.map((c) => [c.city, Math.max(ATMS_PER_CITY - (taken[c.city] ?? 0), 0)])),

    sold: sales ? e.sold : null,
    soldPct: Math.min((e.sold / ATMS_SUPPLY) * 100, 100),
    presale: e.window ? { ...e.window, open: now >= e.window.startsAt && now < e.window.endsAt, ended: now >= e.window.endsAt } : null,

    holding,
    presaleBought: e.presaleBought,
    bonusTokens: e.bonusTokens,
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

    rewards: e.tier ? { daily: e.tier.daily, crypto: dailyCrypto(e.tier), returnPct: e.tier.returnPct } : null,
    presaleCrypto:
      e.presaleBought >= ATM_TIERS[0].min
        ? PRESALE_CRYPTO_PER_1000.map((c) => ({ code: c.code, amount: c.amount * Math.floor(e.presaleBought / 1_000) }))
        : [],
    wave: e.stage
      ? {
          pct: e.stage.pct,
          bonusTokens: Math.round(((holding ?? 0) * e.stage.bonusPct) / 100),
          crypto: e.stage.cryptoPer1000.map((c) => ({ code: c.code, amount: c.amount * k })),
          goldKg: e.stage.goldKg,
          extraReturnPct: e.stage.extraReturnPct,
        }
      : null,
    council: owns(firstToReach(list, ATM_TIERS[COUNCIL.tier - 1].min, COUNCIL.seats)),
    centralBank: owns(firstToReach(list, ATM_TIERS[CENTRAL_BANK.tier - 1].min, CENTRAL_BANK.seats)),
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
  const { holding, sales } = await readChain(account);
  return NextResponse.json(summarise(await getDb(), account, holding, sales));
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

  const { holding, sales } = await readChain(account);
  const current = (await getDb()).atmPlacements[account.id]?.[city] ?? 0;
  if (count > current && (holding === null || sales === null))
    return NextResponse.json(
      { error: "The Stellar network is busy — we could not confirm your ATMs. Try again shortly." },
      { status: 503, headers: { "Retry-After": "5" } },
    );

  const now = Date.now();
  const { allowed } = entitlementOf(account, holding ?? 0, sales, now);
  const problem = await mutateDb((db) => {
    const mine = (db.atmPlacements[account.id] ??= {});
    const p = placementProblem(city, count, mine, byCity(db, account.id)[city] ?? 0, allowed);
    if (p) return p;
    if (count === 0) delete mine[city];
    else mine[city] = count;
    return null;
  });
  if (problem) return NextResponse.json({ error: problem }, { status: 409 });
  return NextResponse.json(summarise(await getDb(), account, holding, sales, now));
}
