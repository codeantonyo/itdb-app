/**
 * "When did this wallet first acquire asset X?" — the accrual clock for
 * ITDBONE and QRS daily yield.
 *
 * Ported from NEWBANK, which learned two things the hard way:
 *  1. Trade records carry `ledger_close_time`, not `created_at`.
 *  2. A plain ascending scan from genesis with a small page budget never
 *     reaches the acquisition on high-activity accounts. We ALSO scan
 *     descending and take the earliest event found, then combine with a
 *     light ascending pass. The minimum across both is the answer.
 *
 * And one thing that matters for §6.4: a scan that comes back empty
 * because Horizon rate-limited us is NOT "never acquired". A stale
 * persisted value beats null, and a wallet that provably holds the
 * token always gets a start date.
 */

import { getAcquired, saveAcquired } from "@/lib/server/db";
import { horizonFetch } from "./horizon-fetch";

const HORIZON = "https://horizon.stellar.org";
const ASC_PAGES = 3;
const DESC_PAGES = 12;

/** Recompute a persisted result at most this often (it's near-immutable). */
const PERSIST_FRESH_MS = 24 * 60 * 60 * 1000;

const sinceCache = new Map<string, { at: number; value: number | null }>();
const SINCE_TTL = 60 * 60 * 1000;

type Rec = Record<string, unknown>;

function timeOf(r: Rec): number {
  // Payments use created_at; trades use ledger_close_time.
  const t = (r.created_at ?? r.ledger_close_time) as string | undefined;
  return t ? new Date(t).getTime() : NaN;
}

async function scan(
  address: string,
  kind: "payments" | "trades",
  match: (r: Rec) => boolean,
  order: "asc" | "desc",
  maxPages: number,
): Promise<number | null> {
  let next: string | null = `${HORIZON}/accounts/${address}/${kind}?order=${order}&limit=200`;
  let min: number | null = null;
  for (let page = 0; page < maxPages && next; page++) {
    let res: Response;
    try {
      res = await horizonFetch(next, { next: { revalidate: 3600 } });
    } catch {
      break;
    }
    if (!res.ok) break;
    const data = (await res.json()) as {
      _embedded?: { records?: Rec[] };
      _links?: { next?: { href?: string } };
    };
    const records = data._embedded?.records ?? [];
    for (const r of records) {
      if (match(r)) {
        const t = timeOf(r);
        if (!Number.isNaN(t) && (min === null || t < min)) min = t;
        if (order === "asc") return min; // first ascending match is earliest
      }
    }
    next = records.length > 0 ? (data._links?.next?.href ?? null) : null;
  }
  return min;
}

export interface AcquiredOpts {
  /**
   * True when the caller has already established that this wallet holds
   * a positive balance. Guarantees a non-null answer: if the history
   * scan cannot date the acquisition, the first time we observe the
   * holding is stamped and reused from then on.
   */
  holding?: boolean;
}

/** Earliest ms-epoch this wallet received or traded the asset (null = never). */
export async function firstAcquired(
  address: string,
  code: string,
  issuer: string,
  opts: AcquiredOpts = {},
): Promise<number | null> {
  const key = `${address}:${code}:${issuer}`;
  const cached = sinceCache.get(key);
  if (cached && Date.now() - cached.at < SINCE_TTL) return cached.value;

  let stored: { value: number | null; at: number } | undefined;
  try {
    stored = await getAcquired(key);
    if (stored && Date.now() - stored.at < PERSIST_FRESH_MS) {
      sinceCache.set(key, { at: Date.now(), value: stored.value });
      return stored.value;
    }
  } catch {
    /* DB unavailable — fall through to a live scan */
  }

  const isAsset = (c?: unknown, i?: unknown) => c === code && i === issuer;
  const payMatch = (r: Rec) =>
    (r.type === "payment" ||
      (typeof r.type === "string" && r.type.startsWith("path_payment"))) &&
    r.to === address &&
    isAsset(r.asset_code, r.asset_issuer);
  const trdMatch = (r: Rec) =>
    isAsset(r.base_asset_code, r.base_asset_issuer) ||
    isAsset(r.counter_asset_code, r.counter_asset_issuer);

  const results = await Promise.all([
    scan(address, "payments", payMatch, "asc", ASC_PAGES),
    scan(address, "trades", trdMatch, "asc", ASC_PAGES),
    scan(address, "payments", payMatch, "desc", DESC_PAGES),
    scan(address, "trades", trdMatch, "desc", DESC_PAGES),
  ]);
  const candidates = results.filter((x): x is number => x !== null);
  const value =
    candidates.length > 0 ? Math.min(...candidates) : (stored?.value ?? null);

  if (value === null && opts.holding) {
    const seen = await firstSeen(key);
    sinceCache.set(key, { at: Date.now(), value: seen });
    return seen;
  }

  sinceCache.set(key, { at: Date.now(), value });
  // Persist only a definitive hit; a transient all-null (Horizon hiccup)
  // shouldn't be cached as "never acquired".
  if (value !== null) saveAcquired(key, value);
  return value;
}

async function firstSeen(key: string): Promise<number> {
  const seenKey = `${key}#seen`;
  try {
    const stored = await getAcquired(seenKey);
    if (stored?.value != null) return stored.value;
  } catch {
    /* DB unavailable — fall through and stamp now */
  }
  const now = Date.now();
  saveAcquired(seenKey, now);
  return now;
}
