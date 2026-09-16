import { NextResponse } from "next/server";
import { QRS_BONUS_PCT, QRS_BONUS_UNLOCK_AT } from "@/lib/itdb/qrs-bonus";
import { QRS_TOKEN } from "@/lib/itdb/config";
import { getDb, mutateDb } from "@/lib/server/db";
import { HORIZON } from "@/lib/stellar/horizon";
import { horizonJson } from "@/lib/stellar/horizon-fetch";
import { programInputs } from "@/lib/server/accrual";
import { ensureQrsBonus } from "@/lib/server/qrs-bonus";
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

interface PostBody {
  /**
   * "sweep"     — record what every account is owed (the immediate run)
   * "reconcile" — read the chain and mark rows that have actually landed
   */
  action?: "sweep" | "reconcile";
  paid?: { accountId: string; txHash: string; at?: number }[];
}

export interface SweepResult {
  scanned: number;
  awarded: number;
  alreadyHad: number;
  lockedBelowTier1: number;
  noQrs: number;
  /** Skipped: the wallet's bonus was already awarded on another account */
  duplicateWallet: number;
  /** Horizon could not be read for these — re-run to pick them up */
  unreadable: number;
  totalQrsOwed: number;
}

export interface ReconcileResult {
  checked: number;
  confirmed: number;
  /** Awarded but no matching payment found on chain yet */
  stillOwed: number;
  /** Horizon could not be read — nothing was concluded for these */
  unreadable: number;
  /** Already marked paid before this run */
  alreadyPaid: number;
  missing: { username: string; wallet: string; bonusQrs: number }[];
}

interface HorizonPayment {
  type: string;
  transaction_hash: string;
  created_at: string;
  to?: string;
  amount?: string;
  asset_code?: string;
  asset_issuer?: string;
}

/**
 * Confirm the payout from the chain rather than from a receipts file.
 *
 * For each awarded-but-unpaid row it looks for a QRS payment INTO that
 * wallet, of at least the bonus, dated after the award. A row is marked
 * paid only when such a payment exists, with that transaction's real
 * hash — so "delivered" in the app always means the tokens genuinely
 * arrived, and a member the payout missed stays visibly owed instead of
 * being quietly ticked off.
 *
 * A Horizon failure counts as unreadable, never as "not paid".
 */
async function reconcile(): Promise<ReconcileResult> {
  const db = await getDb();
  const out: ReconcileResult = {
    checked: 0,
    confirmed: 0,
    stillOwed: 0,
    unreadable: 0,
    alreadyPaid: 0,
    missing: [],
  };
  const found: { accountId: string; txHash: string; at: number }[] = [];

  for (const [accountId, rec] of Object.entries(db.qrsBonuses)) {
    if (rec.paidOnChainAt) {
      out.alreadyPaid += 1;
      continue;
    }
    out.checked += 1;
    const wallet = rec.wallets[0];
    const username = db.accounts.find((a) => a.id === accountId)?.username ?? "—";
    if (!wallet) {
      out.stillOwed += 1;
      out.missing.push({ username, wallet: "—", bonusQrs: rec.bonusQrs });
      continue;
    }

    const url = `${HORIZON}/accounts/${wallet}/payments?limit=200&order=desc`;
    const res = await horizonJson<{ _embedded: { records: HorizonPayment[] } }>(url);
    if (res.kind === "unavailable") {
      out.unreadable += 1;
      continue;
    }
    if (res.kind === "absent") {
      out.stillOwed += 1;
      out.missing.push({ username, wallet, bonusQrs: rec.bonusQrs });
      continue;
    }

    const hit = res.data._embedded.records.find(
      (p) =>
        p.type === "payment" &&
        p.to === wallet &&
        p.asset_code === QRS_TOKEN.code &&
        p.asset_issuer === QRS_TOKEN.issuer &&
        Number(p.amount ?? 0) >= rec.bonusQrs - 1e-7 &&
        Date.parse(p.created_at) >= rec.awardedAt - 60_000,
    );
    if (hit) {
      found.push({ accountId, txHash: hit.transaction_hash, at: Date.parse(hit.created_at) });
      out.confirmed += 1;
    } else {
      out.stillOwed += 1;
      out.missing.push({ username, wallet, bonusQrs: rec.bonusQrs });
    }
  }

  if (found.length > 0) {
    await mutateDb((store) => {
      for (const f of found) {
        const rec = store.qrsBonuses[f.accountId];
        if (rec && !rec.paidOnChainAt) {
          rec.paidOnChainAt = f.at;
          rec.txHash = f.txHash;
        }
      }
      return null;
    });
  }
  return out;
}

/**
 * The immediate run: walk every account, read its live QRS balance and
 * first-acquired date, and record the bonus for anyone it is due to.
 *
 * Without this the bonus is only recorded when a member happens to open
 * the app, which leaves the payout list empty on day one. Awarding is
 * idempotent, so this is safe to run repeatedly — and it must be re-run
 * after new members join or after a Horizon wobble, since an account
 * whose balance could not be read is skipped rather than guessed at.
 */
async function sweep(): Promise<SweepResult> {
  const db = await getDb();
  const out: SweepResult = {
    scanned: 0,
    awarded: 0,
    alreadyHad: 0,
    lockedBelowTier1: 0,
    noQrs: 0,
    duplicateWallet: 0,
    unreadable: 0,
    totalQrsOwed: 0,
  };

  // Sequential on purpose: each account costs several Horizon calls and
  // a 429 here would read as "no QRS" if we let it through (§6.4).
  for (const account of db.accounts) {
    out.scanned += 1;
    const had = db.qrsBonuses[account.id] !== undefined;
    try {
      const inputs = await programInputs("qrs", account.wallets);
      const view = await ensureQrsBonus(
        account,
        db.qrsBonuses[account.id],
        inputs.balance,
        inputs.since,
        inputs.holders,
      );
      if (view.state === "delivered") {
        if (had) out.alreadyHad += 1;
        else out.awarded += 1;
        out.totalQrsOwed += view.bonusQrs;
      } else if (view.state === "locked") out.lockedBelowTier1 += 1;
      else if (view.state === "none") out.noQrs += 1;
      else if (view.state === "duplicate") out.duplicateWallet += 1;
      else out.unreadable += 1;
    } catch {
      out.unreadable += 1;
    }
  }
  return out;
}

/**
 * POST /api/admin/qrs-bonus — record that rows have been paid on chain.
 *
 * The payout itself happens outside this app, run by a person against
 * the GET report. This only writes back the transaction hash so members
 * stop seeing "awaiting the on-chain payout" and the report stops
 * listing the row as unpaid. A row that is already marked is left alone,
 * so re-running a partly finished payout cannot rewrite history.
 */
export async function POST(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const db = await getDb();
  const me = db.accounts.find((a) => a.id === id);
  if (!me) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (me.role !== "admin")
    return NextResponse.json({ error: "Admins only." }, { status: 403 });

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (body.action === "sweep") return NextResponse.json(await sweep());
  if (body.action === "reconcile") return NextResponse.json(await reconcile());

  const paid = body.paid ?? [];
  if (paid.length === 0 || paid.length > 500)
    return NextResponse.json({ error: "Send between 1 and 500 rows." }, { status: 400 });

  const result = await mutateDb((store) => {
    const marked: string[] = [];
    const skipped: string[] = [];
    const unknown: string[] = [];
    for (const row of paid) {
      const rec = store.qrsBonuses[row.accountId];
      if (!rec) {
        unknown.push(row.accountId);
      } else if (rec.paidOnChainAt) {
        skipped.push(row.accountId);
      } else if (typeof row.txHash === "string" && /^[0-9a-f]{64}$/i.test(row.txHash)) {
        rec.paidOnChainAt = row.at ?? Date.now();
        rec.txHash = row.txHash;
        marked.push(row.accountId);
      } else {
        unknown.push(row.accountId);
      }
    }
    return { marked: marked.length, alreadyPaid: skipped.length, rejected: unknown.length };
  });
  return NextResponse.json(result);
}
