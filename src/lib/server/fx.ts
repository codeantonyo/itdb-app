import { CURRENCY_CODES } from "@/lib/wallet/currencies";

/**
 * FX rates for every conversion the app makes — card currencies, the
 * ITDB reserve basket, ITDBONE / QRS daily yield, and the QRS metals.
 * Follows NEWBANK's `getFx()` pattern: everything is "USD per 1 unit",
 * so any pair is a single division, and every feed carries a fallback
 * so a transfer never breaks because a price site is down.
 *
 * Sources (all free, no key):
 *   fiat    — open.er-api.com (base USD), hourly
 *   crypto  — CoinGecko simple/price, 5 min
 *   metals  — gold-api.com for gold / silver / platinum / palladium
 *             (USD per troy oz), 10 min. Rhodium, iridium, osmium and
 *             tungsten have no free live feed and use a REFERENCE table
 *             — the UI is told which is which via `sourceOf`.
 */

/** Fiat units per 1 USD (fallback if the live feed is down). */
const FALLBACK_PER_USD: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  AUD: 1.52,
  CAD: 1.36,
  CHF: 0.88,
  JPY: 150,
};

/** CoinGecko ids for every crypto the tier tables reference. */
const CRYPTO_IDS: Record<string, string> = {
  XLM: "stellar",
  XRP: "ripple",
  XDC: "xdce-crowd-sale",
  QNT: "quant-network",
  HBAR: "hedera-hashgraph",
  ADA: "cardano",
  SOL: "solana",
  DOT: "polkadot",
  MATIC: "matic-network",
  LINK: "chainlink",
  // Airdrop assets (src/lib/itdb/airdrop.ts)
  ALGO: "algorand",
  TON: "the-open-network",
  MIOTA: "iota",
};

/** USD per unit, used only when the live feed is unreachable. */
const FALLBACK_CRYPTO_USD: Record<string, number> = {
  XLM: 0.18,
  XRP: 1.45,
  XDC: 0.028,
  QNT: 65,
  HBAR: 0.079,
  ADA: 0.22,
  SOL: 104,
  DOT: 0.89,
  MATIC: 0.126,
  LINK: 11.8,
  ALGO: 0.094,
  TON: 1.43,
  MIOTA: 0.04,
};

export type Metal =
  | "gold" | "silver" | "platinum" | "palladium"
  | "rhodium" | "iridium" | "osmium" | "tungsten";

const TROY_OZ_PER_KG = 32.1507;

/** gold-api.com symbols for the four exchange-traded metals. */
const LIVE_METALS: Partial<Record<Metal, string>> = {
  gold: "XAU",
  silver: "XAG",
  platinum: "XPT",
  palladium: "XPD",
};

/**
 * Reference USD per kg. Used as the fallback for the four live metals
 * and as the ONLY source for the rest — those are flagged "reference"
 * to the member, never presented as a live quote.
 */
const REFERENCE_METAL_USD_PER_KG: Record<Metal, number> = {
  gold: 4_478 * TROY_OZ_PER_KG,
  silver: 67 * TROY_OZ_PER_KG,
  platinum: 1_823 * TROY_OZ_PER_KG,
  palladium: 1_437 * TROY_OZ_PER_KG,
  rhodium: 5_400 * TROY_OZ_PER_KG,
  iridium: 4_400 * TROY_OZ_PER_KG,
  osmium: 400 * TROY_OZ_PER_KG,
  tungsten: 45,
};

export type PriceSource = "live" | "reference";

interface RateCache {
  at: number;
  /** fiat units per 1 USD */
  perUsd: Record<string, number>;
  /** USD per 1 unit of crypto */
  cryptoUsd: Record<string, number>;
  /** USD per kg */
  metalUsdPerKg: Record<Metal, number>;
  sources: Record<string, PriceSource>;
}

const holder = globalThis as typeof globalThis & { __itdbFx?: RateCache };
const TTL_MS = 5 * 60 * 1000;

async function loadRates(): Promise<RateCache> {
  if (holder.__itdbFx && Date.now() - holder.__itdbFx.at < TTL_MS) {
    return holder.__itdbFx;
  }

  const sources: Record<string, PriceSource> = {};

  // ---- fiat ----
  const perUsd = { ...FALLBACK_PER_USD };
  for (const code of Object.keys(perUsd)) sources[code] = "reference";
  sources.USD = "live";
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = (await res.json()) as { rates?: Record<string, number> };
      if (data.rates) {
        for (const code of CURRENCY_CODES) {
          if (code !== "XLM" && typeof data.rates[code] === "number") {
            perUsd[code] = data.rates[code];
            sources[code] = "live";
          }
        }
      }
    }
  } catch {
    /* keep fallback */
  }

  // ---- crypto ----
  const cryptoUsd = { ...FALLBACK_CRYPTO_USD };
  for (const code of Object.keys(cryptoUsd)) sources[code] = "reference";
  try {
    const ids = Object.values(CRYPTO_IDS).join(",");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { next: { revalidate: 300 } },
    );
    if (res.ok) {
      const data = (await res.json()) as Record<string, { usd?: number }>;
      for (const [code, id] of Object.entries(CRYPTO_IDS)) {
        const usd = data[id]?.usd;
        if (typeof usd === "number" && usd > 0) {
          cryptoUsd[code] = usd;
          sources[code] = "live";
        }
      }
    }
  } catch {
    /* keep fallback */
  }

  // ---- metals ----
  const metalUsdPerKg = { ...REFERENCE_METAL_USD_PER_KG };
  for (const metal of Object.keys(metalUsdPerKg)) sources[`metal:${metal}`] = "reference";
  await Promise.all(
    (Object.entries(LIVE_METALS) as [Metal, string][]).map(async ([metal, symbol]) => {
      try {
        const res = await fetch(`https://api.gold-api.com/price/${symbol}`, {
          next: { revalidate: 600 },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { price?: number };
        if (typeof data.price === "number" && data.price > 0) {
          metalUsdPerKg[metal] = data.price * TROY_OZ_PER_KG;
          sources[`metal:${metal}`] = "live";
        }
      } catch {
        /* keep reference */
      }
    }),
  );

  const cache: RateCache = { at: Date.now(), perUsd, cryptoUsd, metalUsdPerKg, sources };
  holder.__itdbFx = cache;
  return cache;
}

/** USD value of one unit of `code` (fiat or crypto). */
function usdPerUnit(rates: RateCache, code: string): number {
  const crypto = rates.cryptoUsd[code];
  if (crypto && crypto > 0) return crypto;
  const perUsd = rates.perUsd[code];
  return perUsd && perUsd > 0 ? 1 / perUsd : 1;
}

export interface FxRates {
  /** Convert an amount between two supported currencies. */
  convert: (amount: number, from: string, to: string) => number;
  /** USD per 1 unit of `code` (fiat or crypto). */
  usdOf: (code: string) => number;
  /** USD per kilogram of a metal. */
  metalUsdPerKg: (metal: Metal) => number;
  /** USD per troy ounce — the conventional quote unit for bullion. */
  metalUsdPerOz: (metal: Metal) => number;
  /** Whether a figure came from a live feed or the reference table. */
  sourceOf: (code: string) => PriceSource;
  metalSourceOf: (metal: Metal) => PriceSource;
  xlmUsd: number;
  xrpUsd: number;
  at: number;
}

export async function getFx(): Promise<FxRates> {
  const rates = await loadRates();
  return {
    convert: (amount, from, to) => {
      if (from === to) return amount;
      const usd = amount * usdPerUnit(rates, from);
      return usd / usdPerUnit(rates, to);
    },
    usdOf: (code) => usdPerUnit(rates, code),
    metalUsdPerKg: (metal) => rates.metalUsdPerKg[metal],
    metalUsdPerOz: (metal) => rates.metalUsdPerKg[metal] / TROY_OZ_PER_KG,
    sourceOf: (code) => rates.sources[code] ?? "reference",
    metalSourceOf: (metal) => rates.sources[`metal:${metal}`] ?? "reference",
    xlmUsd: rates.cryptoUsd.XLM,
    xrpUsd: rates.cryptoUsd.XRP,
    at: rates.at,
  };
}
