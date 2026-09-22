import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { ensureReferralAwards, qualifiedAt } from "@/lib/server/referral";
import { settleReferralRewards } from "@/lib/server/referral-payout";

export const maxDuration = 60;

/** Referrals to re-check for Tier 2 per run, oldest unqualified first. */
const CHECK_PER_RUN = 30;

/**
 * GET /api/referral/settle — the scheduled backstop (vercel.json cron).
 *
 * Page opens already qualify referrals and pay rewards; this catches the
 * ones nobody opened a page for: it re-checks unqualified referrals
 * against the chain, then pays whatever is owed.
 *
 * Only Vercel's scheduler may call it: Vercel sends
 * `Authorization: Bearer $CRON_SECRET`, and without CRON_SECRET set the
 * route refuses everyone rather than run open.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });

  const db = await getDb();
  const unqualified = db.accounts
    .filter((a) => a.referredBy && !qualifiedAt(db, a.id))
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, CHECK_PER_RUN);
  for (const a of unqualified) await ensureReferralAwards(a);

  const report = await settleReferralRewards();
  return NextResponse.json({ checked: unqualified.length, ...report });
}
