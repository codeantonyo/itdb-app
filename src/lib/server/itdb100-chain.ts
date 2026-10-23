import { I100_DISTRIBUTOR, I100_ISSUER, I100_MEMO_PREFIX, type I100Sale } from "@/lib/itdb/itdb100";
import { HORIZON } from "@/lib/stellar/horizon";
import { horizonFetch } from "@/lib/stellar/horizon-fetch";

/**
 * Every ITDB100 the distributor has sold (DEX fills and plain payments),
 * with the XLM paid, oldest first — and, apart from them, the bonus
 * payments it has made (memo "I100 …"), which are never sales.
 */

type Rec = Record<string, string> & { transaction?: { memo?: string } };

export interface I100Bonus {
  wallet: string;
  amount: number;
  memo: string;
  txHash: string;
}

const TTL_MS = 60_000;
// ponytail: full re-scan per minute; keep a cursor in the DB past ~10k sales.
const MAX_PAGES = 50;

type Chain = { sales: I100Sale[]; bonuses: I100Bonus[] };
let cache: { at: number; value: Chain } | null = null;

const isI100 = (code?: string, issuer?: string) => code === "ITDB100" && issuer === I100_ISSUER;

async function all(kind: "trades" | "payments"): Promise<Rec[]> {
  const out: Rec[] = [];
  const join = kind === "payments" ? "&join=transactions" : "";
  let next: string | null = `${HORIZON}/accounts/${I100_DISTRIBUTOR}/${kind}?order=asc&limit=200${join}`;
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

/** Pure: the distributor's history split into sales and bonuses. */
export function readI100(trades: Rec[], payments: Rec[]): Chain {
  const sales: I100Sale[] = [];
  const bonuses: I100Bonus[] = [];
  for (const t of trades) {
    const at = Date.parse(t.ledger_close_time);
    // base_amount moves base_account → counter_account, counter_amount the other way.
    if (isI100(t.base_asset_code, t.base_asset_issuer) && t.base_account === I100_DISTRIBUTOR)
      sales.push({ wallet: t.counter_account, amount: Number(t.base_amount), xlm: t.counter_asset_type === "native" ? Number(t.counter_amount) : 0, at });
    else if (isI100(t.counter_asset_code, t.counter_asset_issuer) && t.counter_account === I100_DISTRIBUTOR)
      sales.push({ wallet: t.base_account, amount: Number(t.counter_amount), xlm: t.base_asset_type === "native" ? Number(t.base_amount) : 0, at });
  }
  for (const p of payments) {
    if (p.from !== I100_DISTRIBUTOR || !isI100(p.asset_code, p.asset_issuer) || p.to === I100_ISSUER) continue;
    if (p.type !== "payment" && !p.type?.startsWith("path_payment")) continue;
    const memo = p.transaction?.memo ?? "";
    if (memo.startsWith(I100_MEMO_PREFIX)) bonuses.push({ wallet: p.to, amount: Number(p.amount), memo, txHash: p.transaction_hash });
    else sales.push({ wallet: p.to, amount: Number(p.amount), xlm: 0, at: Date.parse(p.created_at) });
  }
  sales.sort((a, b) => a.at - b.at);
  return { sales, bonuses };
}

export async function i100Chain(): Promise<Chain | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const [trades, payments] = await Promise.all([all("trades"), all("payments")]);
    cache = { at: Date.now(), value: readI100(trades, payments) };
    return cache.value;
  } catch {
    return cache?.value ?? null; // stale beats unknown; unknown beats a wrong zero
  }
}
