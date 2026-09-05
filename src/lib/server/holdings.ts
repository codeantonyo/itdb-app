import { HORIZON } from "@/lib/stellar/horizon";
import {
  HorizonUnavailableError,
  horizonJson,
} from "@/lib/stellar/horizon-fetch";
import { TOKEN_REGISTRY, type RegistryToken } from "@/lib/stellar/registry";

/**
 * What a member HOLDS on chain, across all linked wallets. Tier
 * eligibility is derived from this and only this (§6.3): never by
 * subtracting one funding route from another.
 *
 * Every lookup goes through `horizonJson`, so a rate-limited Horizon
 * throws `HorizonUnavailableError` instead of reading as zero (§6.4).
 * API routes turn that into a 503 the client shows as "figures
 * unavailable", never as "you hold nothing".
 */

interface HorizonBalance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
}

export interface WalletHoldings {
  address: string;
  /** false = the account is not funded on the network (a definitive 404) */
  exists: boolean;
  /** `CODE:ISSUER` → balance for the registry tokens; "XLM" for native */
  balances: Record<string, number>;
}

/**
 * Short-lived per-instance cache. One page view can hit several routes
 * that each need the same wallet (the token summary, the rewards hub,
 * the airdrop check), and every miss is a Horizon call against a
 * per-IP rate limit. Only successful reads are cached — a failure must
 * be retried, never remembered.
 */
const holdingsCache = new Map<string, { at: number; value: WalletHoldings }>();
const HOLDINGS_TTL = 15_000;

export async function walletHoldings(address: string): Promise<WalletHoldings> {
  const cached = holdingsCache.get(address);
  if (cached && Date.now() - cached.at < HOLDINGS_TTL) return cached.value;

  const url = `${HORIZON}/accounts/${address}`;
  const res = await horizonJson<{ balances: HorizonBalance[] }>(url, {
    next: { revalidate: 30 },
  });
  if (res.kind === "unavailable") throw new HorizonUnavailableError(res.status, url);
  if (res.kind === "absent") {
    const value = { address, exists: false, balances: {} };
    holdingsCache.set(address, { at: Date.now(), value });
    return value;
  }

  const balances: Record<string, number> = {};
  for (const b of res.data.balances) {
    if (b.asset_type === "native") {
      balances.XLM = parseFloat(b.balance);
    } else if (b.asset_code && b.asset_issuer) {
      balances[`${b.asset_code}:${b.asset_issuer}`] = parseFloat(b.balance);
    }
  }
  const value = { address, exists: true, balances };
  holdingsCache.set(address, { at: Date.now(), value });
  return value;
}

export const holdingKey = (t: RegistryToken) => `${t.code}:${t.issuer}`;

/** Combined balance of one registry token across the member's wallets. */
export function tokenBalance(
  holdings: WalletHoldings[],
  token: RegistryToken,
): number {
  const key = holdingKey(token);
  return holdings.reduce((sum, h) => sum + (h.balances[key] ?? 0), 0);
}

/** Wallets that currently hold a positive balance of the token. */
export function walletsHolding(
  holdings: WalletHoldings[],
  token: RegistryToken,
): string[] {
  const key = holdingKey(token);
  return holdings.filter((h) => (h.balances[key] ?? 0) > 0).map((h) => h.address);
}

/** All linked wallets at once — one Horizon call per wallet. */
export async function memberHoldings(wallets: string[]): Promise<WalletHoldings[]> {
  return Promise.all(wallets.map(walletHoldings));
}

/** Balances for every registry token, keyed by code. */
export function registryBalances(holdings: WalletHoldings[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of TOKEN_REGISTRY) out[t.code] = tokenBalance(holdings, t);
  return out;
}
