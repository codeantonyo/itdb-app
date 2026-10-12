// Self-check for the ITDB ATMS rules, against the real code.
// Run: npx tsx --tsconfig tsconfig.json scripts/test-atms.ts
import assert from "node:assert/strict";
import {
  ATM_CITIES, ATM_TIERS, TOTAL_ATMS, atmEntitlement, atmStage, atmTierFor, firstToReach, placementProblem, presaleWindow,
} from "@/lib/itdb/atms";
import { MAP_HEIGHT, MAP_WIDTH } from "@/lib/itdb/world-map";
import { readDistributor } from "@/lib/server/atm-sales";

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
const during = atmEntitlement({ discountBought: 0, discountEnded: false, boughtBefore: false, paid: { presale: 0, discount: 0 }, holding: 15_000, presaleBought: 15_000, presaleEnded: false, sold: 0 });
assert.equal(during.tier?.tier, 3);
assert.equal(during.multiplier, 15);
assert.equal(during.allowed, 75 + 10, "5 × 15 = 75, plus the 10 free");
// Pre-sale over: tokens double → 30,000 → Tier 4 (10 ATMs, not 5 + 10), multiplier stays 15.
const after = atmEntitlement({ discountBought: 0, discountEnded: false, boughtBefore: false, paid: { presale: 0, discount: 0 }, holding: 15_000, presaleBought: 15_000, presaleEnded: true, sold: 0 });
assert.equal(after.tier?.tier, 4, "tier updates with the doubled tokens");
assert.equal(after.multiplier, 15, "doubling does not raise the multiplier");
assert.equal(after.allowed, 150 + 10);
// Bought after the pre-sale: no multiplier, no doubling.
assert.equal(atmEntitlement({ discountBought: 0, discountEnded: false, boughtBefore: false, paid: { presale: 0, discount: 0 }, holding: 15_000, presaleBought: 0, presaleEnded: true, sold: 0 }).allowed, 5 + 10);
assert.equal(atmEntitlement({ discountBought: 0, discountEnded: false, boughtBefore: false, paid: { presale: 0, discount: 0 }, holding: 999, presaleBought: 999, presaleEnded: true, sold: 0 }).allowed, 10, "below Tier 1: only the 10 free");

// --- milestone waves replace, never add -----------------------------------
assert.equal(atmStage(249_999), null);
assert.equal(atmStage(500_000)?.extraPer10k, 20);
const wave = atmEntitlement({ discountBought: 0, discountEnded: false, boughtBefore: false, paid: { presale: 0, discount: 0 }, holding: 25_000, presaleBought: 0, presaleEnded: true, sold: 760_000 });
assert.equal(wave.waveExtra, 2 * 50, "75% wave: 50 per 10,000 held, not 10+20+50");
assert.equal(wave.allowed, 10 + 100 + 10);

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
const END = Date.parse("2026-10-05T16:00:00Z");
const OPEN = Date.parse("2026-10-05T16:56:52Z");
const w = presaleWindow([{ wallet: "A", amount: 1_000, at: OPEN }, { wallet: "B", amount: 1_000, at: OPEN + 60_000 }]);
assert.equal(w.startsAt, END - 48 * 3_600_000, "48 hours, ending at 16:00 UTC");
assert.equal(w.cutoff, OPEN, "orders waiting at the opening fill are pre-sale purchases; later ones are not");
assert.equal(presaleWindow([]).cutoff, END);
assert.deepEqual([...firstToReach(sales, 10_000, 100)], ["B", "A"], "in the order they reached Tier 3");
assert.deepEqual([...firstToReach(sales, 10_000, 1)], ["B"], "seats run out");

// --- bonus payments are not sales ---------------------------------------------
const D = "GA7I3HKV3AN7OSCKNU625D6SN6YDMMYTY3AUVXQ6HZQRNBY47M7AQQFS";
const ISS = "GDEIVYTG65ECPXM2SMFPAL5GRFASAYDPDMJ6NY3WKMCWCRLOC2OAOATM";
const pay = (to: string, amount: string, memo?: string) =>
  ({ type: "payment", from: D, to, amount, asset_code: "ITDBATMS", asset_issuer: ISS, created_at: "2026-10-13T10:00:00Z",
     transaction_hash: "h" + to, transaction: memo === undefined ? {} : { memo } }) as never;
const chain = readDistributor([], [pay("A", "500"), pay("B", "2000", "ATMS W25"), pay("C", "7", "hello"), pay("E", "900", "ATMS PRE"), pay("F", "40", "ATMS DSC")]);
assert.deepEqual(chain.sales.map((x) => x.wallet), ["A", "C"], "bonus payments are not sales");
assert.deepEqual(
  chain.bonuses.map((b) => [b.wallet, b.kind, b.wave]),
  [["B", "wave", 25], ["E", "presale", 0], ["F", "discount", 0]],
);

// --- the tier discount: tokens → new tier → doubled rewards ------------------
const base = { presaleBought: 0, presaleEnded: true, discountEnded: true, paid: { presale: 0, discount: 0 }, sold: 0 };
// Bought 3,000 before and 4,000 during: holds 7,000 (Tier 2). Doubled during-tokens → 11,000 → Tier 3, rewards x2 on Tier 3.
const both = atmEntitlement({ ...base, holding: 7_000, discountBought: 4_000, boughtBefore: true });
assert.equal(both.counted, 11_000);
assert.equal(both.tier?.tier, 3, "the tier is read after the tokens are doubled");
assert.equal(both.rewardsMultiplier, 2, "then rewards are doubled on that new tier");
assert.equal(atmEntitlement({ ...base, holding: 4_000, discountBought: 4_000, boughtBefore: false }).rewardsMultiplier, 1, "only during: tokens, not rewards");
// Once the doubling has been paid it is in the holding — never counted twice.
assert.equal(atmEntitlement({ ...base, holding: 11_000, discountBought: 4_000, boughtBefore: true, paid: { presale: 0, discount: 4_000 } }).counted, 11_000);
// 10 free ATMs for every holder, even below Tier 1.
assert.equal(atmEntitlement({ ...base, holding: 5, discountBought: 0, boughtBefore: false }).allowed, 10);
assert.equal(atmEntitlement({ ...base, holding: 0, discountBought: 0, boughtBefore: false }).allowed, 0);

console.log("ok — atms: 80 cities / 32 countries, tiers, 15k pre-sale = 75 then 150 ATMs, waves replace, placement limits, chain-ordered seats, bonus payments kept out of sales");
