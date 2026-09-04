/**
 * Horizon fetch with retry/backoff — the single choke point every
 * Horizon call goes through.
 *
 * Public Horizon rate-limits per source IP. On Vercel every request
 * shares one egress IP, so a burst of calls can earn a 429 that then
 * breaks unrelated features (balances, tier eligibility). This wrapper
 * honours `Retry-After` and backs off on 429/5xx.
 *
 * ENGINEERING WARNING (ITDB-BRIEF §6.4): a 429 is NOT "no data". Callers
 * must never read a non-OK response as "zero balance" or "no price" —
 * that reads to a member as "you are owed nothing". Use `horizonJson`,
 * which returns a three-way result (found / definitively absent /
 * unavailable) so the unavailable case has to be handled explicitly.
 */

export class HorizonUnavailableError extends Error {
  readonly status: number;
  constructor(status: number, url: string) {
    super(`Horizon unavailable (${status}) for ${url}`);
    this.name = "HorizonUnavailableError";
    this.status = status;
  }
}

export async function horizonFetch(
  url: string,
  init: RequestInit & { next?: { revalidate?: number } } = {},
  retries = 2,
): Promise<Response> {
  let lastRes: Response | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      // Network error — back off and retry.
      if (attempt === retries) throw new HorizonUnavailableError(0, url);
      await sleep(250 * 2 ** attempt + Math.random() * 100);
      continue;
    }
    // 404 and other 4xx (except 429) are definitive — return immediately.
    if (res.status !== 429 && res.status < 500) return res;
    lastRes = res;
    if (attempt === retries) break;
    const retryAfter = Number(res.headers.get("retry-after"));
    const delay =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 4000)
        : 300 * 2 ** attempt + Math.random() * 150;
    await sleep(delay);
  }
  return lastRes as Response;
}

export type HorizonResult<T> =
  | { kind: "found"; data: T }
  /** A definitive 404 — the account/resource does not exist on chain. */
  | { kind: "absent" }
  /** Rate-limited or 5xx after retries — the truth is UNKNOWN. */
  | { kind: "unavailable"; status: number };

/**
 * Fetch JSON from Horizon with the three-way outcome above. Prefer this
 * over `horizonFetch` + `res.ok` checks so the "unknown" case can never
 * be silently collapsed into "nothing".
 */
export async function horizonJson<T>(
  url: string,
  init: RequestInit & { next?: { revalidate?: number } } = {},
): Promise<HorizonResult<T>> {
  let res: Response;
  try {
    res = await horizonFetch(url, {
      ...init,
      headers: { Accept: "application/json", ...(init.headers ?? {}) },
    });
  } catch (e) {
    if (e instanceof HorizonUnavailableError) {
      return { kind: "unavailable", status: e.status };
    }
    throw e;
  }
  if (res.status === 404) return { kind: "absent" };
  if (!res.ok) return { kind: "unavailable", status: res.status };
  try {
    return { kind: "found", data: (await res.json()) as T };
  } catch {
    return { kind: "unavailable", status: res.status };
  }
}

/** Unwrap a result, throwing when the truth is unknown. */
export function requireHorizon<T>(result: HorizonResult<T>, url: string): T | null {
  if (result.kind === "unavailable") {
    throw new HorizonUnavailableError(result.status, url);
  }
  return result.kind === "found" ? result.data : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
