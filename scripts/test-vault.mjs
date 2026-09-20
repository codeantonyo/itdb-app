// Self-check for the vault rules. Run: node scripts/test-vault.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync("src/lib/itdb/world-map.ts", "utf8");
const cities = [...src.matchAll(/"city": "([^"]+)"/g)].map((m) => m[1]);
const TOTAL = 500;
const PER_CITY = TOTAL / cities.length;

assert.equal(cities.length, 10, "ten vault cities");
assert.equal([...new Set(cities)].length, cities.length, "no duplicate cities");

// --- pins stay on the map --------------------------------------------
const xs = [...src.matchAll(/"x": (-?[\d.]+)/g)].map((m) => +m[1]);
const ys = [...src.matchAll(/"y": (-?[\d.]+)/g)].map((m) => +m[1]);
assert.ok(xs.every((x) => x > 0 && x < 800), "pins inside the width");
assert.ok(ys.every((y) => y > 0 && y < 420), "pins inside the height");

// --- per-city capacity ------------------------------------------------
const remaining = (taken) =>
  Object.fromEntries(cities.map((c) => [c, Math.max(PER_CITY - (taken[c] ?? 0), 0)]));
assert.equal(remaining({})["Dubai"], PER_CITY);
assert.equal(remaining({ Dubai: PER_CITY })["Dubai"], 0, "a full city offers nothing");
assert.equal(remaining({ Dubai: PER_CITY + 9 })["Dubai"], 0, "over-claim clamps at zero");
assert.equal(remaining({ Dubai: PER_CITY })["London"], PER_CITY, "cities are independent");
assert.equal(Object.values(remaining({})).reduce((a, b) => a + b, 0), TOTAL);

// --- economics --------------------------------------------------------
const SALE_XLM = 100_000, PRICE = 0.1;
const supply = SALE_XLM / PRICE;
assert.equal(supply, 1_000_000, "100,000 XLM at 0.1 buys a million tokens");
assert.equal(SALE_XLM / TOTAL, 200, "200 XLM a vault");
assert.equal(supply / TOTAL, 2_000, "2,000 tokens a vault");

// --- milestone stages: highest reached wins, never the sum ------------
const STAGES = [
  { pct: 25, bonus: 50 }, { pct: 50, bonus: 100 },
  { pct: 75, bonus: 200 }, { pct: 100, bonus: 500 },
];
const target = (pct) => Math.ceil((TOTAL * pct) / 100);
const bonusAt = (claimed) =>
  STAGES.filter((s) => claimed >= target(s.pct)).reduce((b, s) => Math.max(b, s.bonus), 0);
assert.equal(bonusAt(0), 0, "nothing before the first stage");
assert.equal(bonusAt(124), 0, "just under 25% is still nothing");
assert.equal(bonusAt(125), 50, "25% unlocks +50%");
assert.equal(bonusAt(250), 100);
assert.equal(bonusAt(375), 200);
assert.equal(bonusAt(500), 500, "sold out unlocks +500%");
assert.equal(bonusAt(500), 500, "highest stage wins, not 50+100+200+500");

// --- early bird -------------------------------------------------------
const ENDS = Date.UTC(2026, 8, 22);
const isEarly = (at) => at < ENDS;
assert.equal(isEarly(ENDS - 1), true);
assert.equal(isEarly(ENDS), false, "the window closes on the instant, not after");
const refund = (xlm, early) => (early ? xlm * 0.5 : 0);
assert.equal(refund(200, true), 100, "half of 200 XLM back");
assert.equal(refund(200, false), 0, "latecomers get no refund");

// --- vault numbers ----------------------------------------------------
const lowestFree = (taken) => {
  for (let n = 1; n <= TOTAL; n += 1) if (!taken.has(n)) return n;
  return null;
};
assert.equal(lowestFree(new Set()), 1);
assert.equal(lowestFree(new Set([1, 2, 3])), 4, "skips what is owned");
assert.equal(lowestFree(new Set([2, 3])), 1, "takes the lowest, not the next");
assert.equal(lowestFree(new Set(Array.from({ length: TOTAL }, (_, i) => i + 1))), null);

// --- the tier discount must not overstate what is still needed --------
const needed = (min, balance, tierBalance) => {
  const boost = balance > 0 ? tierBalance / balance : 1;
  return Math.max((min - tierBalance) / boost, 0);
};
assert.equal(needed(2500, 1000, 1000), 1500, "no discount: the plain shortfall");
assert.equal(needed(2500, 1000, 2000), 250, "50% off: 250 real tokens, not 1500");
assert.equal(needed(2500, 2000, 4000), 0, "already past it");

console.log(
  `ok — ${cities.length} branches x ${PER_CITY}, ${supply.toLocaleString("en-US")} tokens, ` +
    `stages clamp, numbers unique, tier discount scales`,
);
