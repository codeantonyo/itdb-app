import {
  BUY_TOKENS,
  BUY_USDC,
  BUY_XLM,
  DAILY_REFERRAL_CAP,
  GIVEAWAY,
  ICO_CODES,
  JOIN_TOKENS,
  ladderStep,
  type IcoCode,
} from "@/lib/itdb/referral-program";
import { HORIZON } from "@/lib/stellar/horizon";
import { horizonFetch } from "@/lib/stellar/horizon-fetch";
import { TOKEN_REGISTRY } from "@/lib/stellar/registry";
import { mutateDb, type DbAccount, type DbShape } from "./db";
import { refereesOf, referrerOf } from "./referral";

/**
 * The referral program: who brought whom, who has invested 100 XLM, and
 * what each side is credited. Credits are derived on every read from the
 * referrals and the purchases on record — the only things stored are the
 * moment a friend crossed 100 XLM and which ICO each member picked.
 */

const ICO = new Map(
  TOKEN_REGISTRY.filter((t) => (ICO_CODES as readonly string[]).includes(t.code)).map((t) => [`${t.code}:${t.issuer}`, t.code]),
);
const PAGES = 5;

/**
 * XLM these wallets paid for ICO tokens on the DEX since `since`, and when
 * the total first reached BUY_XLM. Null when Horizon could not answer —
 * unknown is not "has not bought".
 */
export async function investedXlm(wallets: string[], since: number): Promise<{ xlm: number; at: number | null } | null> {
  type T = Record<string, string>;
  const buys: { xlm: number; at: number }[] = [];
  try {
    for (const w of wallets) {
      let next: string | null = `${HORIZON}/accounts/${w}/trades?order=desc&limit=200`;
      for (let i = 0; next && i < PAGES; i++) {
        const res = await horizonFetch(next, { cache: "no-store" });
        if (!res.ok) return null;
        const data = (await res.json()) as { _embedded?: { records?: T[] }; _links?: { next?: { href?: string } } };
        const recs = data._embedded?.records ?? [];
        let older = false;
        for (const t of recs) {
          const at = Date.parse(t.ledger_close_time);
          if (at < since) {
            older = true;
            break;
          }
          // base_amount moves base_account → counter_account, and back the other way.
          const ico = (side: "base" | "counter") => ICO.has(`${t[`${side}_asset_code`]}:${t[`${side}_asset_issuer`]}`);
          if (t.base_account === w && t.base_asset_type === "native" && ico("counter")) buys.push({ xlm: Number(t.base_amount), at });
          else if (t.counter_account === w && t.counter_asset_type === "native" && ico("base"))
            buys.push({ xlm: Number(t.counter_amount), at });
        }
        next = !older && recs.length === 200 ? (data._links?.next?.href ?? null) : null;
      }
    }
  } catch {
    return null;
  }
  buys.sort((a, b) => a.at - b.at);
  let xlm = 0;
  let at: number | null = null;
  for (const b of buys) {
    xlm += b.xlm;
    if (at === null && xlm >= BUY_XLM) at = b.at;
  }
  return { xlm, at };
}

/** Record that a referred member crossed 100 XLM, if they have. Safe to call often. */
export async function ensureBuy(referee: DbAccount): Promise<void> {
  if (!referee.referredBy) return;
  const r = await investedXlm(referee.wallets, referee.createdAt);
  if (!r || r.at === null) return;
  const at = r.at;
  await mutateDb((db) => {
    db.referralBuys[referee.id] ??= { at, xlm: r.xlm };
    return null;
  });
}

/**
 * The referrals that count for a referrer: everyone who registered with
 * their code, at most DAILY_REFERRAL_CAP per UTC day, first come first.
 */
export function countedReferees(db: DbShape, referrer: DbAccount): DbAccount[] {
  const perDay = new Map<string, number>();
  return refereesOf(db, referrer)
    .sort((a, b) => a.createdAt - b.createdAt)
    .filter((r) => {
      const day = new Date(r.createdAt).toISOString().slice(0, 10);
      const n = (perDay.get(day) ?? 0) + 1;
      perDay.set(day, n);
      return n <= DAILY_REFERRAL_CAP;
    });
}

export interface Credit {
  key: string;
  kind: "join" | "buy" | "ladder";
  /** Who it is for, in words: "you joined", the friend's username, or the ladder step */
  about: string;
  usdc: number;
  tokens: number;
  /** The ICO picked for the tokens; null until the member picks */
  token: IcoCode | null;
  at: number;
}

/** Everything a member is credited by the program, newest first. Pure. */
export function creditsOf(db: DbShape, me: DbAccount) {
  const picks = db.referralChoices[me.id] ?? {};
  const pick = (key: string) => (picks[key] as IcoCode | undefined) ?? null;
  const out: Credit[] = [];
  const referees = countedReferees(db, me);

  for (const r of referees) {
    out.push({ key: `join:${r.id}`, kind: "join", about: r.username, usdc: 0, tokens: JOIN_TOKENS, token: pick(`join:${r.id}`), at: r.createdAt });
    const buy = db.referralBuys[r.id];
    if (buy) out.push({ key: `buy:${r.id}`, kind: "buy", about: r.username, usdc: BUY_USDC, tokens: BUY_TOKENS, token: pick(`buy:${r.id}`), at: buy.at });
  }
  // My own side, for joining through someone's code.
  if (me.referredBy && referrerOf(db, me)) {
    out.push({ key: "join:me", kind: "join", about: "you joined", usdc: 0, tokens: JOIN_TOKENS, token: pick("join:me"), at: me.createdAt });
    const buy = db.referralBuys[me.id];
    if (buy) out.push({ key: "buy:me", kind: "buy", about: "you invested 100 XLM", usdc: BUY_USDC, tokens: BUY_TOKENS, token: pick("buy:me"), at: buy.at });
  }

  const qualified = referees.filter((r) => db.referralBuys[r.id]);
  const step = ladderStep(qualified.length);
  if (step) {
    const reachedAt = db.referralBuys[qualified[step.friends - 1].id].at;
    out.push({ key: `ladder:${step.friends}`, kind: "ladder", about: `${step.friends} friends`, usdc: step.usdc, tokens: 0, token: null, at: reachedAt });
  }
  return { credits: out.sort((a, b) => b.at - a.at), referees, qualified: qualified.length, step };
}

/** The ladder ATMs and vaults an account has earned — added to what it may place. */
export function ladderBonus(db: DbShape, accountId: string): { atms: number; vaults: number } {
  const me = db.accounts.find((a) => a.id === accountId);
  if (!me) return { atms: 0, vaults: 0 };
  const step = ladderStep(countedReferees(db, me).filter((r) => db.referralBuys[r.id]).length);
  return { atms: step?.atms ?? 0, vaults: step?.vaults ?? 0 };
}

export interface BoardRow {
  accountId: string;
  username: string;
  count: number;
  /** When they reached this count — the earlier wins a tie */
  reachedAt: number;
}

function rank(db: DbShape, inWindow: (r: DbAccount) => number | null): BoardRow[] {
  const rows: BoardRow[] = [];
  for (const a of db.accounts) {
    const times = countedReferees(db, a)
      .map(inWindow)
      .filter((t): t is number => t !== null)
      .sort((x, y) => x - y);
    if (times.length) rows.push({ accountId: a.id, username: a.username, count: times.length, reachedAt: times[times.length - 1] });
  }
  return rows.sort((a, b) => b.count - a.count || a.reachedAt - b.reachedAt);
}

/** Top referrers: friends who invested 100+ XLM in the given UTC month. */
export function topReferrers(db: DbShape, year: number, month: number): BoardRow[] {
  const from = Date.UTC(year, month, 1);
  const to = Date.UTC(year, month + 1, 1);
  return rank(db, (r) => {
    const at = db.referralBuys[r.id]?.at;
    return at !== undefined && at >= from && at < to ? at : null;
  });
}

/** The giveaway: new members brought in the giveaway month. */
export function giveawayBoard(db: DbShape): BoardRow[] {
  const from = Date.UTC(GIVEAWAY.year, GIVEAWAY.month, 1);
  const to = Date.UTC(GIVEAWAY.year, GIVEAWAY.month + 1, 1);
  return rank(db, (r) => (r.createdAt >= from && r.createdAt < to ? r.createdAt : null));
}
