import { parse as parseToml } from "smol-toml";
import { horizonJson, type HorizonResult } from "./horizon-fetch";
import { assetType, type RegistryToken } from "./registry";
import type { PricePoint, TokenMeta } from "./types";

export const HORIZON = "https://horizon.stellar.org";
const DAY_MS = 86_400_000;

/**
 * Non-Horizon JSON (CoinGecko, StellarExpert). Failure → null; these
 * sources only ever enrich, they never decide what a member is owed.
 */
async function getJson<T>(url: string, revalidate: number): Promise<T | null> {
  try {
    const res = await fetch(url, {
      next: { revalidate },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Issuer metadata via SEP-1 (home_domain → stellar.toml)             */
/* ------------------------------------------------------------------ */

interface TomlCurrency {
  code?: string;
  issuer?: string;
  name?: string;
  desc?: string;
  image?: string;
}

async function fetchHomeDomain(
  issuer: string,
): Promise<HorizonResult<{ home_domain?: string }>> {
  return horizonJson<{ home_domain?: string }>(`${HORIZON}/accounts/${issuer}`, {
    next: { revalidate: 3600 },
  });
}

async function fetchTomlCurrency(
  domain: string,
  code: string,
  issuer: string,
): Promise<TomlCurrency | null> {
  try {
    const res = await fetch(`https://${domain}/.well-known/stellar.toml`, {
      next: { revalidate: 3600 },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const text = await res.text();
    const doc = parseToml(text) as Record<string, unknown>;
    const currencies = doc.CURRENCIES;
    if (!Array.isArray(currencies)) return null;
    const list = currencies as TomlCurrency[];
    // The issuer address is the strongest key — a hand-written toml can
    // carry the wrong `code` (QRS's lists "ITDBONE") but the issuer it
    // names is unambiguous. Fall back to code only when issuer is absent.
    const match =
      list.find((cur) => cur.issuer === issuer) ??
      list.find((cur) => cur.code === code && !cur.issuer);
    if (!match) return null;
    // Some issuers publish a relative image path ("logo.jpg") — by
    // convention that means the domain root, so resolve it there.
    if (match.image && !/^https?:\/\//i.test(match.image)) {
      try {
        match.image = new URL(match.image, `https://${domain}/`).href;
      } catch {
        match.image = undefined;
      }
    }
    return match;
  } catch {
    return null;
  }
}

/**
 * Fallback metadata via StellarExpert — many issuers publish their
 * stellar.toml through hosting that blocks direct fetches, but
 * StellarExpert has already indexed it.
 */
interface ExpertTomlInfo {
  name?: string;
  image?: string;
  orgLogo?: string;
  desc?: string;
}

async function fetchExpertMeta(
  code: string,
  issuer: string,
): Promise<ExpertTomlInfo | null> {
  const data = await getJson<{
    _embedded?: { records?: { toml_info?: ExpertTomlInfo }[] };
  }>(
    `https://api.stellar.expert/explorer/public/asset/meta?asset[]=${code}-${issuer}`,
    3600,
  );
  return data?._embedded?.records?.[0]?.toml_info ?? null;
}

/* ------------------------------------------------------------------ */
/*  DEX pricing (orderbook mid + trade aggregations)                   */
/* ------------------------------------------------------------------ */

interface OrderBookLevel {
  price: string;
}

async function fetchOrderBookMidXlm(
  token: RegistryToken,
): Promise<HorizonResult<number | null>> {
  const params = new URLSearchParams({
    selling_asset_type: assetType(token.code),
    selling_asset_code: token.code,
    selling_asset_issuer: token.issuer,
    buying_asset_type: "native",
    limit: "1",
  });
  const book = await horizonJson<{ bids: OrderBookLevel[]; asks: OrderBookLevel[] }>(
    `${HORIZON}/order_book?${params}`,
    { next: { revalidate: 60 } },
  );
  if (book.kind !== "found") return book;
  const bid = book.data.bids[0] ? parseFloat(book.data.bids[0].price) : null;
  const ask = book.data.asks[0] ? parseFloat(book.data.asks[0].price) : null;
  if (bid && ask) return { kind: "found", data: (bid + ask) / 2 };
  return { kind: "found", data: bid ?? ask ?? null };
}

interface TradeAggRecord {
  timestamp: string;
  close: string;
}

/**
 * Daily trade aggregations for TOKEN/XLM over the last ~9 days.
 * Returns closes in XLM-per-token, oldest first.
 */
async function fetchDailyAggregates(
  token: RegistryToken,
): Promise<HorizonResult<{ t: number; closeXlm: number }[]>> {
  const end = Date.now();
  const start = end - 9 * DAY_MS;
  const params = new URLSearchParams({
    base_asset_type: "native",
    counter_asset_type: assetType(token.code),
    counter_asset_code: token.code,
    counter_asset_issuer: token.issuer,
    start_time: String(start),
    end_time: String(end),
    resolution: String(DAY_MS),
    order: "asc",
    limit: "10",
  });
  const data = await horizonJson<{ _embedded?: { records?: TradeAggRecord[] } }>(
    `${HORIZON}/trade_aggregations?${params}`,
    { next: { revalidate: 300 } },
  );
  if (data.kind !== "found") return data;
  const records = data.data._embedded?.records ?? [];
  return {
    kind: "found",
    data: records
      .map((r) => {
        // base = XLM, counter = TOKEN → close is TOKEN per XLM; invert.
        const tokenPerXlm = parseFloat(r.close);
        return {
          t: parseInt(r.timestamp, 10),
          closeXlm: tokenPerXlm > 0 ? 1 / tokenPerXlm : 0,
        };
      })
      .filter((r) => r.closeXlm > 0),
  };
}

/* ------------------------------------------------------------------ */
/*  XLM/USD via CoinGecko                                              */
/* ------------------------------------------------------------------ */

export async function fetchXlmUsd(): Promise<{
  priceUsd: number;
  change24h: number;
  history: PricePoint[];
}> {
  const [simple, chart] = await Promise.all([
    getJson<{ stellar?: { usd: number; usd_24h_change: number } }>(
      "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd&include_24hr_change=true",
      300,
    ),
    getJson<{ prices?: [number, number][] }>(
      "https://api.coingecko.com/api/v3/coins/stellar/market_chart?vs_currency=usd&days=7",
      900,
    ),
  ]);

  const prices = chart?.prices ?? [];
  // Downsample to ~56 points for sparklines
  const step = Math.max(1, Math.floor(prices.length / 56));
  const history: PricePoint[] = prices
    .filter((_, i) => i % step === 0)
    .map(([t, v]) => ({ t, v }));

  return {
    priceUsd: simple?.stellar?.usd ?? history.at(-1)?.v ?? 0,
    change24h: simple?.stellar?.usd_24h_change ?? 0,
    history,
  };
}

/* ------------------------------------------------------------------ */
/*  Full token resolution                                              */
/* ------------------------------------------------------------------ */

/**
 * Everything the token pages show — name, logo, domain, live DEX price
 * — resolved from chain + the issuer's stellar.toml. LOBSTR reads the
 * same on-chain data, so the figures agree with what a member sees
 * there.
 *
 * A rate-limited Horizon lookup marks the result `resolved: false`
 * instead of pretending there is no market (§6.4).
 */
export async function resolveToken(
  token: RegistryToken,
  xlmUsd: number,
): Promise<TokenMeta> {
  const [domainRes, midRes, aggRes] = await Promise.all([
    fetchHomeDomain(token.issuer),
    fetchOrderBookMidXlm(token),
    fetchDailyAggregates(token),
  ]);

  const resolved =
    domainRes.kind !== "unavailable" &&
    midRes.kind !== "unavailable" &&
    aggRes.kind !== "unavailable";

  const domain =
    domainRes.kind === "found"
      ? (domainRes.data.home_domain ?? null)
      : domainRes.kind === "unavailable"
        ? token.expectedDomain
        : null;
  const midXlm = midRes.kind === "found" ? midRes.data : null;
  const aggs = aggRes.kind === "found" ? aggRes.data : [];

  const toml = domain
    ? await fetchTomlCurrency(domain, token.code, token.issuer)
    : null;

  // Resolution chain: issuer's own stellar.toml → StellarExpert index
  const expert =
    toml?.image && toml?.name && toml?.desc
      ? null
      : await fetchExpertMeta(token.code, token.issuer);

  const lastAgg = aggs.at(-1)?.closeXlm ?? null;
  const priceXlm = midXlm ?? lastAgg;
  const priceUsd = priceXlm !== null ? priceXlm * xlmUsd : null;
  const hasMarket = priceXlm !== null;

  // 24h change from the last two daily closes
  let change24h: number | null = null;
  if (aggs.length >= 2) {
    const prev = aggs.at(-2)!.closeXlm;
    const last = aggs.at(-1)!.closeXlm;
    if (prev > 0) change24h = ((last - prev) / prev) * 100;
  }

  const history: PricePoint[] = aggs.map((a) => ({
    t: a.t,
    v: a.closeXlm * xlmUsd,
  }));

  return {
    code: token.code,
    issuer: token.issuer,
    name: toml?.name?.trim() || expert?.name?.trim() || token.code,
    image: toml?.image ?? expert?.image ?? expert?.orgLogo ?? null,
    desc: toml?.desc ?? expert?.desc ?? null,
    domain,
    priceXlm,
    priceUsd,
    change24h,
    history,
    hasMarket,
    resolved,
  };
}
