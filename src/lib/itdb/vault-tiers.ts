/**
 * ITDBVAULT holding tiers — ten of them, 2,000 to 1,000,000 tokens.
 *
 * Tier 1 opens at exactly one vault's allocation (2,000 tokens) and
 * Tier 10 at the whole supply (1,000,000), which is the same arithmetic
 * the sale is built on: 100,000 XLM at 0.1 XLM a token over 500 vaults.
 *
 * Every figure is SIMULATED. Nothing here allocates metal, moves a
 * token, or burns anything on chain.
 */

export interface MetalReward {
  metal: string;
  grams: number;
}

export interface TokenReward {
  code: string;
  metal: string;
  amount: number;
}

export interface VaultTier {
  tier: number;
  medal: string;
  /** Entry threshold in ITDBVAULT. The top is derived — see vaultTierRange. */
  min: number;
  weekly: { USD: number; EUR: number; GBP: number };
  metals: MetalReward[];
  tokens: TokenReward[];
  /** Vaults owned at this tier, in any cities */
  vaults: number;
  /** How many of the twenty metals the vault stores */
  metalsStored: number;
  benefits: string[];
  /** Burn on every transaction, as a percentage */
  burnPct: number;
  /** Indicative total monthly value, USD */
  estMonthlyUsd: number;
}

const t = (
  tier: number,
  medal: string,
  min: number,
  weekly: [number, number, number],
  metals: [string, number][],
  tokens: [string, number][],
  metalsStored: number,
  benefits: string[],
  burnPct: number,
  estMonthlyUsd: number,
): VaultTier => ({
  tier,
  medal,
  min,
  weekly: { USD: weekly[0], EUR: weekly[1], GBP: weekly[2] },
  metals: metals.map(([metal, grams]) => ({ metal, grams })),
  tokens: tokens.map(([code, amount]) => ({ code, metal: TOKEN_METAL[code], amount })),
  vaults: tier,
  metalsStored,
  benefits,
  burnPct,
  estMonthlyUsd,
});

/** Which metal stands behind each reward token. */
const TOKEN_METAL: Record<string, string> = {
  XLM: "Silver",
  XRP: "Gold",
  XDC: "Copper",
  ALGO: "Palladium",
  IOTA: "Iridium",
};

export const VAULT_TIERS: VaultTier[] = [
  t(1, "🥉", 2_000,
    [25_000, 20_000, 15_000],
    [["Gold", 500], ["Silver", 5_000], ["Platinum", 2_500], ["Palladium", 1_250], ["Rhodium", 500]],
    [["XLM", 50_000], ["XRP", 25_000], ["XDC", 15_000], ["ALGO", 5_000], ["IOTA", 2_500]],
    5, ["Basic insurance", "Standard certificate"], 5, 650_000),

  t(2, "🥈", 4_000,
    [50_000, 40_000, 30_000],
    [["Gold", 1_000], ["Silver", 10_000], ["Platinum", 5_000], ["Palladium", 2_500], ["Rhodium", 1_250], ["Iridium", 500]],
    [["XLM", 100_000], ["XRP", 50_000], ["XDC", 30_000], ["ALGO", 10_000], ["IOTA", 5_000]],
    6, ["Full insurance", "Silver certificate"], 5, 1_100_000),

  t(3, "🥇", 8_000,
    [125_000, 100_000, 75_000],
    [["Gold", 2_500], ["Silver", 25_000], ["Platinum", 12_500], ["Palladium", 5_000], ["Rhodium", 2_500], ["Iridium", 1_250], ["Osmium", 500]],
    [["XLM", 250_000], ["XRP", 125_000], ["XDC", 75_000], ["ALGO", 25_000], ["IOTA", 12_500]],
    7, ["Full insurance", "Gold certificate", "Generational transfer"], 10, 2_350_000),

  t(4, "💎", 16_000,
    [250_000, 200_000, 150_000],
    [["Gold", 5_000], ["Silver", 50_000], ["Platinum", 25_000], ["Palladium", 12_500], ["Rhodium", 5_000], ["Iridium", 2_500], ["Osmium", 1_250]],
    [["XLM", 500_000], ["XRP", 250_000], ["XDC", 150_000], ["ALGO", 50_000], ["IOTA", 25_000]],
    8, ["Full insurance + audit", "Gold certificate", "Generational transfer", "Priority banking"], 10, 4_300_000),

  t(5, "👑", 32_000,
    [500_000, 400_000, 300_000],
    [["Gold", 12_500], ["Silver", 125_000], ["Platinum", 50_000], ["Palladium", 25_000], ["Rhodium", 12_500], ["Iridium", 5_000], ["Osmium", 2_500]],
    [["XLM", 1_250_000], ["XRP", 625_000], ["XDC", 375_000], ["ALGO", 125_000], ["IOTA", 62_500]],
    9, ["Full insurance + audit", "Gold certificate", "Generational transfer", "Priority banking", "Preferred vault number"], 15, 9_750_000),

  t(6, "🚀", 64_000,
    [1_250_000, 1_000_000, 750_000],
    [["Gold", 25_000], ["Silver", 250_000], ["Platinum", 125_000], ["Palladium", 50_000], ["Rhodium", 25_000], ["Iridium", 12_500], ["Osmium", 5_000]],
    [["XLM", 2_500_000], ["XRP", 1_250_000], ["XDC", 750_000], ["ALGO", 250_000], ["IOTA", 125_000]],
    10, ["Full insurance + private audit", "Gold seal certificate", "Generational transfer", "Priority banking + VIP support", "Preferred vault number"], 15, 19_350_000),

  t(7, "⭐️", 128_000,
    [2_500_000, 2_000_000, 1_500_000],
    [["Gold", 50_000], ["Silver", 500_000], ["Platinum", 250_000], ["Palladium", 125_000], ["Rhodium", 50_000], ["Iridium", 25_000], ["Osmium", 12_500]],
    [["XLM", 5_000_000], ["XRP", 2_500_000], ["XDC", 1_500_000], ["ALGO", 500_000], ["IOTA", 250_000]],
    12, ["Full insurance + private audit", "Gold seal certificate", "Generational transfer", "Priority banking + VIP support", "Preferred vault number", "Personal relationship manager"], 20, 38_600_000),

  t(8, "💛", 256_000,
    [5_000_000, 4_000_000, 3_000_000],
    [["Gold", 125_000], ["Silver", 1_250_000], ["Platinum", 500_000], ["Palladium", 250_000], ["Rhodium", 125_000], ["Iridium", 50_000], ["Osmium", 25_000]],
    [["XLM", 12_500_000], ["XRP", 6_250_000], ["XDC", 3_750_000], ["ALGO", 1_250_000], ["IOTA", 625_000]],
    15, ["Full insurance + quarterly audit", "Gold seal certificate", "Generational transfer", "Priority banking + VIP support", "Preferred vault number", "Personal relationship manager"], 20, 92_500_000),

  t(9, "💎", 512_000,
    [12_500_000, 10_000_000, 7_500_000],
    [["Gold", 250_000], ["Silver", 2_500_000], ["Platinum", 1_250_000], ["Palladium", 500_000], ["Rhodium", 250_000], ["Iridium", 125_000], ["Osmium", 50_000]],
    [["XLM", 25_000_000], ["XRP", 12_500_000], ["XDC", 7_500_000], ["ALGO", 2_500_000], ["IOTA", 1_250_000]],
    18, ["Full insurance + quarterly audit", "Gold seal certificate", "Generational transfer", "Priority banking + VIP support", "Preferred vault number", "Personal relationship manager", "Seat on the ITDB Vault Council"], 25, 185_000_000),

  t(10, "💥", 1_000_000,
    [25_000_000, 20_000_000, 15_000_000],
    [["Gold", 500_000], ["Silver", 5_000_000], ["Platinum", 2_500_000], ["Palladium", 1_250_000], ["Rhodium", 500_000], ["Iridium", 250_000], ["Osmium", 125_000]],
    [["XLM", 50_000_000], ["XRP", 25_000_000], ["XDC", 15_000_000], ["ALGO", 5_000_000], ["IOTA", 2_500_000]],
    20, ["All 20 metals stored", "Full insurance + quarterly audit", "Gold seal certificate", "Generational transfer", "Priority banking + VIP support", "Preferred vault number", "Personal relationship manager", "Seat on the ITDB Vault Council", "Private events access", "Personal wealth manager"], 25, 370_000_000),
];

/**
 * A tier's span, derived from the thresholds rather than stored, so a
 * second column can never disagree with the bar that actually applies.
 */
export function vaultTierRange(tier: VaultTier): { min: number; max: number | null } {
  const above = VAULT_TIERS.filter((x) => x.tier > tier.tier).map((x) => x.min);
  return { min: tier.min, max: above.length > 0 ? Math.min(...above) - 1 : null };
}

/** The highest tier a holding clears. */
export function vaultTierFor(balance: number): VaultTier | null {
  if (!(balance > 0)) return null;
  return [...VAULT_TIERS].reverse().find((x) => balance >= x.min) ?? null;
}

/** The next tier up, by threshold. */
export function nextVaultTier(balance: number): VaultTier | null {
  return VAULT_TIERS.filter((x) => x.min > balance).sort((a, b) => a.min - b.min)[0] ?? null;
}
