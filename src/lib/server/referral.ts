import { ITDBONE_TIERS, ITDB_TIERS, QRS_TIERS } from "@/lib/itdb/config";
import { VAULT_TIERS } from "@/lib/itdb/vault-tiers";
import {
  ITDBONE_TOKEN,
  ITDBVAULT_TOKEN,
  ITDB_TOKEN,
  QRS_TOKEN,
  type RegistryToken,
} from "@/lib/stellar/registry";
import { mutateDb, type DbAccount, type DbShape, type ReferralAward } from "./db";
import { memberHoldings, tokenBalance, walletsHolding } from "./holdings";

/**
 * The referral program.
 *
 * A new member may enter a code for 24 hours after joining. When they
 * reach Tier 2 in any ITDB token, they and their referrer are both
 * credited that holding again — the 100% match — automatically, with no
 * one approving it by hand. Each token matches once per referee.
 *
 * THE MATCH IS RECORDED, NOT SENT. Like every other bonus here it is an
 * entitlement in the ITDB ledger, paid from the ecosystem reserve by a
 * person; this module moves no tokens.
 *
 * What stops the obvious abuse, each checked where it can be:
 *   self-referral  — referrer and referee may not share a single wallet
 *   referral rings — you cannot refer someone who referred you
 *   wallet farming — a (wallet, token) pair is matched once, network-wide,
 *                    so one funded wallet cannot be re-used across a
 *                    string of fresh accounts
 *   inactive       — nothing pays below Tier 2 of real on-chain holdings
 */

export const REFERRAL_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Each token and the holding that opens its Tier 2. */
export const REFERRAL_TOKENS: { token: RegistryToken; tier2: number }[] = [
  { token: ITDB_TOKEN, tier2: ITDB_TIERS[1].min },
  { token: ITDBONE_TOKEN, tier2: ITDBONE_TIERS[1].min },
  { token: QRS_TOKEN, tier2: QRS_TIERS[1].min },
  // Raw holdings, without the vault early-bird tier discount: the match
  // is "token for token" on what was bought, and the stricter reading
  // keeps a one-vault holding from qualifying a referral on its own.
  { token: ITDBVAULT_TOKEN, tier2: VAULT_TIERS[1].min },
];

export const MONTHLY_PRIZES = [
  { place: 1, medal: "🥇", XDC: 200_000, XLM: 150_000, XRP: 75_000 },
  { place: 2, medal: "🥈", XDC: 150_000, XLM: 100_000, XRP: 50_000 },
  { place: 3, medal: "🥉", XDC: 75_000, XLM: 50_000, XRP: 25_000 },
];

const norm = (c: string) => c.trim().toUpperCase();

export function findByCode(db: DbShape, code: string): DbAccount | null {
  const c = norm(code);
  return db.accounts.find((a) => a.referralCode.toUpperCase() === c) ?? null;
}

const sharesWallet = (a: DbAccount, b: DbAccount) =>
  a.wallets.some((w) => b.wallets.includes(w));

/**
 * Why a code cannot be applied to this account, or null if it can.
 * Used at sign-up and by the "add a code" section alike, so the two
 * cannot disagree about what is allowed.
 */
export function referralProblem(
  db: DbShape,
  referee: Pick<DbAccount, "id" | "wallets" | "createdAt" | "referredBy">,
  code: string,
  now = Date.now(),
): string | null {
  if (referee.referredBy) return "You already have a referrer.";
  if (now - referee.createdAt > REFERRAL_WINDOW_MS)
    return "Codes can only be added in your first 24 hours.";
  const referrer = findByCode(db, code);
  if (!referrer) return "That code does not match any member.";
  if (referrer.id === referee.id) return "You cannot use your own code.";
  if (sharesWallet(referrer, referee as DbAccount))
    return "That code belongs to an account sharing one of your wallets.";
  if (referrer.referredBy && findByCode(db, referrer.referredBy)?.id === referee.id)
    return "You cannot refer someone who referred you.";
  return null;
}

/** Who referred this account, if anyone. */
export function referrerOf(db: DbShape, account: DbAccount): DbAccount | null {
  return account.referredBy ? findByCode(db, account.referredBy) : null;
}

/** Everyone this account referred. */
export function refereesOf(db: DbShape, account: DbAccount): DbAccount[] {
  const code = account.referralCode.toUpperCase();
  return db.accounts.filter((a) => a.referredBy?.toUpperCase() === code);
}

/**
 * Award any match bonuses this referee has earned. Safe to call on every
 * read: it only ever adds an award that is not already on record, and it
 * re-checks everything inside the write.
 *
 * Returns without writing when the holdings could not be read — an
 * unreadable balance is unknown, not zero, and must not decide anything.
 */
export async function ensureReferralAwards(referee: DbAccount, now = Date.now()): Promise<void> {
  let holdings: Awaited<ReturnType<typeof memberHoldings>>;
  try {
    holdings = await memberHoldings(referee.wallets);
  } catch {
    return;
  }

  const due = REFERRAL_TOKENS.map(({ token, tier2 }) => ({
    code: token.code,
    amount: tokenBalance(holdings, token),
    wallets: walletsHolding(holdings, token),
    tier2,
  })).filter((d) => d.amount >= d.tier2);
  if (due.length === 0) return;

  await mutateDb((db) => {
    const me = db.accounts.find((a) => a.id === referee.id);
    const referrer = me && referrerOf(db, me);
    if (!me || !referrer || sharesWallet(me, referrer)) return null;

    const add = newAwards(db, me.id, referrer.id, due, now);
    if (add.length > 0) (db.referralAwards[me.id] ??= []).push(...add);
    return null;
  });
}

export interface DueMatch {
  code: string;
  amount: number;
  wallets: string[];
}

/**
 * Which matches to add for a referee — pure, so the rules can be tested.
 *
 * A token matches once per referee, and a (wallet, token) pair matches
 * once across the whole network: a funded wallet moved onto a string of
 * fresh accounts earns the match for the first of them only.
 */
export function newAwards(
  db: DbShape,
  refereeId: string,
  referrerId: string,
  due: DueMatch[],
  now: number,
): ReferralAward[] {
  const mine = db.referralAwards[refereeId] ?? [];
  const used = new Set(
    Object.values(db.referralAwards)
      .flat()
      .flatMap((a) => a.wallets.map((w) => `${w}:${a.token}`)),
  );
  const out: ReferralAward[] = [];
  for (const d of due) {
    if (mine.some((a) => a.token === d.code) || out.some((a) => a.token === d.code)) continue;
    if (d.wallets.some((w) => used.has(`${w}:${d.code}`))) continue;
    out.push({ token: d.code, amount: d.amount, at: now, referrerId, wallets: d.wallets });
    for (const w of d.wallets) used.add(`${w}:${d.code}`);
  }
  return out;
}

/** When a referee first qualified (reached Tier 2 in anything), or null. */
export function qualifiedAt(db: DbShape, refereeId: string): number | null {
  const list = db.referralAwards[refereeId];
  return list && list.length > 0 ? Math.min(...list.map((a) => a.at)) : null;
}

export interface LeaderRow {
  accountId: string;
  username: string;
  qualified: number;
  /** When they reached this count — the earlier breaks a tie */
  reachedAt: number;
}

/**
 * Referrers ranked by referrals that QUALIFIED in the given UTC month.
 * A tie goes to whoever reached that number first.
 */
export function leaderboard(db: DbShape, year: number, month: number): LeaderRow[] {
  const from = Date.UTC(year, month, 1);
  const to = Date.UTC(year, month + 1, 1);
  const rows = new Map<string, LeaderRow>();
  for (const awards of Object.values(db.referralAwards)) {
    if (awards.length === 0) continue;
    const at = Math.min(...awards.map((a) => a.at));
    if (at < from || at >= to) continue;
    const referrerId = awards[0].referrerId;
    const row = rows.get(referrerId) ?? {
      accountId: referrerId,
      username: db.accounts.find((a) => a.id === referrerId)?.username ?? "member",
      qualified: 0,
      reachedAt: 0,
    };
    row.qualified += 1;
    row.reachedAt = Math.max(row.reachedAt, at);
    rows.set(referrerId, row);
  }
  return [...rows.values()].sort((a, b) => b.qualified - a.qualified || a.reachedAt - b.reachedAt);
}
