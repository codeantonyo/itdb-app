// Self-check for the ITDB ATMS rules, against the real code.
// Run: npx tsx --tsconfig tsconfig.json scripts/test-atms.ts
import assert from "node:assert/strict";
import {
  ATM_CITIES, ATM_TIERS, TOTAL_ATMS, atmEntitlement, atmStage, atmTierFor, firstToReach, placementProblem, presaleWindow,
} from "@/lib/itdb/atms";
import { MAP_HEIGHT, MAP_WIDTH } from "@/lib/itdb/world-map";

// --- the network --------------------------------------------------------
assert.equal(ATM_CITIES.length, 80);
assert.equal(new Set(ATM_CITIES.map((c) => c.city)).size, 80, "no city twice");
assert.equal(new Set(ATM_CITIES.map((c) => c.country)).size, 32, "32 countries");
assert.equal(TOTAL_ATMS, 4_000);
assert.ok(ATM_CITIES.every((p) => p.x > 0 && p.x < MAP_WIDTH && p.y > 0 && p.y < MAP_HEIGHT), "pins on the map");

// --- tiers ----------------------------------------------------------------
assert.equal(atmTierFor(999), null);
assert.equal(atmTierFor(1_000)?.atms, 1);
assert.equal(atmTierFor(24_999)?.tier, 3);
assert.equal(atmTierFor(1_000_000)?.tier, 10);
assert.deepEqual(ATM_TIERS.map((t) => t.atms), [1, 3, 5, 10, 20, 30, 40, 60, 80, 100]);

// --- the worked example: 15,000 bought in the pre-sale --------------------
const during = atmEntitlement({ holding: 15_000, presaleBought: 15_000, presaleEnded: false, sold: 0 });
assert.equal(during.tier?.tier, 3);
assert.equal(during.multiplier, 15);
assert.equal(during.allowed, 75, "5 × 15 = 75");
// Pre-sale over: tokens double → 30,000 → Tier 4 (10 ATMs, not 5 + 10), multiplier stays 15.
const after = atmEntitlement({ holding: 15_000, presaleBought: 15_000, presaleEnded: true, sold: 0 });
assert.equal(after.tier?.tier, 4, "tier updates with the doubled tokens");
assert.equal(after.multiplier, 15, "doubling does not raise the multiplier");
assert.equal(after.allowed, 150);
// Bought after the pre-sale: no multiplier, no doubling.
assert.equal(atmEntitlement({ holding: 15_000, presaleBought: 0, presaleEnded: true, sold: 0 }).allowed, 5);
assert.equal(atmEntitlement({ holding: 999, presaleBought: 999, presaleEnded: true, sold: 0 }).allowed, 0, "below Tier 1");

// --- milestone waves replace, never add -----------------------------------
assert.equal(atmStage(249_999), null);
assert.equal(atmStage(500_000)?.extraPer10k, 20);
const wave = atmEntitlement({ holding: 25_000, presaleBought: 0, presaleEnded: true, sold: 760_000 });
assert.equal(wave.waveExtra, 2 * 50, "75% wave: 50 per 10,000 held, not 10+20+50");
assert.equal(wave.allowed, 10 + 100);

// --- placing ATMs -----------------------------------------------------------
assert.equal(placementProblem("Paris", 3, {}, 47, 5), null, "fills the city exactly");
assert.match(placementProblem("Paris", 4, {}, 47, 5)!, /left/);
assert.match(placementProblem("Paris", 1, {}, 50, 5)!, /full/);
assert.match(placementProblem("Paris", 3, { Rome: 3 }, 0, 5)!, /placed elsewhere/, "spread across cities, never past what you own");
assert.equal(placementProblem("Paris", 0, { Paris: 3 }, 50, 0), null, "taking ATMs back is always allowed");
assert.match(placementProblem("Atlantis", 1, {}, 0, 5)!, /80 cities/);

// --- the chain decides the pre-sale and the seats --------------------------
const T = Date.UTC(2026, 9, 6);
const sales = [
  { wallet: "A", amount: 6_000, at: T },
  { wallet: "B", amount: 12_000, at: T + 1 },
  { wallet: "A", amount: 6_000, at: T + 2 },
];
assert.deepEqual(presaleWindow(sales), { startsAt: T, endsAt: T + 48 * 3_600_000 });
assert.equal(presaleWindow([]), null, "no sale yet, no window");
assert.deepEqual([...firstToReach(sales, 10_000, 100)], ["B", "A"], "in the order they reached Tier 3");
assert.deepEqual([...firstToReach(sales, 10_000, 1)], ["B"], "seats run out");

console.log("ok — atms: 80 cities / 32 countries, tiers, 15k pre-sale = 75 then 150 ATMs, waves replace, placement limits, chain-ordered seats");
