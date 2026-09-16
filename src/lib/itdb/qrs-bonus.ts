import { QRS_TIERS } from "./config";

/**
 * The QRS 25% Milestone Bonus.
 *
 * ONE RULE: hold at least Tier 1 (10,000 QRS) and you get 25% of your
 * balance. Tony settled this on 2026-09-16 — every wallet holding QRS
 * at Tier 1 minimum, existing holder or new. Below Tier 1 pays nothing,
 * and the member is shown how far short they are.
 *
 * The category below is kept only to label how a member arrived, since
 * it is already written into awards made before the rule was settled.
 * It no longer decides who is paid.
 *
 * ELIGIBILITY IS A PROPERTY OF THE WALLET, NOT THE ACCOUNT. The app can
 * only award members it knows about, so it is not the authority on who
 * qualifies — `scripts/qrs-holders-payout.mjs` reads every holder from
 * Horizon and is what the payout actually runs from.
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
 * Whether the bonus is payable: Tier 1 or above, for everyone. The
 * category is deliberately not consulted.
 */
export function qrsBonusPayable(balance: number): boolean {
  return balance >= QRS_BONUS_TIER1_MIN;
}
