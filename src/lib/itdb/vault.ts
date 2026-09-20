import { VAULT_PINS } from "./world-map";

/**
 * ITDBVAULT — the vault network.
 *
 * 500 vaults across ten cities. Available is 500 minus the claims on
 * record, so the number on screen is derived rather than stored and
 * cannot drift from what has actually been claimed.
 */

export const TOTAL_VAULTS = 500;

export const VAULT_CITIES = VAULT_PINS;

/** Cities are assigned round-robin, so every location fills evenly. */
export function cityForClaim(index: number): string {
  return VAULT_PINS[index % VAULT_PINS.length].city;
}
