import { EARLY_BIRD_TIER_DIVISOR } from "@/lib/itdb/vault";

/**
 * Early birds take 50% off the ITDBVAULT holding tiers.
 *
 * Halving every threshold is the same as reading the member's tier at
 * twice their holding, and doing it that way keeps the discount in one
 * expression rather than a second copy of the whole ladder.
 *
 * The result is ONLY ever passed to a tier lookup. It must never reach
 * the figure shown as the member's balance, or the app would tell them
 * they hold twice what they do.
 */
export function vaultTierBalance(balance: number, earlyBird: boolean): number {
  return earlyBird ? balance * EARLY_BIRD_TIER_DIVISOR : balance;
}

/**
 * How many tokens are still needed for a tier, in REAL tokens.
 *
 * The threshold is compared against the discounted holding, so the
 * shortfall has to be scaled back down — otherwise an early bird is
 * told to buy twice what would actually get them there.
 */
export function vaultTierNeeded(min: number, balance: number, tierBalance: number): number {
  const boost = balance > 0 ? tierBalance / balance : 1;
  return Math.max((min - tierBalance) / boost, 0);
}
