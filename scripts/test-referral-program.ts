// Self-check for the referral program (Oct 2026), against the real code.
// Run: npx tsx --tsconfig tsconfig.json scripts/test-referral-program.ts
import assert from "node:assert/strict";
import type { DbShape } from "@/lib/server/db";
import { countedReferees, creditsOf, giveawayBoard, ladderBonus, topReferrers } from "@/lib/server/referral-program";

const OCT = Date.UTC(2026, 9, 10);
const DAY = 86_400_000;
const acct = (id: string, referredBy: string | null, createdAt: number) => ({
  id, username: id, referralCode: `ITDB-${id.toUpperCase()}`, referredBy, createdAt, wallets: [`G${id}`],
});

// Alice refers 6 friends; 5 of them buy 100 XLM.
const friends = ["b", "c", "d", "e", "f", "g"].map((id, i) => acct(id, "ITDB-A", OCT + i * DAY));
const db = {
  accounts: [acct("a", null, OCT - 60 * DAY), ...friends],
  referralBuys: Object.fromEntries(["b", "c", "d", "e", "f"].map((id, i) => [id, { at: OCT + i * DAY + 3_600_000, xlm: 100 }])),
  referralChoices: { a: { "join:b": "QRS" }, b: { "join:me": "ITDBATMS" } },
} as unknown as DbShape;
const me = db.accounts[0];

// --- credits: both sides, JOIN 250 and BUY 1,000 USDC + 1,000 tokens ----------
const { credits, qualified, step } = creditsOf(db, me);
assert.equal(credits.filter((c) => c.kind === "join").length, 6, "250 tokens for every friend who joined");
assert.equal(credits.filter((c) => c.kind === "buy").length, 5, "the big reward only once they buy 100 XLM");
assert.equal(credits.find((c) => c.key === "join:b")?.token, "QRS", "the ICO each member picked");
assert.equal(qualified, 5);
assert.equal(step?.friends, 5);
assert.equal(credits.find((c) => c.kind === "ladder")?.usdc, 5_000, "5 friends → 5,000 USDC");
assert.equal(credits.reduce((t, c) => t + c.usdc, 0), 5 * 1_000 + 5_000);
const bob = creditsOf(db, db.accounts[1]).credits;
assert.deepEqual(bob.map((c) => [c.key, c.token]).sort(), [["buy:me", null], ["join:me", "ITDBATMS"]], "the friend gets the same");
assert.deepEqual(ladderBonus(db, "a"), { atms: 1, vaults: 1 }, "1 ATM + 1 VAULT at 5 friends");

// --- boards ---------------------------------------------------------------------
assert.equal(topReferrers(db, 2026, 9)[0].count, 5, "top referrers count friends who invested this month");
assert.equal(topReferrers(db, 2026, 10).length, 0, "and only this month");
assert.equal(giveawayBoard(db)[0].count, 6, "the giveaway counts new members who joined in October");

// --- max 50 a day ---------------------------------------------------------------
const flood = Array.from({ length: 60 }, (_, i) => acct(`z${i}`, "ITDB-A", OCT + i));
const big = { ...db, accounts: [me, ...flood] } as unknown as DbShape;
assert.equal(countedReferees(big, me).length, 50, "only 50 referrals a day count");

console.log("ok — referral program: join + buy credits both sides, ICO picks, ladder, boards by month, 50/day cap");
