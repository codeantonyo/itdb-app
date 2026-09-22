import qrsGrantFile from "./qrs-bonus-grants.json";

/**
 * Manual, per-wallet grants — the one place for "give this person X".
 *
 * Everything else in the app is derived from rules and the chain. These
 * are the exceptions Tony has approved by hand, each with the date and
 * the reason, so a future reader can tell a deliberate grant from a bug.
 * A grant is keyed by WALLET and applies to whichever account holds it.
 */

export type GrantToken = "ITDB" | "ITDBONE";

/**
 * Reward multipliers on specific tokens.
 *
 * These combine with the ITDB x10 early-bird status by taking the
 * HIGHER, never the product — a wallet holding both is not meant to get
 * x50. See tokenMultiplier() in lib/itdb/early-birds.ts.
 */
export const TOKEN_MULTIPLIER_GRANTS: Record<string, Partial<Record<GrantToken, number>>> = {
  // 2026-09-22 — x5 on ITDB and ITDB ONE.
  // Neither account existed on chain when granted; the multiplier waits
  // until the wallet is funded and holds the tokens.
  GBGWVEB6HAF4M2WAISRKG2Q37W63RVZ7SGA2CY74OWD3BDOLVIAQMWWC: { ITDB: 5, ITDBONE: 5 },
  GD35RL34CVZJONWTYYBDFLM737QDRNPX5QASJJN7IEHLODRATGCHXJGG: { ITDB: 5, ITDBONE: 5 },
};

/**
 * ITDBVAULT early-bird status granted by hand, on top of the wallets
 * that bought on chain during the window (lib/itdb/vault-early-birds.ts).
 */
export const VAULT_EARLY_BIRD_GRANTS: string[] = [
  // 2026-09-22 — asked for vaults #25 (Chicago) and #55 (Miami) and was
  // given a random number. Already a chain early bird (2,100 bought
  // 2026-09-19); granted explicitly so the status cannot depend on which
  // wallet the account happens to list first.
  "GDU3DSI2LQ6YQHVATDDXLHHHWONEHUT6VVJCHLTNJU6PLMXGHQTAUFHJ",
];

/** Extra vaults granted by hand, on top of the tier and milestones. */
export const VAULT_EXTRA_GRANTS: Record<string, number> = {};

export interface QrsBonusGrant {
  /**
   * The balance the 25% is taken from. Everyone else's bonus used their
   * balance at the time of the payout run, so that is the default.
   */
  basisQrs: number;
  note: string;
}

/**
 * The QRS 25% bonus granted outside the Tier 1 rule. Kept in JSON so the
 * payout script reads the same list the app does — two copies would be
 * two answers to "who is owed".
 */
export const QRS_BONUS_GRANTS: Record<string, QrsBonusGrant> = qrsGrantFile.grants;
