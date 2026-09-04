import { formatAmount } from "@/lib/format";

/**
 * Currencies a card (or the main account) can be denominated in.
 * Shared by client and server. USD is the default; XLM is the native
 * ecosystem unit and always available. Keep this list curated — every
 * entry becomes an FX pair the transfer engine must resolve.
 */

export interface CurrencyDef {
  code: string;
  symbol: string;
  name: string;
  flag: string;
  /** Display decimals (JPY has none; XLM shows more precision). */
  decimals: number;
  crypto?: boolean;
}

export const CURRENCIES: CurrencyDef[] = [
  { code: "USD", symbol: "$", name: "US Dollar", flag: "🇺🇸", decimals: 2 },
  { code: "EUR", symbol: "€", name: "Euro", flag: "🇪🇺", decimals: 2 },
  { code: "GBP", symbol: "£", name: "British Pound", flag: "🇬🇧", decimals: 2 },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", flag: "🇦🇺", decimals: 2 },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", flag: "🇨🇦", decimals: 2 },
  { code: "CHF", symbol: "Fr", name: "Swiss Franc", flag: "🇨🇭", decimals: 2 },
  { code: "JPY", symbol: "¥", name: "Japanese Yen", flag: "🇯🇵", decimals: 0 },
  { code: "XLM", symbol: "✦", name: "Stellar Lumens", flag: "✦", decimals: 2, crypto: true },
];

export const DEFAULT_CURRENCY = "USD";
export const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

export function currency(code: string): CurrencyDef {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

export function isCurrency(code: string): boolean {
  return CURRENCY_CODES.includes(code);
}

/**
 * Format an amount in its currency, e.g. 1234.5 USD → "$1,234.50".
 * Large balances compact like the rest of the app (M/B/T/Q units).
 *
 * `exact` prints every digit instead of compacting. A member checking
 * whether a credit landed needs the full figure — see the tappable
 * balance on the card screen.
 */
export function formatMoney(
  amount: number,
  code: string,
  opts: { exact?: boolean } = {},
): string {
  const def = currency(code);
  const n =
    !opts.exact && Math.abs(amount) >= 1_000_000
      ? formatAmount(amount, 2)
      : new Intl.NumberFormat("en-US", {
          minimumFractionDigits: def.decimals,
          maximumFractionDigits: def.decimals,
        }).format(amount);
  return def.code === "XLM" ? `${n} XLM` : `${def.symbol}${n}`;
}
