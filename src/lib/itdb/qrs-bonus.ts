import { QRS_TIERS } from "./config";

/**
 * The QRS 25% Milestone Bonus.
 *
 * Two categories with different rules:
 *
 *   EXISTING holders — held QRS before the unlock. They get 25% of their
 *   balance straight away, at any size, tier or none.
 *
 *   NEW holders — acquired QRS after the unlock. They get 25% only once
 *   their balance reaches Tier 1, and nothing before that.
 *
 * Which category a member falls into is decided by WHEN THEY FIRST
 * ACQUIRED QRS ON CHAIN, not by when the app happened to look at them.
 * A balance snapshot would have been wrong for anyone who did not open
 * the app on unlock day; the acquisition date is a fact about the chain
 * and reads the same whenever it is asked.
 *
 * THE BONUS IS RECORDED, NOT MINTED. Awarding writes an entitlement into
 * the ITDB ledger and never signs or submits a Stellar transaction, so
 * the member's on-chain QRS balance is unchanged until the issuer
 * actually pays out. The UI says so, and the admin payout export lists
 * exactly what is owed.
 */

export const QRS_BONUS_PCT = 25;

/**
 * When the milestone unlocked. Anyone holding QRS before this instant is
 * an existing holder; anyone who first acquires it after is a new one.
 */
export const QRS_BONUS_UNLOCK_AT = Date.UTC(2026, 8, 16, 0, 0, 0);

/** New holders must reach Tier 1 before the bonus pays. */
export const QRS_BONUS_TIER1_MIN = QRS_TIERS[0].min;

export type QrsBonusCategory = "existing" | "new";

/** Existing or new, from the on-chain first-acquired timestamp. */
export function qrsBonusCategory(firstAcquiredAt: number): QrsBonusCategory {
  return firstAcquiredAt < QRS_BONUS_UNLOCK_AT ? "existing" : "new";
}

/** 25% of the balance the bonus is calculated against. */
export function qrsBonusAmount(balance: number): number {
  return (balance * QRS_BONUS_PCT) / 100;
}

/**
 * Whether the bonus is payable right now. Existing holders qualify on
 * any balance above zero; new holders only at Tier 1 and above.
 */
export function qrsBonusPayable(category: QrsBonusCategory, balance: number): boolean {
  if (!(balance > 0)) return false;
  return category === "existing" || balance >= QRS_BONUS_TIER1_MIN;
}
