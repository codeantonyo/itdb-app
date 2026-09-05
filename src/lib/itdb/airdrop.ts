import type { Metal } from "@/lib/server/fx";

/**
 * ITDB Airdrop — the founding distribution.
 *
 * Eligibility is deliberately strict: a member must hold ALL THREE ITDB
 * assets (ITDB, ITDBONE and QRS) at the moment they claim. Holding is
 * read from chain across every linked wallet, so it is checked against
 * what they actually hold and nothing else (brief §6.3).
 *
 * A claim locks the quantities below into the member's record. Their
 * USD value then floats with live prices, and can be withdrawn to a
 * card at the rate current when the withdrawal is made.
 */

export type AirdropKind = "crypto" | "metal" | "reserve";

export interface AirdropAsset {
  code: string;
  name: string;
  kind: AirdropKind;
  /** Quantity granted by a single claim */
  amount: number;
  /** Unit shown next to the quantity */
  unit: string;
  /** For metals: which live metal price to use */
  metal?: Metal;
  /**
   * Simulated peg: this many XLM per token. The USD value then follows
   * the live XLM rate. Used for reserve assets that have no market of
   * their own, so they still carry a value members can withdraw.
   */
  xlmPeg?: number;
}

/**
 * NOTE(tony): metals are granted in TROY OUNCES, the conventional quote
 * unit for bullion, and priced from the live per-ounce feed. If these
 * were meant as kilograms instead, change `unit` to "kg" here and swap
 * `metalUsdPerOz` for `metalUsdPerKg` in src/lib/server/airdrop.ts —
 * that is the whole change.
 */
export const AIRDROP_ASSETS: AirdropAsset[] = [
  // ---- Crypto ----
  { code: "XLM", name: "Stellar Lumens", kind: "crypto", amount: 1_500_000, unit: "XLM" },
  { code: "XRP", name: "XRP", kind: "crypto", amount: 1_500_000, unit: "XRP" },
  { code: "XDC", name: "XDC Network", kind: "crypto", amount: 1_500_000, unit: "XDC" },
  { code: "HBAR", name: "Hedera", kind: "crypto", amount: 1_500_000, unit: "HBAR" },
  { code: "QNT", name: "Quant", kind: "crypto", amount: 1_500_000, unit: "QNT" },
  { code: "ALGO", name: "Algorand", kind: "crypto", amount: 1_500_000, unit: "ALGO" },
  { code: "ADA", name: "Cardano", kind: "crypto", amount: 1_500_000, unit: "ADA" },
  { code: "TON", name: "Toncoin", kind: "crypto", amount: 1_500_000, unit: "TON" },
  { code: "MIOTA", name: "IOTA", kind: "crypto", amount: 1_500_000, unit: "MIOTA" },

  // ---- Precious metals ----
  { code: "GOLD", name: "Gold", kind: "metal", amount: 500_000, unit: "oz", metal: "gold" },
  { code: "SILVER", name: "Silver", kind: "metal", amount: 1_000_000, unit: "oz", metal: "silver" },
  { code: "PLATINUM", name: "Platinum", kind: "metal", amount: 1_500_000, unit: "oz", metal: "platinum" },
  { code: "PALLADIUM", name: "Palladium", kind: "metal", amount: 500_000, unit: "oz", metal: "palladium" },

  // ---- Special reserve assets ----
  // No public market exists for these, so each is pegged to 1 XLM and
  // its USD value follows the live XLM rate.
  { code: "RBA", name: "Reserve Bank Asset", kind: "reserve", amount: 100_000, unit: "RBA", xlmPeg: 1 },
  { code: "QFS", name: "Quantum Financial System", kind: "reserve", amount: 50_000, unit: "QFS", xlmPeg: 1 },
];

export const AIRDROP_ID = "founding-2026";

export const AIRDROP_TITLE = "Founding Airdrop";

export const AIRDROP_BLURB =
  "A one-time distribution for members holding all three ITDB assets.";

/** Codes a member must hold to be eligible. */
export const AIRDROP_REQUIRES = ["ITDB", "ITDBONE", "QRS"] as const;

export const airdropAsset = (code: string): AirdropAsset | undefined =>
  AIRDROP_ASSETS.find((a) => a.code === code);
