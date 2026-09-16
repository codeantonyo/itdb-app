import { NextResponse } from "next/server";
import { QRS_BONUS_PCT, QRS_BONUS_UNLOCK_AT } from "@/lib/itdb/qrs-bonus";
import { QRS_TOKEN } from "@/lib/itdb/config";
import { getDb } from "@/lib/server/db";
import { sessionAccountId } from "@/lib/server/session";

export interface BonusPayoutRow {
  accountId: string;
  username: string;
  /** Wallets that held QRS when the bonus was awarded — pay the first */
  wallets: string[];
  category: "existing" | "new";
  basisBalance: number;
  bonusQrs: number;
  awardedAt: number;
  paidOnChainAt: number | null;
  txHash: string | null;
}

export interface BonusPayoutReport {
  asset: { code: string; issuer: string };
  pct: number;
  unlockAt: number;
  generatedAt: number;
  totals: { rows: number; unpaidRows: number; totalQrs: number; unpaidQrs: number };
  rows: BonusPayoutRow[];
}

/**
 * GET /api/admin/qrs-bonus — what the issuer owes on the 25% milestone
 * bonus, for the operator to pay out.
 *
 * This endpoint REPORTS. It does not sign, submit or mint anything, and
 * the app holds no issuer key: the on-chain distribution is run by a
 * person against this list. Rows stay listed until `paidOnChainAt` is
 * filled in, so a half-finished payout is obvious rather than silent.
 */
export async function GET(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const db = await getDb();
  const me = db.accounts.find((a) => a.id === id);
  if (!me) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (me.role !== "admin")
    return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const rows: BonusPayoutRow[] = Object.entries(db.qrsBonuses)
    .map(([accountId, r]) => ({
      accountId,
      username: db.accounts.find((a) => a.id === accountId)?.username ?? "—",
      wallets: r.wallets,
      category: r.category,
      basisBalance: r.basisBalance,
      bonusQrs: r.bonusQrs,
      awardedAt: r.awardedAt,
      paidOnChainAt: r.paidOnChainAt ?? null,
      txHash: r.txHash ?? null,
    }))
    .sort((a, b) => b.bonusQrs - a.bonusQrs);

  const unpaid = rows.filter((r) => r.paidOnChainAt === null);
  const report: BonusPayoutReport = {
    asset: QRS_TOKEN,
    pct: QRS_BONUS_PCT,
    unlockAt: QRS_BONUS_UNLOCK_AT,
    generatedAt: Date.now(),
    totals: {
      rows: rows.length,
      unpaidRows: unpaid.length,
      totalQrs: rows.reduce((s, r) => s + r.bonusQrs, 0),
      unpaidQrs: unpaid.reduce((s, r) => s + r.bonusQrs, 0),
    },
    rows,
  };
  return NextResponse.json(report);
}
