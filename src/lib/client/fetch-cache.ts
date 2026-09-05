"use client";

/**
 * A tiny shared GET cache for the app's JSON endpoints.
 *
 * Before this, every page mounted its own hooks, so moving from Home to
 * a token page refetched the portfolio, the token registry and the
 * ledger from scratch — and each of those fans out to Horizon. Three
 * pages open in a session meant three full round trips for identical
 * data.
 *
 * Now every reader of a URL shares one entry:
 *   - a response is reused while it is younger than `ttl`
 *   - concurrent readers join the SAME in-flight request instead of
 *     starting their own
 *   - a failed refresh keeps the last good data, because a busy Horizon
 *     must never read as "you have nothing" (§6.4)
 */

export interface CacheEntry<T = unknown> {
  data: T | null;
  error: string | null;
  /** HTTP status of the last failure; 0 = network error */
  status: number | null;
  /** When `data` was last successfully loaded */
  at: number;
  loading: boolean;
}

const EMPTY: CacheEntry = { data: null, error: null, status: null, at: 0, loading: true };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Map<string, Set<() => void>>();

function emit(url: string) {
  for (const fn of listeners.get(url) ?? []) fn();
}

function set(url: string, patch: Partial<CacheEntry>) {
  const prev = cache.get(url) ?? EMPTY;
  // A new object each time keeps useSyncExternalStore snapshots honest.
  cache.set(url, { ...prev, ...patch });
  emit(url);
}

export function peek<T>(url: string): CacheEntry<T> {
  return (cache.get(url) as CacheEntry<T>) ?? (EMPTY as CacheEntry<T>);
}

export function subscribe(url: string, fn: () => void): () => void {
  let set = listeners.get(url);
  if (!set) {
    set = new Set();
    listeners.set(url, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(url);
  };
}

/**
 * Load `url` unless a fresh copy is already cached. Concurrent callers
 * share one request. `force` bypasses the freshness check (used by
 * refresh after a mutation).
 */
export function load(url: string, ttl: number, force = false): Promise<void> {
  const existing = inflight.get(url);
  if (existing) return existing;

  const entry = cache.get(url);
  if (!force && entry && entry.data !== null && Date.now() - entry.at < ttl) {
    return Promise.resolve();
  }

  if (!entry) set(url, { loading: true });

  const run = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        let message = `Request failed (${res.status})`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          /* no body */
        }
        // Keep whatever we had: a 503 is "unknown", not "empty".
        set(url, { error: message, status: res.status, loading: false });
        return;
      }
      set(url, { data: await res.json(), error: null, status: null, at: Date.now(), loading: false });
    } catch (e) {
      set(url, {
        error: e instanceof Error ? e.message : "Network error",
        status: 0,
        loading: false,
      });
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, run);
  return run;
}

/** Drop cached data for URLs whose path starts with `prefix`. */
export function invalidate(prefix: string) {
  for (const url of cache.keys()) {
    if (url.startsWith(prefix)) {
      set(url, { at: 0 });
    }
  }
}

/** Wipe everything — used on sign-out so the next member starts clean. */
export function clearCache() {
  const urls = [...cache.keys()];
  cache.clear();
  inflight.clear();
  for (const url of urls) emit(url);
}
