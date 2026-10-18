import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { ensureBuy } from "@/lib/server/referral-program";
import { payoutStatus, settleReferralRewards } from "@/lib/server/referral-payout";

export const maxDuration = 60;

/** Referred members to re-check for their 100 XLM per run, newest first. */
const CHECK_PER_RUN = 30;

/**
 * GET /api/referral/settle: the scheduled backstop (vercel.json cron).
 *
 * Page opens already credit referrals; this catches the ones nobody opened
 * a page for: it re-checks referred members who have not yet invested
 * 100 XLM, then pays what the earlier on-chain program still owes.
 *
 * Open to any caller unless CRON_SECRET is set. That is deliberate:
 * settling only ever pays what is already owed, once, under the daily
 * cap, so an early trigger changes nothing but the timing.
 *
 * ?check=1 reports the paying account and what is owed WITHOUT sending
 * or changing anything.
 */
export async function GET(req: Request) {
  // The check is read-only and shows only what the chain already makes
  // public (an account address and its balance), so it needs no secret.
  if (new URL(req.url).searchParams.get("check") === "1")
    return NextResponse.json(await payoutStatus(await getDb()));

  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });

  const db = await getDb();
  const unqualified = db.accounts
    .filter((a) => a.referredBy && !db.referralBuys[a.id])
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, CHECK_PER_RUN);
  for (const a of unqualified) await ensureBuy(a);

  const report = await settleReferralRewards();
  return NextResponse.json({ checked: unqualified.length, ...report });
}
