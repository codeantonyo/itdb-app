import {
  QRS_BONUS_PCT,
  QRS_BONUS_TIER1_MIN,
  QRS_BONUS_UNLOCK_AT,
  qrsBonusAmount,
  qrsBonusCategory,
  qrsBonusPayable,
  type QrsBonusCategory,
} from "@/lib/itdb/qrs-bonus";
import { mutateDb, type DbAccount, type QrsBonusRecord } from "./db";

/**
 * Awarding the QRS 25% Milestone Bonus.
 *
 * THIS MODULE MOVES NO TOKENS. It writes an entitlement into the ITDB
 * ledger — who is owed how much, calculated against which balance, and
 * when. It holds no issuer key, signs nothing and submits nothing to
 * Stellar; the on-chain payout is a separate, human-run step, and
 * `paidOnChainAt` / `txHash` on the record are where that gets logged.
 *
 * The award is idempotent: the record's existence is the delivered flag,
 * it is checked and written inside one mutation, and the amount is
 * recomputed from the live balance at that moment rather than trusted
 * from a caller. A member cannot be paid the bonus twice.
 */

export type QrsBonusState =
  /** Bonus owed and recorded */
  | "delivered"
  /** This wallet's bonus was already awarded on another account */
  | "duplicate"
  /** New holder below Tier 1 — nothing owed yet */
  | "locked"
  /** Holds no QRS, so there is nothing to take 25% of */
  | "none"
  /** Acquisition date unreadable right now; decide on the next look */
  | "pending";

export interface QrsBonusView {
  state: QrsBonusState;
  pct: number;
  category: QrsBonusCategory | null;
  /** Balance the 25% is (or would be) taken from */
  basisBalance: number;
  /** QRS owed, or what would be owed at today's balance */
  bonusQrs: number;
  /** Tier 1 threshold a new holder must reach */
  tier1Min: number;
  /** QRS still needed to unlock, for a new holder below Tier 1 */
  needed: number;
  awardedAt: number | null;
  paidOnChainAt: number | null;
  unlockAt: number;
}

function view(partial: Partial<QrsBonusView> & { state: QrsBonusState }): QrsBonusView {
  return {
    pct: QRS_BONUS_PCT,
    category: null,
    basisBalance: 0,
    bonusQrs: 0,
    tier1Min: QRS_BONUS_TIER1_MIN,
    needed: 0,
    awardedAt: null,
    paidOnChainAt: null,
    unlockAt: QRS_BONUS_UNLOCK_AT,
    ...partial,
  };
}

/** What to show a member, given their record and live chain figures. */
export function qrsBonusView(
  record: QrsBonusRecord | undefined,
  balance: number,
  firstAcquiredAt: number | null,
): QrsBonusView {
  if (record) {
    return view({
      state: "delivered",
      category: record.category,
      basisBalance: record.basisBalance,
      bonusQrs: record.bonusQrs,
      awardedAt: record.awardedAt,
      paidOnChainAt: record.paidOnChainAt ?? null,
    });
  }
  if (!(balance > 0)) return view({ state: "none" });
  // Unknown is not "new" (§6.4): guessing the category from a failed
  // Horizon read could drop an existing holder into the Tier 1 gate.
  if (firstAcquiredAt === null) return view({ state: "pending", basisBalance: balance });

  const category = qrsBonusCategory(firstAcquiredAt);
  if (qrsBonusPayable(category, balance)) {
    return view({ state: "delivered", category, basisBalance: balance, bonusQrs: qrsBonusAmount(balance) });
  }
  return view({
    state: "locked",
    category,
    basisBalance: balance,
    bonusQrs: qrsBonusAmount(balance),
    needed: Math.max(QRS_BONUS_TIER1_MIN - balance, 0),
  });
}

/**
 * Wallets already covered by someone else's award.
 *
 * A wallet can be registered on more than one ITDB account, and the
 * bonus belongs to the WALLET, not the account — paying per account
 * would pay a shared wallet twice. This is the guard for that.
 */
function walletsAlreadyAwarded(
  records: Record<string, QrsBonusRecord>,
  exceptAccountId: string,
): Set<string> {
  const taken = new Set<string>();
  for (const [accountId, rec] of Object.entries(records)) {
    if (accountId === exceptAccountId) continue;
    for (const w of rec.wallets) taken.add(w);
  }
  return taken;
}

/**
 * Award the bonus if it is due and not already recorded, then return the
 * member's view. Safe to call on every read: it is a no-op once the
 * record exists, and it never writes on an unknown balance.
 */
export async function ensureQrsBonus(
  account: DbAccount,
  existing: QrsBonusRecord | undefined,
  balance: number,
  firstAcquiredAt: number | null,
  qrsWallets: string[],
): Promise<QrsBonusView> {
  const preview = qrsBonusView(existing, balance, firstAcquiredAt);
  if (existing || preview.state !== "delivered" || firstAcquiredAt === null) return preview;

  return mutateDb((db) => {
    // Re-check inside the mutation: a concurrent read may have awarded it.
    const already = db.qrsBonuses[account.id];
    if (already) return qrsBonusView(already, balance, firstAcquiredAt);

    // The bonus follows the wallet. If one of these wallets was already
    // paid through another account, awarding again would pay it twice.
    const taken = walletsAlreadyAwarded(db.qrsBonuses, account.id);
    if (qrsWallets.some((w) => taken.has(w))) {
      return view({ state: "duplicate", basisBalance: balance });
    }

    const category = qrsBonusCategory(firstAcquiredAt);
    if (!qrsBonusPayable(category, balance)) {
      return qrsBonusView(undefined, balance, firstAcquiredAt);
    }

    const record: QrsBonusRecord = {
      awardedAt: Date.now(),
      category,
      basisBalance: balance,
      bonusQrs: qrsBonusAmount(balance),
      wallets: qrsWallets,
    };
    db.qrsBonuses[account.id] = record;
    return qrsBonusView(record, balance, firstAcquiredAt);
  });
}
