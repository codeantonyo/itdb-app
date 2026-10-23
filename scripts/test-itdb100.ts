// Self-check for the ITDB 100 rules, against the real code.
// Run: npx tsx --tsconfig tsconfig.json scripts/test-itdb100.ts
import assert from "node:assert/strict";
import { accruedDividend, earlyStep, gateTimes, i100TierFor, isEarly, walletDue } from "@/lib/itdb/itdb100";
import { readI100 } from "@/lib/server/itdb100-chain";

const H = 3_600_000;
const DAY = 24 * H;
const OPEN = Date.UTC(2026, 9, 24, 12);

// Early birds' 0.5 orders fill in the opening ledger; then the public sale at 1 XLM.
const sales = [
  { wallet: "A", amount: 200, xlm: 100, at: OPEN }, // 100 XLM early
  { wallet: "B", amount: 12_000, xlm: 6_000, at: OPEN }, // 6,000 XLM early
  { wallet: "C", amount: 50, xlm: 50, at: OPEN }, // a 1 XLM order waiting at launch — still early
  { wallet: "A", amount: 15_000, xlm: 15_000, at: OPEN + H }, // public, takes the total past 25%
  { wallet: "D", amount: 1_000, xlm: 1_000, at: OPEN + 2 * H }, // public, after the 25% gate
];

// --- early birds ------------------------------------------------------------
assert.ok(isEarly(sales[2], OPEN), "an order waiting at the opening fill is early, whatever its price");
assert.ok(!isEarly(sales[3], OPEN), "a 1 XLM buy after opening is public");
assert.equal(earlyStep(99), null);
assert.equal(earlyStep(100)?.pct, 100);
assert.equal(earlyStep(6_000)?.pct, 300);
const gates = gateTimes(sales);
assert.equal(gates[25], OPEN + H, "25% (25,000) crossed by A's public buy");
assert.equal(gates[50], null);
const a = walletDue("A", sales, gates);
assert.equal(a.earlyTokens, 200);
assert.equal(a.earlyBonus, 200 * (100 + 100) / 100, "100 XLM: +100% bonus + the doubling");
assert.equal(walletDue("B", sales, gates).earlyBonus, 12_000 * 4, "5,000+ XLM: +300% + doubling = quadrupled on top");
assert.equal(walletDue("C", sales, gates).earlyBonus, 50, "under 100 XLM: no step, still doubled");

// --- gates: % of what was bought by the moment the gate opened --------------
assert.equal(a.gateBonus[25], 15_200, "A had 15,200 when 25% opened → +100%");
assert.equal(walletDue("D", sales, gates).gateBonus[25], undefined, "bought after the gate: not that gate's bonus");

// --- tiers and the dividend ---------------------------------------------------
assert.equal(i100TierFor(99), null);
assert.equal(i100TierFor(100)?.tier, 1);
assert.equal(i100TierFor(100_000)?.tier, 10);
// Tier 1 for a day as an early bird (2x), then the 25% gate opens (3x — the highest wins).
const reached = { 1: OPEN };
const paid = accruedDividend(reached, { 25: OPEN + DAY, 50: null, 75: null, 100: null }, OPEN, OPEN + 2 * DAY);
assert.equal(paid, 25_000 * 2 + 25_000 * 3, "2x the first day, 3x the second — not 2 + 3");

// --- bonus payments are not sales ----------------------------------------------
const D = "GBAR5C4B6JZIWWD2E5BZHVZM3HZUTZIVZ3HWDFFOV2Q3RKDYSJL44QFS";
const ISS = "GC2SCEDYLDH6ZYNQOL7HBMFIH73U4RVYGXHC6P64YQ3BUHKXTTQQITDB";
const pay = (to: string, amount: string, memo: string) =>
  ({ type: "payment", from: D, to, amount, asset_code: "ITDB100", asset_issuer: ISS, created_at: "2026-10-25T00:00:00Z",
     transaction_hash: "h", transaction: { memo } }) as never;
const chain = readI100([], [pay("A", "400", "I100 EB"), pay("E", "50", "")]);
assert.deepEqual(chain.sales.map((s) => s.wallet), ["E"]);
assert.equal(chain.bonuses[0].memo, "I100 EB");

console.log("ok — itdb100: early birds by opening fill or 0.5 price, steps + doubling, gates by time opened and cumulative, ratchet dividend, bonuses kept out of sales");
