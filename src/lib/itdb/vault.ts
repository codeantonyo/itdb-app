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

/** The 500 vaults are split evenly, so each city holds this many. */
export const VAULTS_PER_CITY = TOTAL_VAULTS / VAULT_PINS.length;

export const VAULT_CITY_NAMES = VAULT_PINS.map((p) => p.city);

/** Members pick their city; this is only the fallback when none is sent. */
export function cityForClaim(index: number): string {
  return VAULT_PINS[index % VAULT_PINS.length].city;
}

/** Remaining vaults per city, from the claims on record. */
export function remainingByCity(taken: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    VAULT_CITY_NAMES.map((c) => [c, Math.max(VAULTS_PER_CITY - (taken[c] ?? 0), 0)]),
  );
}
