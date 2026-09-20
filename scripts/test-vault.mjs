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

// --- the ITDBVAULT ladder --------------------------------------------
const tiers = readFileSync("src/lib/itdb/vault-tiers.ts", "utf8");
const mins = [...tiers.matchAll(/^  t\((\d+), "[^"]+", ([\d_]+),/gm)].map((m) => ({
  tier: +m[1],
  min: Number(m[2].replace(/_/g, "")),
}));
assert.equal(mins.length, 10, "ten vault tiers");
assert.deepEqual(
  mins.map((x) => x.min),
  [2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 256_000, 512_000, 1_000_000],
  "thresholds match the published table",
);
assert.ok(
  mins.every((x, i) => i === 0 || x.min > mins[i - 1].min),
  "thresholds only ever rise, so every tier is reachable",
);
// Tier 1 opens at exactly one vault's allocation, Tier 10 at the supply.
assert.equal(mins[0].min, supply / TOTAL, "Tier 1 == one vault of tokens");
assert.equal(mins[9].min, supply, "Tier 10 == the whole supply");

const tierFor = (b) => (b > 0 ? [...mins].reverse().find((x) => b >= x.min) ?? null : null);
assert.equal(tierFor(0), null, "no holding, no tier");
assert.equal(tierFor(1_999), null, "just under Tier 1 is still nothing");
assert.equal(tierFor(2_000).tier, 1);
assert.equal(tierFor(3_999).tier, 1, "the top of Tier 1 is still Tier 1");
assert.equal(tierFor(4_000).tier, 2);
assert.equal(tierFor(1_000_000).tier, 10);
assert.equal(tierFor(9_999_999).tier, 10, "above the top stays at the top");

// The early-bird discount halves thresholds == reading at twice the holding.
const DIVISOR = 2;
assert.equal(tierFor(1_000 * DIVISOR).tier, 1, "an early bird reaches Tier 1 at 1,000");
assert.equal(tierFor(2_000 * DIVISOR).tier, 2, "and Tier 2 at 2,000");
assert.equal(needed(4_000, 1_000, 2_000), 1_000, "50% off: 1,000 real tokens to Tier 2");

console.log(
  `ok — ${cities.length} branches x ${PER_CITY}, ${supply.toLocaleString("en-US")} tokens, ` +
    `${mins.length} tiers, stages clamp, numbers unique, tier discount scales`,
);
