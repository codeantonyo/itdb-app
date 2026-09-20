import { EARLY_BIRD_TIER_DIVISOR, isEarlyBird } from "@/lib/itdb/vault";
import type { VaultClaimRecord } from "./db";

/**
 * Vault early birds take 50% off the holding tiers.
 *
 * Halving every threshold is the same as reading the member's tier at
 * twice their balance, and doing it that way keeps the discount in one
 * expression instead of a second copy of all three ladders.
 *
 * The result is ONLY ever passed as a tier lookup. It must not reach
 * the balance shown to the member, or the app would tell them they hold
 * twice what they do.
 */
export function vaultTierBalance(balance: number, claim: VaultClaimRecord | undefined): number {
  if (!claim || !isEarlyBird(claim.at)) return balance;
  return balance * EARLY_BIRD_TIER_DIVISOR;
}

/**
 * How many tokens a member still needs for a tier, in REAL tokens.
 *
 * The threshold is compared against the discounted balance, so the
 * shortfall has to be scaled back down — otherwise an early bird is
 * told to buy twice what would actually get them there.
 */
export function vaultTierNeeded(min: number, balance: number, tierBalance: number): number {
  const boost = balance > 0 ? tierBalance / balance : 1;
  return Math.max((min - tierBalance) / boost, 0);
}
