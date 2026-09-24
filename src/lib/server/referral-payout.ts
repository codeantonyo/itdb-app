import { randomBytes } from "crypto";
import { Asset, BASE_FEE, Horizon, Keypair, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { ITDB_TOKEN } from "@/lib/stellar/registry";
import { getDb, mutateDb, type DbShape, type ReferralPayout } from "./db";
import { qualifiedAt } from "./referral";

/**
 * REAL ON-CHAIN referral rewards — ITDB sent from a rewards account.
 *
 * Every qualified referral pays 10,000 ITDB to the referrer and the same
 * to the new member, from the ITDB distributor whose key is ITDB_SECRET
 * (or ITDB_REWARDS_SECRET, which overrides it, should rewards ever move to
 * a dedicated account). With neither set, nothing is sent.
 *
 * ANTI-FARMING. Tier 2 costs a few dollars and balances can be moved, so
 * qualifying alone pays nothing. The new member must also have HELD at
 * least one reward's worth of ITDB (10,000, as in the program's own
 * example) without a break for HOLD_DAYS, proven from their wallets'
 * on-chain history. The same coins cannot sit in two wallets at once, so
 * one bag passed from fresh account to fresh account earns once per
 * HOLD_DAYS, not once a minute. With the once-per-wallet rule and the
 * daily cap that bounds what a farm can take; it cannot make one
 * impossible, since nothing on chain proves a separate person.
 *
 * Three rules this is built around, because money that leaves on chain
 * does not come back:
 *
 * 1. CLAIM BEFORE SENDING. A payout is written as "pending" inside the
 *    database's global write lock before its transaction is submitted,
 *    so two requests running at once can never both pay the same reward.
 *
 * 2. PROVE BEFORE RETRYING. Every transaction carries its payout's id in
 *    the memo and expires TX_TIMEOUT_S after it is built. A payout still
 *    "pending" after that window is checked against the chain by memo:
 *    found → paid; not found → it can no longer land, so it is safe to
 *    send again. Nothing is ever resent on a guess.
 *
 * 3. CAP THE DAMAGE. A rolling 24-hour cap bounds what a bug or a farm
 *    can drain, and the key must not be the ITDB issuer — an issuer
 *    payment mints, and minting on a timer is not what this is for.
 */

export const TX_TIMEOUT_S = 60;
/** Well past TX_TIMEOUT_S: a pending payout older than this cannot still land. */
const STALE_MS = 10 * 60_000;
/** How long a failed payout (say, no ITDB trustline yet) waits before retrying. */
const RETRY_MS = 60 * 60_000;
/** Payments per run, so a run fits well inside a serverless time limit. */
const MAX_PER_RUN = 4;
const DAY_MS = 86_400_000;
const MEMO_PREFIX = "ITDB REF ";
/** How long the new member must hold a reward's worth of ITDB first. */
export const HOLD_DAYS = 7;
const HOLD_MS = HOLD_DAYS * DAY_MS;
/** Hold checks per run: each is a few Horizon reads. */
const HOLD_CHECKS_PER_RUN = 6;
/** Effect pages read per wallet before giving up on proving a hold. */
const HOLD_PAGES = 5;

export interface PayoutConfig {
  secret: string;
  perReferral: number;
  dailyCap: number;
  horizon: string;
  passphrase: string;
  asset: { code: string; issuer: string };
}

/** Settings from the environment, or null when payouts are switched off. */
export function payoutConfig(env: NodeJS.ProcessEnv = process.env): PayoutConfig | null {
  const secret = (env.ITDB_REWARDS_SECRET || env.ITDB_SECRET)?.trim();
  if (!secret || env.ITDB_REWARDS_PAUSED === "1") return null;
  const testnet = env.STELLAR_NETWORK === "testnet";
  return {
    secret,
    perReferral: Number(env.ITDB_REWARDS_PER_REFERRAL ?? 10_000),
    dailyCap: Number(env.ITDB_REWARDS_DAILY_CAP ?? 100_000),
    horizon: testnet ? "https://horizon-testnet.stellar.org" : "https://horizon.stellar.org",
    passphrase: testnet ? Networks.TESTNET : Networks.PUBLIC,
    asset: ITDB_TOKEN,
  };
}

/** Why this configuration must not be used, or null. */
export function configProblem(cfg: PayoutConfig): string | null {
  let pub: string;
  try {
    pub = Keypair.fromSecret(cfg.secret).publicKey();
  } catch {
    return "ITDB_SECRET is not a valid Stellar secret key.";
  }
  if (pub === cfg.asset.issuer)
    return "ITDB_SECRET is the ITDB issuer — that would mint. Use the distributor key.";
  if (!(cfg.perReferral > 0) || !(cfg.dailyCap >= cfg.perReferral))
    return "The reward amount and daily cap must be positive, and the cap at least one reward.";
  return null;
}

/* ------------------------------------------------------------------ */
/*  1. Choosing what to pay — pure, so it can be tested                */
/* ------------------------------------------------------------------ */

export interface Claimed {
  key: string;
  payout: ReferralPayout;
  /** Was stuck "pending" — must be checked on chain before any resend */
  recover: boolean;
}

const newId = () => randomBytes(6).toString("hex").slice(0, 10);

/**
 * Pick the rewards to send now and mark them "pending", in place on `db`.
 * Call inside mutateDb so the claim and the check happen under one lock.
 *
 * `held` is the referees whose hold was just proven on chain. A referral
 * with neither side started must be in it; once one side has been claimed
 * the hold is proven, and the other side follows without a re-check.
 */
export function claimPayouts(db: DbShape, cfg: PayoutConfig, now: number, held: ReadonlySet<string>): Claimed[] {
  // Everything paid or in flight in the last 24 hours counts against the cap.
  let budget =
    cfg.dailyCap -
    Object.values(db.referralPayouts)
      .filter((p) => p.status !== "failed" && now - (p.paidAt ?? p.claimedAt) < DAY_MS)
      .reduce((s, p) => s + p.amount, 0);

  const out: Claimed[] = [];
  for (const [refereeId, awards] of Object.entries(db.referralAwards)) {
    if (awards.length === 0) continue; // not qualified
    const referee = db.accounts.find((a) => a.id === refereeId);
    const referrer = db.accounts.find((a) => a.id === awards[0].referrerId);
    if (!referee || !referrer) continue;
    if (!started(db, refereeId) && !held.has(refereeId)) continue;

    for (const [role, who] of [["referee", referee], ["referrer", referrer]] as const) {
      if (out.length >= MAX_PER_RUN) return out;
      const key = `${refereeId}:${role}`;
      const prev = db.referralPayouts[key];
      if (prev?.status === "paid") continue;
      if (prev?.status === "pending" && now - prev.claimedAt < STALE_MS) continue; // in flight
      if (prev?.status === "failed" && now - prev.claimedAt < RETRY_MS) continue;

      const recover = prev?.status === "pending";
      // A recovery may turn out to be already paid, so it spends no budget
      // until proven otherwise — but a fresh payment must fit.
      // Out of budget stops NEW payments only — a stuck one must still be
      // checked, and checking costs nothing.
      if (!recover && budget < cfg.perReferral) continue;
      const wallet = who.wallets[0];
      if (!wallet) continue;

      const payout: ReferralPayout = {
        id: prev?.id ?? newId(),
        refereeId,
        recipientId: who.id,
        role,
        wallet,
        amount: cfg.perReferral,
        status: "pending",
        claimedAt: now,
        attempts: (prev?.attempts ?? 0) + 1,
      };
      db.referralPayouts[key] = payout;
      if (!recover) budget -= cfg.perReferral;
      out.push({ key, payout, recover });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  2. The chain                                                       */
/* ------------------------------------------------------------------ */

/**
 * `landed: false` — definitely did not move money (refused before
 * submitting, or rejected by the network with result codes).
 * `landed: "unknown"` — the request failed in a way that says nothing
 * about whether the payment went through, e.g. a timeout. That MUST NOT
 * be treated as a failure: the payout stays pending and is proven on
 * chain by its memo before anything is sent again.
 */
export type SendResult =
  | { ok: true; txHash: string }
  | {
      ok: false;
      error: string;
      landed: false | "unknown";
      /** Ours to fix, not the member's: they are shown "queued", not an error */
      operator?: boolean;
    };

/** Look for a payment this rewards account already made with this memo. */
export async function findByMemo(cfg: PayoutConfig, id: string): Promise<string | null> {
  const server = new Horizon.Server(cfg.horizon);
  const from = Keypair.fromSecret(cfg.secret).publicKey();
  const page = await server.payments().forAccount(from).order("desc").limit(200).join("transactions").call();
  const hit = page.records.find(
    (p) => (p as unknown as { transaction_attr?: { memo?: string } }).transaction_attr?.memo === MEMO_PREFIX + id,
  );
  return hit ? hit.transaction_hash : null;
}

const started = (db: DbShape, refereeId: string) =>
  Boolean(db.referralPayouts[`${refereeId}:referee`] || db.referralPayouts[`${refereeId}:referrer`]);

/** One Horizon effect: the fields the hold check reads. */
export interface Effect {
  type: string;
  created_at: string;
  amount?: string;
  asset_code?: string;
  asset_issuer?: string;
  sold_asset_code?: string;
  sold_asset_issuer?: string;
  sold_amount?: string;
  bought_asset_code?: string;
  bought_asset_issuer?: string;
  bought_amount?: string;
}

export interface Walk {
  /** Balance just before the oldest effect read so far */
  bal: number;
  /** Lowest balance seen */
  min: number;
  /** Reached `since`, so `min` covers the whole window */
  reached: boolean;
}

/**
 * Walk a wallet's balance of `asset` back through its effects, newest
 * first, down to `since`, keeping the lowest point. Pure. Null for a move
 * it cannot follow (liquidity pools), which counts as not held.
 */
export function walkBack(from: Walk, effects: Effect[], since: number, asset: { code: string; issuer: string }): Walk | null {
  const is = (c?: string, i?: string) => c === asset.code && i === asset.issuer;
  let { bal, min } = from;
  for (const e of effects) {
    if (Date.parse(e.created_at) < since) return { bal, min, reached: true };
    if (e.type === "account_credited" && is(e.asset_code, e.asset_issuer)) bal -= Number(e.amount);
    else if (e.type === "account_debited" && is(e.asset_code, e.asset_issuer)) bal += Number(e.amount);
    else if (e.type === "trade") {
      if (is(e.bought_asset_code, e.bought_asset_issuer)) bal -= Number(e.bought_amount);
      if (is(e.sold_asset_code, e.sold_asset_issuer)) bal += Number(e.sold_amount);
    } else if (e.type.startsWith("liquidity_pool")) return null; // ponytail: pools not followed; such wallets never qualify
    min = Math.min(min, bal);
  }
  return { bal, min, reached: false };
}

/**
 * Did these wallets together hold at least `amount` ITDB for the whole of
 * the last HOLD_DAYS? Summed per wallet (each wallet's own low point),
 * which is strict when a member moves coins between their own wallets.
 * Anything Horizon cannot answer is a no for this run, never a yes.
 */
export async function heldThroughout(cfg: PayoutConfig, wallets: string[], amount: number, now: number): Promise<boolean> {
  const server = new Horizon.Server(cfg.horizon);
  const since = now - HOLD_MS;
  let total = 0;
  try {
    for (const w of wallets) {
      const acct = await server.loadAccount(w);
      const line = acct.balances.find(
        (b) => "asset_code" in b && b.asset_code === cfg.asset.code && b.asset_issuer === cfg.asset.issuer,
      );
      const balance = line ? Number(line.balance) : 0;
      if (balance <= 0) continue; // its low point is at most today's zero

      let walk: Walk | null = { bal: balance, min: balance, reached: false };
      let page = await server.effects().forAccount(w).order("desc").limit(200).call();
      for (let n = 0; walk && !walk.reached && n < HOLD_PAGES; n++) {
        const recs = page.records as unknown as Effect[];
        walk = walkBack(walk, recs, since, cfg.asset);
        if (walk && !walk.reached && recs.length < 200) walk.reached = true; // start of its history
        else if (walk && !walk.reached) page = await page.next();
      }
      if (!walk?.reached) return false; // unfollowable, or too busy to prove
      total += Math.max(walk.min, 0);
    }
  } catch {
    return false;
  }
  return total >= amount;
}

/** Send one reward. Refuses rather than guesses on anything unexpected. */
export async function sendItdb(cfg: PayoutConfig, to: string, amount: number, id: string): Promise<SendResult> {
  const server = new Horizon.Server(cfg.horizon);
  const keys = Keypair.fromSecret(cfg.secret);
  const asset = new Asset(cfg.asset.code, cfg.asset.issuer);
  const has = (b: { asset_code?: string; asset_issuer?: string }) =>
    b.asset_code === cfg.asset.code && b.asset_issuer === cfg.asset.issuer;

  let dest;
  try {
    dest = await server.loadAccount(to);
  } catch {
    return { ok: false, error: "Wallet not found on chain.", landed: false };
  }
  const line = dest.balances.find((b) => has(b as { asset_code?: string; asset_issuer?: string }));
  if (!line) return { ok: false, error: `Wallet has no ${cfg.asset.code} trustline yet.`, landed: false };

  let source;
  try {
    source = await server.loadAccount(keys.publicKey());
  } catch {
    return { ok: false, error: "Could not load the rewards account.", landed: false, operator: true };
  }
  const float = source.balances.find((b) => has(b as { asset_code?: string; asset_issuer?: string }));
  if (!float || Number(float.balance) < amount)
    return { ok: false, error: `Rewards account is short of ${cfg.asset.code} — top it up.`, landed: false, operator: true };

  const tx = new TransactionBuilder(source, { fee: String(Number(BASE_FEE) * 10), networkPassphrase: cfg.passphrase })
    .addOperation(Operation.payment({ destination: to, asset, amount: amount.toFixed(7) }))
    .addMemo(Memo.text(MEMO_PREFIX + id))
    .setTimeout(TX_TIMEOUT_S)
    .build();
  tx.sign(keys);

  try {
    const res = await server.submitTransaction(tx);
    return { ok: true, txHash: res.hash };
  } catch (e) {
    const codes = (e as { response?: { data?: { extras?: { result_codes?: unknown } } } })?.response?.data
      ?.extras?.result_codes;
    // With result codes the network definitely refused it. Without them we
    // do not know — the payment may well have gone through.
    return codes
      ? { ok: false, error: `Rejected: ${JSON.stringify(codes)}`, landed: false }
      : { ok: false, error: "No answer from Stellar — will check before retrying.", landed: "unknown" };
  }
}

/* ------------------------------------------------------------------ */
/*  3. The run                                                         */
/* ------------------------------------------------------------------ */

export interface SettleReport {
  enabled: boolean;
  problem?: string;
  paid: number;
  recovered: number;
  failed: number;
}

/**
 * Pay whatever referral rewards are owed, up to MAX_PER_RUN at a time.
 * Safe to call from anywhere, as often as you like.
 */
export async function settleReferralRewards(now = Date.now()): Promise<SettleReport> {
  const cfg = payoutConfig();
  const report: SettleReport = { enabled: cfg !== null, paid: 0, recovered: 0, failed: 0 };
  if (!cfg) return report;
  const problem = configProblem(cfg);
  if (problem) return { ...report, enabled: false, problem };

  const held = await provenHolds(cfg, now);
  const claimed = await mutateDb((db) => claimPayouts(db, cfg, now, held));

  for (const c of claimed) {
    let result: SendResult;
    let recovered = false;
    if (c.recover) {
      // It may have landed before whoever sent it lost track of it.
      let hash: string | null;
      try {
        hash = await findByMemo(cfg, c.payout.id);
      } catch {
        continue; // cannot check — it stays pending and is looked at next run
      }
      recovered = hash !== null;
      result = hash
        ? { ok: true, txHash: hash }
        : await sendItdb(cfg, c.payout.wallet, c.payout.amount, c.payout.id);
    } else {
      result = await sendItdb(cfg, c.payout.wallet, c.payout.amount, c.payout.id);
    }

    await mutateDb((db) => {
      const p = db.referralPayouts[c.key];
      if (!p || p.id !== c.payout.id) return null;
      if (result.ok) {
        p.status = "paid";
        p.paidAt = Date.now();
        p.txHash = result.txHash;
        delete p.error;
      } else if (result.landed === false) {
        p.status = "failed";
        p.error = result.error;
        p.operator = result.operator === true;
      } else {
        // Unknown: stay pending. After STALE_MS the memo check settles it.
        p.error = result.error;
      }
      return null;
    });

    if (!result.ok) report.failed += 1;
    else if (recovered) report.recovered += 1;
    else report.paid += 1;
  }
  return report;
}

/** When each referee's hold was last checked, so a failing one is not re-read every run. */
// ponytail: per-instance memory; a cold start re-checks early, which only costs Horizon reads.
const holdCheckedAt = new Map<string, number>();

/** The qualified referees not yet started whose hold is proven on chain now. */
async function provenHolds(cfg: PayoutConfig, now: number): Promise<Set<string>> {
  const db = await getDb();
  const due = Object.keys(db.referralAwards)
    .filter((id) => {
      const q = qualifiedAt(db, id);
      return q !== null && !started(db, id) && now - (holdCheckedAt.get(id) ?? 0) >= RETRY_MS;
    })
    .sort((a, b) => (holdCheckedAt.get(a) ?? 0) - (holdCheckedAt.get(b) ?? 0))
    .slice(0, HOLD_CHECKS_PER_RUN);

  const held = new Set<string>();
  for (const id of due) {
    holdCheckedAt.set(id, now);
    const acct = db.accounts.find((a) => a.id === id);
    if (acct && (await heldThroughout(cfg, acct.wallets, cfg.perReferral, now))) held.add(id);
  }
  return held;
}

/* ------------------------------------------------------------------ */
/*  4. A look without touching anything                                */
/* ------------------------------------------------------------------ */

export interface PayoutStatus {
  enabled: boolean;
  problem: string | null;
  /** The paying account: a public key, safe to show */
  from: string | null;
  /** Its ITDB balance, or null if it could not be read */
  float: number | null;
  perReferral: number;
  dailyCap: number;
  /** Rewards owed and not yet sent */
  owed: number;
}

/** Read-only: what would pay, from where, and how much is waiting. */
export async function payoutStatus(db: DbShape): Promise<PayoutStatus> {
  const cfg = payoutConfig();
  const qualified = Object.values(db.referralAwards).filter((a) => a.length > 0).length;
  const paid = Object.values(db.referralPayouts).filter((p) => p.status === "paid").length;
  const base = {
    perReferral: cfg?.perReferral ?? 10_000,
    dailyCap: cfg?.dailyCap ?? 100_000,
    owed: Math.max(qualified * 2 - paid, 0),
  };
  if (!cfg) return { enabled: false, problem: "No ITDB_SECRET set.", from: null, float: null, ...base };

  const problem = configProblem(cfg);
  if (problem) return { enabled: false, problem, from: null, float: null, ...base };

  const from = Keypair.fromSecret(cfg.secret).publicKey();
  let float: number | null = null;
  try {
    const acct = await new Horizon.Server(cfg.horizon).loadAccount(from);
    const line = acct.balances.find(
      (b) => "asset_code" in b && b.asset_code === cfg.asset.code && b.asset_issuer === cfg.asset.issuer,
    );
    float = line && "balance" in line ? Number(line.balance) : 0;
  } catch {
    float = null;
  }
  return {
    enabled: true,
    problem: float === 0 ? `The paying account holds no ${cfg.asset.code}.` : null,
    from,
    float,
    ...base,
  };
}
