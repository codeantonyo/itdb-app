/**
 * MEGA AIRDROP — exclusive to ITDBVAULT holders, released at the vault
 * sale's 50% milestone.
 *
 * Shown to everyone; only a wallet holding ITDBVAULT can claim. Like the
 * rest of the app it is SIMULATED: a claim is recorded against the
 * member, and nothing moves on chain.
 */

export const MEGA_TITLE = "MEGA AIRDROP";
export const MEGA_BANNER = "EXCLUSIVE: Only ITDB Vault Holders are eligible for this Mega Airdrop.";
export const MEGA_SUCCESS =
  "Congratulations! Your 50 TONNES of assets are being allocated to your vault. Check your Portfolio.";
/** The vault-sale milestone that releases it */
export const MEGA_MILESTONE_PCT = 50;

export interface MegaLine {
  code: string;
  name: string;
  amount: number;
  unit: string;
}

export interface MegaGroup {
  title: string;
  lines: MegaLine[];
}

const metal = (name: string, amount: number): MegaLine => ({ code: name.toUpperCase(), name, amount, unit: "oz" });

export const MEGA_ALLOCATION: MegaGroup[] = [
  {
    title: "Crypto allocation",
    lines: [
      { code: "XLM", name: "Stellar Lumens", amount: 150_000, unit: "XLM" },
      { code: "XRP", name: "Ripple", amount: 100_000, unit: "XRP" },
      { code: "XDC", name: "XDC Network", amount: 50_000, unit: "XDC" },
      { code: "ALGO", name: "Algorand", amount: 50_000, unit: "ALGO" },
      { code: "IOTA", name: "MIOTA", amount: 30_000, unit: "IOTA" },
      { code: "SOL", name: "Solana", amount: 20_000, unit: "SOL" },
      { code: "MATIC", name: "Polygon", amount: 20_000, unit: "MATIC" },
    ],
  },
  {
    title: "Precious metals allocation",
    lines: [
      metal("Gold", 28_200),
      metal("Silver", 352_700),
      metal("Platinum", 141_100),
      metal("Palladium", 70_500),
      metal("Rhodium", 28_200),
      metal("Iridium", 14_100),
      metal("Osmium", 8_800),
      metal("Ruthenium", 14_100),
    ],
  },
  {
    title: "Industrial & tech metals allocation",
    lines: [
      metal("Lithium", 35_300),
      metal("Cobalt", 88_200),
      metal("Titanium", 211_600),
      metal("Tungsten", 88_200),
      metal("Scandium", 21_200),
      metal("Copper", 176_400),
      metal("Nickel", 88_200),
      metal("Zinc", 52_900),
      metal("Tin", 28_200),
      metal("Chromium", 28_200),
      metal("Manganese", 42_300),
      metal("Rhenium", 3_500),
    ],
  },
];
