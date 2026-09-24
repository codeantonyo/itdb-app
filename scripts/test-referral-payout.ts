// Self-check for referral payouts. Run: npx tsx --tsconfig tsconfig.json scripts/test-referral-payout.ts
import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import type { DbShape } from "@/lib/server/db";
import { claimPayouts as claim, configProblem, payoutConfig, walkBack, type Effect, type PayoutConfig } from "@/lib/server/referral-payout";

const T = Date.UTC(2026, 8, 22, 12);
const BOTH = new Set(["bob", "carol"]);
const claimPayouts = (db: DbShape, c: PayoutConfig, now: number) => claim(db, c, now, BOTH);
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
assert.equal(env.dailyCap, 100_000, "works with no cap set");
assert.equal(
  payoutConfig({ ITDB_SECRET: cfg.secret } as unknown as NodeJS.ProcessEnv)?.secret,
  cfg.secret,
  "ITDB_SECRET alone switches payouts on",
);
assert.equal(
  payoutConfig({ DISTRIBUTOR_SECRET: cfg.secret } as unknown as NodeJS.ProcessEnv),
  null,
  "the airdrop distributor key is never used for ITDB",
);
const other = Keypair.random().secret();
assert.equal(
  payoutConfig({ ITDB_SECRET: cfg.secret, ITDB_REWARDS_SECRET: other } as unknown as NodeJS.ProcessEnv)?.secret,
  other,
  "a dedicated rewards key overrides it",
);
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

// --- anti-farming: nothing pays until the hold is proven ---------------
const db6 = fresh();
assert.equal(claim(db6, cfg, T, new Set()).length, 0, "qualified but hold not proven: nothing");
const only = claim(db6, { ...cfg, dailyCap: 10_000 }, T, new Set(["bob"]));
assert.deepEqual(only.map((c) => c.key), ["bob:referee"], "proven hold pays; cap allows one side");
Object.assign(db6.referralPayouts["bob:referee"], { status: "paid", paidAt: T });
assert.deepEqual(
  claim(db6, cfg, T + 25 * 60 * MIN, new Set()).map((c) => c.key),
  ["bob:referrer"],
  "the other side follows without a second hold check",
);

// --- the hold walk: balance history rebuilt from effects ----------------
const A = cfg.asset;
const at = (h: number) => new Date(T - h * 3_600_000).toISOString();
const cr = (h: number, amount: number): Effect => ({ type: "account_credited", created_at: at(h), amount: String(amount), asset_code: A.code, asset_issuer: A.issuer });
const db_ = (h: number, amount: number): Effect => ({ type: "account_debited", created_at: at(h), amount: String(amount), asset_code: A.code, asset_issuer: A.issuer });
const since = T - 7 * 24 * 3_600_000;
const start = (b: number) => ({ bal: b, min: b, reached: false });
// Held 12,000 since before the window: low point 12,000.
assert.equal(walkBack(start(12_000), [cr(200, 12_000)], since, A)?.min, 12_000);
// Bag arrived 2 days ago: before that the wallet held 0.
assert.equal(walkBack(start(12_000), [cr(48, 12_000)], since, A)?.min, 0, "fresh bag: not held for the window");
// Moved out and back mid-window (the farm): low point 0.
assert.equal(walkBack(start(10_000), [cr(24, 10_000), db_(72, 10_000), cr(200, 10_000)], since, A)?.min, 0, "out and back resets");
// Bought on the DEX 10 days ago, other assets ignored.
const buy: Effect = { type: "trade", created_at: at(240), bought_asset_code: A.code, bought_asset_issuer: A.issuer, bought_amount: "10000", sold_asset_code: undefined, sold_amount: "50" };
const junk: Effect = { type: "account_credited", created_at: at(5), amount: "999", asset_code: "XRP", asset_issuer: "GX" };
assert.equal(walkBack(start(10_000), [junk, buy], since, A)?.min, 10_000, "a buy before the window counts");
assert.equal(walkBack(start(10_000), [{ type: "liquidity_pool_deposited", created_at: at(3) }], since, A), null, "pools are not followed");

console.log("ok — payouts: off without a key, both sides once, capped, in-flight never re-claimed, timeouts recovered by memo, nothing before a proven 7-day hold");
