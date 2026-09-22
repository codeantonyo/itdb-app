import { randomBytes } from "crypto";
import { Asset, BASE_FEE, Horizon, Keypair, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { ITDB_TOKEN } from "@/lib/stellar/registry";
import { mutateDb, type DbShape, type ReferralPayout } from "./db";

/**
 * REAL ON-CHAIN referral rewards — ITDB sent from a rewards account.
 *
 * Every qualified referral pays REWARD_PER_REFERRAL ITDB to the referrer
 * and the same to the new member. Nothing is sent unless
 * ITDB_REWARDS_SECRET is set in the environment, so this ships switched
 * off and is switched on by whoever adds that key in Vercel.
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
  const secret = env.ITDB_REWARDS_SECRET?.trim();
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
    return "ITDB_REWARDS_SECRET is not a valid Stellar secret key.";
  }
  if (pub === cfg.asset.issuer)
    return "ITDB_REWARDS_SECRET is the ITDB issuer — that would mint. Use a funded rewards account.";
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
 */
export function claimPayouts(db: DbShape, cfg: PayoutConfig, now: number): Claimed[] {
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
  | { ok: false; error: string; landed: false | "unknown" };

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
    return { ok: false, error: "Could not load the rewards account.", landed: false };
  }
  const float = source.balances.find((b) => has(b as { asset_code?: string; asset_issuer?: string }));
  if (!float || Number(float.balance) < amount)
    return { ok: false, error: `Rewards account is short of ${cfg.asset.code} — top it up.`, landed: false };

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

  const claimed = await mutateDb((db) => claimPayouts(db, cfg, now));

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
