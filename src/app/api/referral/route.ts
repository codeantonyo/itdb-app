import { NextResponse, after } from "next/server";
import { getDb, mutateDb, type DbAccount, type ReferralPayout } from "@/lib/server/db";
import {
  MONTHLY_PRIZES,
  REFERRAL_TOKENS,
  REFERRAL_WINDOW_MS,
  ensureReferralAwards,
  leaderboard,
  qualifiedAt,
  referralProblem,
  refereesOf,
  referrerOf,
  type LeaderRow,
} from "@/lib/server/referral";
import { payoutConfig, settleReferralRewards } from "@/lib/server/referral-payout";
import { sessionAccountId } from "@/lib/server/session";

/** Room for a few Stellar payments after the response has gone. */
export const maxDuration = 60;

export type RewardStatus = "waiting" | "queued" | "sending" | "paid" | "blocked";

export interface RewardView {
  amount: number;
  status: RewardStatus;
  txHash?: string;
  /** Why it has not been paid yet, in words the member can act on */
  note?: string;
}

export interface RefereeRow {
  username: string;
  joinedAt: number;
  qualifiedAt: number | null;
  /** What qualified them — Tier 2 in these tokens */
  tokens: string[];
  /** Your reward for this referral */
  reward: RewardView;
}

export interface ReferralSummary {
  code: string;
  /** The link to share; the app captures ?ref= and pre-fills sign-up */
  link: string;
  /** Who referred me, if anyone */
  referrer: string | null;
  /** Until when I may still add a code, or null when I no longer can */
  addCodeUntil: number | null;
  /** ITDB per side, per qualified referral */
  perReferral: number;
  /** Whether rewards are being sent on chain right now */
  sending: boolean;
  /** My own reward for joining through a referral, once I qualify */
  myReward: RewardView | null;
  referees: RefereeRow[];
  /** ITDB received on chain as a referrer, and still to come */
  received: number;
  owed: number;
  tiers: { token: string; tier2: number }[];
  month: { label: string; rows: (LeaderRow & { rank: number })[]; myRank: number | null };
  lastMonth: { label: string; winners: (LeaderRow & { rank: number })[] };
  prizes: typeof MONTHLY_PRIZES;
}

const monthLabel = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

function rewardView(p: ReferralPayout | undefined, qualified: boolean, amount: number, enabled: boolean): RewardView {
  if (!qualified) return { amount, status: "waiting", note: "Paid once they reach Tier 2" };
  if (p?.status === "paid") return { amount: p.amount, status: "paid", txHash: p.txHash };
  if (p?.status === "pending") return { amount, status: "sending" };
  if (p?.status === "failed")
    return { amount, status: "blocked", note: p.error ?? "Will be retried automatically" };
  return { amount, status: "queued", note: enabled ? "Sending shortly" : "Sending starts soon" };
}

function summarise(req: Request, db: Awaited<ReturnType<typeof getDb>>, me: DbAccount, now = Date.now()): ReferralSummary {
  const origin = new URL(req.url).origin;
  const cfg = payoutConfig();
  const per = cfg?.perReferral ?? Number(process.env.ITDB_REWARDS_PER_REFERRAL ?? 10_000);
  const enabled = cfg !== null;

  let received = 0;
  let owed = 0;
  const rows: RefereeRow[] = refereesOf(db, me)
    .map((r) => {
      const awards = (db.referralAwards[r.id] ?? []).filter((a) => a.referrerId === me.id);
      const q = awards.length > 0;
      const reward = rewardView(db.referralPayouts[`${r.id}:referrer`], q, per, enabled);
      if (reward.status === "paid") received += reward.amount;
      else if (q) owed += reward.amount;
      return {
        username: r.username,
        joinedAt: r.createdAt,
        qualifiedAt: qualifiedAt(db, r.id),
        tokens: awards.map((a) => a.token),
        reward,
      };
    })
    .sort((a, b) => b.joinedAt - a.joinedAt);

  const iQualified = (db.referralAwards[me.id] ?? []).length > 0;

  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const ranked = (list: LeaderRow[]) => list.map((r, i) => ({ ...r, rank: i + 1 }));
  const thisMonth = ranked(leaderboard(db, y, m));
  const prev = ranked(leaderboard(db, m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1));

  const canAdd = !me.referredBy && now - me.createdAt <= REFERRAL_WINDOW_MS;

  return {
    code: me.referralCode,
    link: `${origin}/login?ref=${encodeURIComponent(me.referralCode)}`,
    referrer: referrerOf(db, me)?.username ?? (me.referredBy ? me.referredBy : null),
    addCodeUntil: canAdd ? me.createdAt + REFERRAL_WINDOW_MS : null,
    perReferral: per,
    sending: enabled,
    myReward: me.referredBy ? rewardView(db.referralPayouts[`${me.id}:referee`], iQualified, per, enabled) : null,
    referees: rows,
    received,
    owed,
    tiers: REFERRAL_TOKENS.map((t) => ({ token: t.token.code, tier2: t.tier2 })),
    month: {
      label: monthLabel(y, m),
      rows: thisMonth.slice(0, 10),
      myRank: thisMonth.find((r) => r.accountId === me.id)?.rank ?? null,
    },
    lastMonth: { label: monthLabel(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1), winners: prev.slice(0, 3) },
    prizes: MONTHLY_PRIZES,
  };
}

/**
 * GET /api/referral — my code and link, my referrals, my match bonuses,
 * and this month's leaderboard.
 *
 * Reading this is also what awards matches, for me as a referee and for
 * each of my referrals — so a referral that reaches Tier 2 is credited the
 * next time either side opens the page, with nobody approving it.
 */
export async function GET(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  let db = await getDb();
  const me = db.accounts.find((a) => a.id === id);
  if (!me) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  // ponytail: one Horizon read per referral on every open; fine at this
  // size, move to a periodic sweep if referral lists grow into the hundreds.
  const pending = refereesOf(db, me).filter((r) => !qualifiedAt(db, r.id)).slice(0, 25);
  await Promise.all([ensureReferralAwards(me), ...pending.map((r) => ensureReferralAwards(r))]);

  // Real ITDB goes out after the response, so the page never waits on it.
  after(() => settleReferralRewards().then(() => undefined, () => undefined));

  db = await getDb();
  return NextResponse.json(summarise(req, db, db.accounts.find((a) => a.id === id)!));
}

/** POST /api/referral — add a referral code, within 24 hours of joining. */
export async function POST(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  let code = "";
  try {
    const body = (await req.json()) as { code?: unknown };
    if (typeof body.code === "string") code = body.code;
  } catch {
    // handled below
  }
  if (!code.trim()) return NextResponse.json({ error: "Enter a referral code." }, { status: 400 });

  const result = await mutateDb((db) => {
    const me = db.accounts.find((a) => a.id === id);
    if (!me) return { error: "Account not found", status: 404 };
    const problem = referralProblem(db, me, code);
    if (problem) return { error: problem, status: 409 };
    me.referredBy = code.trim().toUpperCase();
    return null;
  });
  if (result) return NextResponse.json({ error: result.error }, { status: result.status });

  const db = await getDb();
  const me = db.accounts.find((a) => a.id === id)!;
  await ensureReferralAwards(me); // already at Tier 2? it qualifies now
  after(() => settleReferralRewards().then(() => undefined, () => undefined));
  return NextResponse.json(summarise(req, await getDb(), me));
}
