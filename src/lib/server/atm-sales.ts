import { ATMS_DISTRIBUTOR, ATMS_ISSUER, type AtmSale } from "@/lib/itdb/atms";
import { HORIZON } from "@/lib/stellar/horizon";
import { horizonFetch } from "@/lib/stellar/horizon-fetch";

/**
 * Every ITDBATMS the distributor has sold, oldest first: DEX trades
 * against its offers and direct payments out of it. Read from the chain,
 * so the pre-sale buyers, the council seats and the amount sold all come
 * from one place nobody can edit.
 */

type Rec = Record<string, string>;

const TTL_MS = 60_000;
/** 200 records a page; this is 10,000 sales before the scan stops short. */
// ponytail: full re-scan per minute; keep a cursor in the DB if sales run past ~10k.
const MAX_PAGES = 50;

let cache: { at: number; sales: AtmSale[] } | null = null;

const isAtms = (code?: string, issuer?: string) => code === "ITDBATMS" && issuer === ATMS_ISSUER;

async function all(kind: "trades" | "payments"): Promise<Rec[]> {
  const out: Rec[] = [];
  let next: string | null = `${HORIZON}/accounts/${ATMS_DISTRIBUTOR}/${kind}?order=asc&limit=200`;
  for (let i = 0; next && i < MAX_PAGES; i++) {
    const res = await horizonFetch(next, { cache: "no-store" });
    if (!res.ok) throw new Error(`Horizon ${res.status}`);
    const data = (await res.json()) as { _embedded?: { records?: Rec[] }; _links?: { next?: { href?: string } } };
    const records = data._embedded?.records ?? [];
    out.push(...records);
    next = records.length === 200 ? (data._links?.next?.href ?? null) : null;
  }
  return out;
}

/** Sales, oldest first; null only if the chain has never been readable. */
export async function atmSales(): Promise<AtmSale[] | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.sales;
  try {
    const [trades, payments] = await Promise.all([all("trades"), all("payments")]);
    const sales: AtmSale[] = [];
    for (const t of trades) {
      // base_amount always moves base_account → counter_account.
      if (isAtms(t.base_asset_code, t.base_asset_issuer) && t.base_account === ATMS_DISTRIBUTOR)
        sales.push({ wallet: t.counter_account, amount: Number(t.base_amount), at: Date.parse(t.ledger_close_time) });
      else if (isAtms(t.counter_asset_code, t.counter_asset_issuer) && t.counter_account === ATMS_DISTRIBUTOR)
        sales.push({ wallet: t.base_account, amount: Number(t.counter_amount), at: Date.parse(t.ledger_close_time) });
    }
    for (const p of payments) {
      if (p.from !== ATMS_DISTRIBUTOR || !isAtms(p.asset_code, p.asset_issuer) || p.to === ATMS_ISSUER) continue;
      if (p.type === "payment" || p.type?.startsWith("path_payment"))
        sales.push({ wallet: p.to, amount: Number(p.amount), at: Date.parse(p.created_at) });
    }
    sales.sort((a, b) => a.at - b.at);
    cache = { at: Date.now(), sales };
    return sales;
  } catch {
    return cache?.sales ?? null; // stale beats unknown; unknown beats a wrong zero
  }
}
