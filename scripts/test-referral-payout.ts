// Self-check for referral payouts. Run: npx tsx --tsconfig tsconfig.json scripts/test-referral-payout.ts
import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import type { DbShape } from "@/lib/server/db";
import { claimPayouts, configProblem, payoutConfig, type PayoutConfig } from "@/lib/server/referral-payout";

const T = Date.UTC(2026, 8, 22, 12);
const MIN = 60_000;
const cfg: PayoutConfig = {
  secret: Keypair.random().secret(), perReferral: 10_000, dailyCap: 30_000,
  horizon: "", passphrase: "", asset: { code: "ITDB", issuer: "GAOMNM2FIHY4KI52DW7UNME4LBZTYFGDH6VKZSWBY77IFZ4HZ7ANITDB" },
};
const acct = (id: string, wallet: string) => ({ id, wallets: [wallet] });
const qualified = (referee: string, referrer: string) => [{ token: "ITDB", amount: 600, at: T, referrerId: referrer, wallets: [] }];
const fresh = (): DbShape =>
  ({
    accounts: [acct("alice", "GA_A"), acct("bob", "GA_B"), acct("carol", "GA_C"), acct("dave", "GA_D")],
    referralAwards: { bob: qualified("bob", "alice"), carol: qualified("carol", "alice") },
    referralPayouts: {},
  }) as unknown as DbShape;

// --- off by default ---------------------------------------------------
assert.equal(payoutConfig({} as NodeJS.ProcessEnv), null, "no key, no payouts");
assert.equal(payoutConfig({ ITDB_REWARDS_SECRET: cfg.secret, ITDB_REWARDS_PAUSED: "1" } as unknown as NodeJS.ProcessEnv), null, "pause switch");
const env = payoutConfig({ ITDB_REWARDS_SECRET: cfg.secret } as unknown as NodeJS.ProcessEnv)!;
assert.equal(env.perReferral, 10_000, "10,000 ITDB per side by default");
assert.equal(env.passphrase, "Public Global Stellar Network ; September 2015", "mainnet unless told otherwise");
assert.equal(configProblem(cfg), null);
assert.match(configProblem({ ...cfg, secret: "not-a-key" })!, /not a valid/);
assert.match(configProblem({ ...cfg, dailyCap: 5_000 })!, /cap/);

// --- both sides of each qualified referral, once ----------------------
const db = fresh();
const run1 = claimPayouts(db, cfg, T);
assert.deepEqual(run1.map((c) => c.key).sort(), ["bob:referee", "bob:referrer", "carol:referee"], "cap 30k = 3 payments");
assert.deepEqual(run1.map((c) => c.payout.wallet).sort(), ["GA_A", "GA_B", "GA_C"], "referrer and referee each paid to their wallet");
assert.ok(run1.every((c) => c.payout.status === "pending" && !c.recover), "claimed as pending before sending");

// A second run straight after — while those are in flight — claims nothing:
// the in-flight three are skipped, and the cap is spent.
assert.equal(claimPayouts(db, cfg, T + MIN).length, 0, "never double-claims in-flight payouts");

// Mark them paid; the next day the cap has room for carol's referrer side.
for (const c of run1) Object.assign(db.referralPayouts[c.key], { status: "paid", paidAt: T + MIN });
const run2 = claimPayouts(db, cfg, T + 25 * 60 * MIN);
assert.deepEqual(run2.map((c) => c.key), ["carol:referrer"], "cap rolls over; paid ones are never repeated");

// --- a send that timed out stays pending and is RECOVERED, not re-sent blind
const db2 = fresh();
const [first] = claimPayouts(db2, { ...cfg, dailyCap: 10_000 }, T);
assert.equal(
  claimPayouts(db2, cfg, T + 5 * MIN).some((c) => c.key === first.key),
  false,
  "within the window the in-flight one is left alone",
);
const later = claimPayouts(db2, cfg, T + 11 * MIN).find((c) => c.key === first.key)!;
assert.equal(later.recover, true, "after the window it is flagged for an on-chain memo check");
assert.equal(later.payout.id, first.payout.id, "same id — so the same memo — every attempt");

// --- a definite failure waits an hour, keeps its id --------------------
const db3 = fresh();
const big = { ...cfg, dailyCap: 100_000 };
const [f] = claimPayouts(db3, { ...cfg, dailyCap: 10_000 }, T);
Object.assign(db3.referralPayouts[f.key], { status: "failed", error: "no trustline" });
assert.equal(claimPayouts(db3, big, T + 30 * MIN).some((c) => c.key === f.key), false, "no retry before an hour");
const retry = claimPayouts(db3, big, T + 61 * MIN).find((c) => c.key === f.key)!;
assert.equal(retry.payout.id, f.payout.id, "retry keeps its id");
assert.equal(retry.payout.attempts, 2);

// --- a full cap blocks new payments but never a recovery ---------------
const db5 = fresh();
claimPayouts(db5, cfg, T); // spends the whole 30k cap, all three left pending
const stuck = claimPayouts(db5, cfg, T + 11 * MIN);
assert.equal(stuck.length, 3, "all three stuck payouts are still checked");
assert.ok(stuck.every((c) => c.recover), "as recoveries, not new sends");

// --- unqualified referrals pay nothing ---------------------------------
const db4 = { ...fresh(), referralAwards: { bob: [] } } as unknown as DbShape;
assert.equal(claimPayouts(db4, cfg, T).length, 0, "no Tier 2, no reward");

console.log("ok — payouts: off without a key, both sides once, capped, in-flight never re-claimed, timeouts recovered by memo");
