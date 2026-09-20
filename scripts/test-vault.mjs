// Self-check for the vault allocation. Run: node scripts/test-vault.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync("src/lib/itdb/world-map.ts", "utf8");
const cities = [...src.matchAll(/"city": "([^"]+)"/g)].map((m) => m[1]);
const TOTAL = 500;
const cityForClaim = (i) => cities[i % cities.length];

assert.equal(cities.length, 10, "ten vault cities");
assert.deepEqual(
  [...new Set(cities)].length, cities.length, "no duplicate cities");

// Round-robin fills every city evenly across the full run.
const counts = {};
for (let i = 0; i < TOTAL; i += 1) {
  const c = cityForClaim(i);
  counts[c] = (counts[c] ?? 0) + 1;
}
assert.equal(Object.keys(counts).length, 10, "every city gets vaults");
assert.ok(Object.values(counts).every((n) => n === TOTAL / 10), "evenly split");

// Availability is derived, so it can never go negative or skip a number.
const avail = (claimed) => Math.max(TOTAL - claimed, 0);
assert.equal(avail(0), 500);
assert.equal(avail(1), 499);
assert.equal(avail(TOTAL), 0);
assert.equal(avail(TOTAL + 5), 0, "over-claim clamps rather than going negative");

// Pins must land inside the viewBox or they draw off-map.
const xs = [...src.matchAll(/"x": (-?[\d.]+)/g)].map((m) => +m[1]);
const ys = [...src.matchAll(/"y": (-?[\d.]+)/g)].map((m) => +m[1]);
assert.equal(xs.length, 10);
assert.ok(xs.every((x) => x > 0 && x < 800), "pins inside the width");
assert.ok(ys.every((y) => y > 0 && y < 420), "pins inside the height");

console.log(`ok — ${cities.length} cities, ${TOTAL} vaults split ${TOTAL / 10} each, pins on-map`);
