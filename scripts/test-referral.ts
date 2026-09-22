// Self-check for the referral rules. Run: npx tsx --tsconfig tsconfig.json scripts/test-referral.ts
import assert from "node:assert/strict";
import type { DbAccount, DbShape } from "@/lib/server/db";
import { REFERRAL_TOKENS, REFERRAL_WINDOW_MS, leaderboard, newAwards, referralProblem, refereesOf } from "@/lib/server/referral";

const NOW = Date.UTC(2026, 8, 22, 12);
const acct = (id: string, code: string, wallets: string[], extra: Partial<DbAccount> = {}) =>
  ({ id, referralCode: code, wallets, createdAt: NOW - 3_600_000, referredBy: null, username: id, ...extra }) as DbAccount;

const alice = acct("alice", "ITDB-ALICE1", ["GA_ALICE"]);
const bob = acct("bob", "ITDB-BOB111", ["GA_BOB"], { referredBy: "ITDB-ALICE1" });
const db = { accounts: [alice, bob], referralAwards: {} } as unknown as DbShape;
const fresh = acct("carol", "ITDB-CAROL1", ["GA_CAROL"]);

assert.equal(referralProblem(db, fresh, "ITDB-ALICE1", NOW), null, "a real code, fresh account: ok");
assert.equal(referralProblem(db, fresh, "itdb-alice1 ", NOW), null, "case and spaces do not matter");
assert.match(referralProblem(db, fresh, "ITDB-NOPE99", NOW)!, /does not match/, "made-up codes are refused");
assert.match(referralProblem(db, alice, "ITDB-ALICE1", NOW)!, /own code/, "own code refused");
assert.match(referralProblem(db, acct("dup", "ITDB-DUP111", ["GA_ALICE"]), "ITDB-ALICE1", NOW)!, /sharing/, "shared wallet refused");
assert.match(referralProblem(db, alice, "ITDB-BOB111", NOW)!, /referred you/, "no referral rings");
assert.match(referralProblem(db, bob, "ITDB-CAROL1", NOW)!, /already have/, "one referrer per account");
assert.match(
  referralProblem(db, { ...fresh, createdAt: NOW - REFERRAL_WINDOW_MS - 1 }, "ITDB-ALICE1", NOW)!,
  /24 hours/,
  "after 24 hours, no code",
);
assert.equal(referralProblem(db, { ...fresh, createdAt: NOW - REFERRAL_WINDOW_MS }, "ITDB-ALICE1", NOW), null, "exactly 24h still counts");

assert.deepEqual(refereesOf(db, alice).map((a) => a.id), ["bob"]);

// Tier 2 of each token, straight from the ladders.
assert.deepEqual(
  Object.fromEntries(REFERRAL_TOKENS.map((t) => [t.token.code, t.tier2])),
  { ITDB: 501, ITDBONE: 2_500, QRS: 25_000, ITDBVAULT: 4_000 },
);

// Leaderboard: by referrals that QUALIFIED this month; ties go to the earlier.
const aw = (referrerId: string, at: number) => [{ token: "ITDB", amount: 1, at, referrerId, wallets: [] }];
const sep = (d: number) => Date.UTC(2026, 8, d);
const lb = {
  accounts: [alice, bob, acct("zed", "ITDB-ZED111", ["GA_Z"])],
  referralAwards: {
    r1: aw("alice", sep(3)), r2: aw("alice", sep(20)),
    r3: aw("bob", sep(4)), r4: aw("bob", sep(10)),
    r5: aw("zed", Date.UTC(2026, 7, 30)), // August — not September
  },
} as unknown as DbShape;
const sept = leaderboard(lb, 2026, 8);
assert.deepEqual(sept.map((r) => [r.accountId, r.qualified]), [["bob", 2], ["alice", 2]], "tie: bob got to 2 first");
assert.equal(leaderboard(lb, 2026, 7)[0].accountId, "zed", "last month kept separate");

// Awards: once per token per referee, and once per (wallet, token) network-wide.
const empty = { accounts: [], referralAwards: {} } as unknown as DbShape;
const due = [{ code: "ITDB", amount: 10_000, wallets: ["GA_W1"] }, { code: "QRS", amount: 30_000, wallets: ["GA_W1"] }];
const first = newAwards(empty, "bob", "alice", due, NOW);
assert.deepEqual(first.map((a) => [a.token, a.amount, a.referrerId]), [["ITDB", 10_000, "alice"], ["QRS", 30_000, "alice"]], "10,000 ITDB matched 1:1");

const after = { accounts: [], referralAwards: { bob: first } } as unknown as DbShape;
assert.equal(newAwards(after, "bob", "alice", due, NOW).length, 0, "reading again awards nothing twice");
assert.equal(newAwards(after, "sock-puppet", "alice", due, NOW).length, 0, "the same funded wallet on a new account earns nothing");
assert.equal(
  newAwards(after, "dave", "alice", [{ code: "ITDB", amount: 900, wallets: ["GA_DAVE"] }], NOW).length, 1,
  "a genuinely different wallet still counts",
);
assert.equal(newAwards(empty, "bob", "alice", [...due, due[0]], NOW).length, 2, "a token listed twice matches once");

console.log("ok — referral: real codes only, no self/shared-wallet/rings, 24h window, Tier 2 per token, fair ties");
