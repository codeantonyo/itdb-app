import { NextResponse, after } from "next/server";
import { ICO_CODES, LADDER, type LadderStep } from "@/lib/itdb/referral-program";
import { getDb, mutateDb, type DbAccount, type DbShape, type ReferralPayout } from "@/lib/server/db";
import { MONTHLY_PRIZES, REFERRAL_WINDOW_MS, referralProblem, refereesOf, referrerOf } from "@/lib/server/referral";
import { payoutConfig, settleReferralRewards } from "@/lib/server/referral-payout";
import {
  countedReferees,
  creditsOf,
  ensureBuy,
  giveawayBoard,
  topReferrers,
  type BoardRow,
  type Credit,
} from "@/lib/server/referral-program";
import { sessionAccountId } from "@/lib/server/session";

/** Room for Horizon reads and a few legacy payments after the response. */
export const maxDuration = 60;

export type RewardStatus = "waiting" | "queued" | "sending" | "paid" | "blocked";

/** A reward from the earlier on-chain program (10,000 ITDB) */
export interface RewardView {
  amount: number;
  status: RewardStatus;
  txHash?: string;
  note?: string;
}

export interface FriendRow {
  username: string;
  joinedAt: number;
  /** When they crossed 100 XLM invested, or null */
  boughtAt: number | null;
  /** Counted toward the ladder and boards (the daily cap can leave one out) */
  counted: boolean;
}

export interface ReferralSummary {
  code: string;
  link: string;
  referrer: string | null;
  addCodeUntil: number | null;

  credits: Credit[];
  /** Totals across credits: USDC, and tokens per picked ICO plus those still to pick */
  totals: { usdc: number; tokens: Record<string, number>; unpicked: number };

  friends: FriendRow[];
  brought: number;
  qualified: number;
  step: LadderStep | null;
  next: LadderStep | null;

  month: { label: string; rows: (BoardRow & { rank: number })[]; myRank: number | null };
  lastMonth: { label: string; winners: (BoardRow & { rank: number })[] };
  prizes: typeof MONTHLY_PRIZES;

  giveaway: { rows: (BoardRow & { rank: number })[]; mine: number; myRank: number | null };

  /** The earlier 10,000-ITDB program — shown only to those it still owes or has paid */
  legacy: { received: number; owed: number; rows: (RewardView & { who: string })[] } | null;
}

const monthLabel = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const ranked = (list: BoardRow[]) => list.map((r, i) => ({ ...r, rank: i + 1 }));

function legacyView(p: ReferralPayout | undefined, amount: number, enabled: boolean): RewardView {
  if (p?.status === "paid") return { amount: p.amount, status: "paid", txHash: p.txHash };
  if (p?.status === "pending") return { amount, status: "sending" };
  if (p?.status === "failed" && !p.operator) return { amount, status: "blocked", note: p.error ?? "Will be retried automatically" };
  return { amount, status: "queued", note: enabled ? "Sending shortly" : "Sending starts soon" };
}

/** The old program's rewards for me — only referrals it qualified before it closed. */
function legacyOf(db: DbShape, me: DbAccount): ReferralSummary["legacy"] {
  const cfg = payoutConfig();
  const per = cfg?.perReferral ?? 10_000;
  const rows: (RewardView & { who: string })[] = [];
  for (const r of refereesOf(db, me))
    if ((db.referralAwards[r.id] ?? []).some((a) => a.referrerId === me.id))
      rows.push({ who: r.username, ...legacyView(db.referralPayouts[`${r.id}:referrer`], per, cfg !== null) });
  if ((db.referralAwards[me.id] ?? []).length > 0)
    rows.push({ who: "your welcome reward", ...legacyView(db.referralPayouts[`${me.id}:referee`], per, cfg !== null) });
  if (rows.length === 0) return null;
  const received = rows.filter((r) => r.status === "paid").reduce((t, r) => t + r.amount, 0);
  const owed = rows.filter((r) => r.status !== "paid").reduce((t, r) => t + r.amount, 0);
  return { received, owed, rows };
}

function summarise(req: Request, db: DbShape, me: DbAccount, now = Date.now()): ReferralSummary {
  const { credits, referees, qualified, step } = creditsOf(db, me);
  const counted = new Set(countedReferees(db, me).map((r) => r.id));
  const tokens: Record<string, number> = {};
  let unpicked = 0;
  for (const c of credits) {
    if (!c.tokens) continue;
    if (c.token) tokens[c.token] = (tokens[c.token] ?? 0) + c.tokens;
    else unpicked += c.tokens;
  }

  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const thisMonth = ranked(topReferrers(db, y, m));
  const prev = ranked(topReferrers(db, m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1));
  const board = ranked(giveawayBoard(db));
  const mine = board.find((r) => r.accountId === me.id);

  return {
    code: me.referralCode,
    link: `${new URL(req.url).origin}/login?ref=${encodeURIComponent(me.referralCode)}`,
    referrer: referrerOf(db, me)?.username ?? (me.referredBy ? me.referredBy : null),
    addCodeUntil: !me.referredBy && now - me.createdAt <= REFERRAL_WINDOW_MS ? me.createdAt + REFERRAL_WINDOW_MS : null,

    credits,
    totals: { usdc: credits.reduce((t, c) => t + c.usdc, 0), tokens, unpicked },

    friends: refereesOf(db, me)
      .map((r) => ({ username: r.username, joinedAt: r.createdAt, boughtAt: db.referralBuys[r.id]?.at ?? null, counted: counted.has(r.id) }))
      .sort((a, b) => b.joinedAt - a.joinedAt),
    brought: referees.length,
    qualified,
    step,
    next: LADDER.find((s) => qualified < s.friends) ?? null,

    month: { label: monthLabel(y, m), rows: thisMonth.slice(0, 10), myRank: thisMonth.find((r) => r.accountId === me.id)?.rank ?? null },
    lastMonth: { label: monthLabel(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1), winners: prev.slice(0, 3) },
    prizes: MONTHLY_PRIZES,

    giveaway: { rows: board.slice(0, 10), mine: mine?.count ?? 0, myRank: mine?.rank ?? null },

    legacy: legacyOf(db, me),
  };
}

async function load(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return null;
  const db = await getDb();
  return db.accounts.find((a) => a.id === id) ?? null;
}

/**
 * GET /api/referral — my code, my credits, my friends, the ladder and both
 * boards. Opening it also checks the chain for friends (and me) who have
 * crossed 100 XLM since joining, so credits appear with nobody approving them.
 */
export async function GET(req: Request) {
  const me = await load(req);
  if (!me) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  // ponytail: one Horizon scan per unqualified friend per open; move to the
  // cron sweep alone if referral lists grow into the hundreds.
  const db = await getDb();
  const pending = refereesOf(db, me).filter((r) => !db.referralBuys[r.id]).slice(0, 25);
  if (me.referredBy && !db.referralBuys[me.id]) pending.push(me);
  await Promise.all(pending.map(ensureBuy));

  // What the earlier on-chain program still owes keeps going out.
  after(() => settleReferralRewards().then(() => undefined, () => undefined));

  const fresh = await getDb();
  return NextResponse.json(summarise(req, fresh, fresh.accounts.find((a) => a.id === me.id)!));
}

/**
 * POST /api/referral
 *   { code }          add a referral code, within 24 hours of joining
 *   { pick, token }   choose the ICO for one of my credits' tokens
 */
export async function POST(req: Request) {
  const me = await load(req);
  if (!me) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  let body: { code?: unknown; pick?: unknown; token?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // handled below
  }

  if (typeof body.pick === "string") {
    const key = body.pick;
    const token = body.token;
    if (typeof token !== "string" || !(ICO_CODES as readonly string[]).includes(token))
      return NextResponse.json({ error: "Choose one of the five ICOs." }, { status: 400 });
    const error = await mutateDb((db) => {
      const credit = creditsOf(db, db.accounts.find((a) => a.id === me.id)!).credits.find((c) => c.key === key);
      if (!credit || credit.tokens === 0) return "That reward is not yours.";
      if (credit.token) return "You already chose for that reward.";
      (db.referralChoices[me.id] ??= {})[key] = token;
      return null;
    });
    if (error) return NextResponse.json({ error }, { status: 409 });
    const db = await getDb();
    return NextResponse.json(summarise(req, db, db.accounts.find((a) => a.id === me.id)!));
  }

  const code = typeof body.code === "string" ? body.code : "";
  if (!code.trim()) return NextResponse.json({ error: "Enter a referral code." }, { status: 400 });
  const problem = await mutateDb((db) => {
    const acct = db.accounts.find((a) => a.id === me.id);
    if (!acct) return "Account not found";
    const p = referralProblem(db, acct, code);
    if (p) return p;
    acct.referredBy = code.trim().toUpperCase();
    return null;
  });
  if (problem) return NextResponse.json({ error: problem }, { status: 409 });

  const db = await getDb();
  const updated = db.accounts.find((a) => a.id === me.id)!;
  await ensureBuy(updated); // already invested? it counts now
  const fresh = await getDb();
  return NextResponse.json(summarise(req, fresh, fresh.accounts.find((a) => a.id === me.id)!));
}
