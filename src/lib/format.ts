/**
 * Formatting helpers for financial figures.
 *
 * Ported from NEWBANK with its "my balance didn't move" fix: compact
 * figures always carry FOUR significant digits, and every surface that
 * shows a member's own money also offers the exact figure (see
 * `formatExactCurrency` / `formatExactAmount` and the ExactFigure
 * component).
 */

/** Below this, numbers read better in full (e.g. 887,962.51). */
const COMPACT_THRESHOLD = 1_000_000;

/** Largest first — the promotion logic below depends on this order. */
const COMPACT_UNITS = [
  { value: 1e15, suffix: "Q" },
  { value: 1e12, suffix: "T" },
  { value: 1e9, suffix: "B" },
  { value: 1e6, suffix: "M" },
];

/**
 * Decimals to keep once a value has been scaled into its unit, so the
 * compact form always carries FOUR significant digits.
 *
 * A fixed 2 decimals meant the smallest visible step scaled with the
 * number itself: on a balance of 1.29B, "1.21B → 1.29B" hid an 87M
 * credit inside a rounding step, and members reasonably concluded the
 * money had gone missing. Holding significant digits constant keeps a
 * ~0.1% movement visible at every magnitude.
 */
function compactDecimals(scaled: number): number {
  const abs = Math.abs(scaled);
  if (abs >= 100) return 1; // 123.4B
  if (abs >= 10) return 2; // 12.34B
  return 3; // 1.234B
}

/** The full figure without a currency symbol — for non-USD card credits. */
export function formatExactAmount(value: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Big numbers as compact units: 853000000000 → "853.0B".
 * Returns null below the threshold so callers fall back to full digits.
 */
function toCompact(value: number, decimals?: number): string | null {
  const abs = Math.abs(value);
  if (!Number.isFinite(value) || abs < COMPACT_THRESHOLD) return null;

  let index = COMPACT_UNITS.findIndex((u) => abs >= u.value);
  if (index === -1) index = COMPACT_UNITS.length - 1;

  let unit = COMPACT_UNITS[index];
  let scaled = value / unit.value;
  let places = decimals ?? compactDecimals(scaled);

  // 999,999,999 would render as "1000.0M" — promote it to "1.000B".
  if (Math.abs(Number(scaled.toFixed(places))) >= 1000 && index > 0) {
    unit = COMPACT_UNITS[index - 1];
    scaled = value / unit.value;
    places = decimals ?? compactDecimals(scaled);
  }

  return `${scaled.toFixed(places)}${unit.suffix}`;
}

/**
 * The full, unrounded figure with thousands separators — for the places
 * where a member needs to see every digit of their own money (balance
 * detail, receipts, "you were credited X").
 */
export function formatExactCurrency(value: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatCurrency(
  value: number,
  options: { compact?: boolean; decimals?: number } = {},
): string {
  const { compact = true, decimals } = options;

  if (compact) {
    const short = toCompact(value);
    if (short) return value < 0 ? `-$${short.slice(1)}` : `$${short}`;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals ?? 2,
    maximumFractionDigits: decimals ?? 2,
  }).format(value);
}

export function formatAmount(
  value: number,
  maxDecimals = 4,
  options: { compact?: boolean } = {},
): string {
  const { compact = true } = options;

  if (compact) {
    const short = toCompact(value);
    if (short) return short;
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(value);
}

/**
 * Token amounts with adaptive precision — whole tokens read clean,
 * dust payments (e.g. 0.0000001 XLM) never collapse to "0", and huge
 * holdings compact to 1.25M / 853.0B.
 */
export function formatTokenAmount(value: number): string {
  const short = toCompact(value);
  if (short) return short;

  const abs = Math.abs(value);
  const decimals = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 7;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Small-unit prices (a token worth $0.0042) keep their leading digits. */
export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const decimals = abs >= 1 ? 2 : abs >= 0.01 ? 4 : abs >= 0.0001 ? 6 : 8;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercent(value: number, signed = true): string {
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatSignedCurrency(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatCurrency(Math.abs(value))}`;
}

/** Kilograms with tonnes for the big reserve figures: 2,000 kg / 1,250 t. */
export function formatKg(kg: number): string {
  if (kg >= 1_000_000) return `${formatAmount(kg / 1000, 1)} t`;
  if (kg >= 10_000) return `${formatAmount(kg / 1000, 2)} t`;
  return `${formatAmount(kg, 2)} kg`;
}
