// Self-check for the vault rules, against the real code.
// Run: npx tsx --tsconfig tsconfig.json scripts/test-vault.ts
import assert from "node:assert/strict";
import {
  TOKEN_SUPPLY, TOTAL_VAULTS, VAULTS_PER_CITY, VAULT_CITY_NAMES,
  activeMetalBoost, currentStage, randomFreeNumber, remainingByCity,
  stageTarget, vaultEarlyBird, vaultSold, vaultsAllowed,
} from "@/lib/itdb/vault";
import { VAULT_EARLY_BIRD_ENDS_AT, VAULT_EARLY_BUYERS, VAULT_SOLD_AT_BUILD } from "@/lib/itdb/vault-early-birds";
import { VAULT_TIERS, vaultTierFor } from "@/lib/itdb/vault-tiers";
import { vaultTierBalance, vaultTierNeeded } from "@/lib/server/vault-perks";
import { MAP_HEIGHT, MAP_WIDTH, VAULT_PINS } from "@/lib/itdb/world-map";

// --- map and branches -------------------------------------------------
assert.equal(VAULT_PINS.length, 10);
assert.ok(VAULT_PINS.every((p) => p.x > 0 && p.x < MAP_WIDTH && p.y > 0 && p.y < MAP_HEIGHT), "pins on the map");
assert.equal(VAULTS_PER_CITY * VAULT_CITY_NAMES.length, TOTAL_VAULTS);
assert.equal(remainingByCity({ Dubai: 999 })["Dubai"], 0, "a city clamps at zero");
assert.equal(remainingByCity({ Dubai: 50 })["London"], 50, "cities are independent");

// --- tiers ------------------------------------------------------------
assert.deepEqual(VAULT_TIERS.map((t) => t.min),
  [2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 256_000, 512_000, 1_000_000]);
assert.ok(VAULT_TIERS.every((t) => t.vaults === t.tier), "Tier N owns N vaults");
assert.equal(VAULT_TIERS[0].min, TOKEN_SUPPLY / TOTAL_VAULTS, "Tier 1 == one vault of tokens");
assert.equal(vaultTierFor(1_999), null);
assert.equal(vaultTierFor(2_000)?.tier, 1);

// --- early birds come from the chain, not the app ---------------------
const buyer = VAULT_EARLY_BUYERS[0];
assert.ok(VAULT_EARLY_BUYERS.every((b) => Date.parse(b.firstAt) < VAULT_EARLY_BIRD_ENDS_AT), "every listed buyer bought in time");
assert.ok(vaultEarlyBird([buyer.wallet]), "a buyer in the window is an early bird");
assert.equal(vaultEarlyBird(["GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7"]), null, "a stranger is not");
assert.equal(vaultEarlyBird([buyer.wallet, buyer.wallet])!.xlmSpent, buyer.xlmSpent, "a wallet listed twice counts once");
assert.ok(vaultEarlyBird(["GDU3DSI2LQ6YQHVATDDXLHHHWONEHUT6VVJCHLTNJU6PLMXGHQTAUFHJ"]), "#4 has early-bird status");

// Early birds: 50% off the thresholds, shortfall quoted in real tokens.
assert.equal(vaultTierFor(vaultTierBalance(1_000, true))?.tier, 1, "early bird: Tier 1 at 1,000");
assert.equal(vaultTierFor(vaultTierBalance(1_000, false)), null, "everyone else: not yet");
assert.equal(vaultTierNeeded(4_000, 1_000, 2_000), 1_000, "1,000 real tokens to Tier 2, not 2,000");

// #4 holds 2,100: counted as 4,200 → Tier 2 → 2 vaults, +1 from the 25% stage.
const t4 = vaultTierFor(vaultTierBalance(2_100, true))!;
assert.equal(t4.tier, 2);
assert.equal(vaultsAllowed(t4.vaults, VAULT_SOLD_AT_BUILD, []), 3, "#4 may hold three vaults");

// --- sales, milestones and entitlement --------------------------------
assert.equal(vaultSold(null), VAULT_SOLD_AT_BUILD, "Horizon down: never less than was sold");
assert.equal(vaultSold(200_000_000 - 500_000), 500_000, "live sales read from the distributor");
assert.equal(vaultSold(200_000_000), VAULT_SOLD_AT_BUILD, "sales never un-happen");
assert.equal(stageTarget(25), 250_000);
assert.equal(currentStage(249_999), null);
assert.equal(currentStage(250_000)?.pct, 25);
assert.equal(currentStage(1_000_000)?.extraVaults, 10, "sold out: ten extra, not 1+3+5+10");
assert.equal(vaultsAllowed(0, 1_000_000, []), 0, "below Tier 1 no stage adds a vault");
assert.equal(vaultsAllowed(3, 250_000, []), 4, "Tier 3 at 25% sold: 3 + 1");

// The 25% stage opened with the first sale; its double metals run 14 days.
const opened = Date.parse("2026-09-19T21:47:08Z");
assert.equal(activeMetalBoost(VAULT_SOLD_AT_BUILD, opened + 13 * 86_400_000).multiplier, 2);
assert.equal(activeMetalBoost(VAULT_SOLD_AT_BUILD, opened + 15 * 86_400_000).multiplier, 1, "boost ends on day 14");

// --- vault numbers ----------------------------------------------------
const taken = new Set(Array.from({ length: 499 }, (_, i) => i + 1)); // only 500 left
assert.equal(randomFreeNumber(taken), 500, "the only free number");
assert.equal(randomFreeNumber(new Set(Array.from({ length: 500 }, (_, i) => i + 1))), null);
const seen = new Set<number>();
for (let i = 0; i < 400; i += 1) seen.add(randomFreeNumber(new Set([1, 2, 3]))!);
assert.ok(![1, 2, 3].some((n) => seen.has(n)), "never hands out an owned number");
assert.ok(seen.size > 100, "random, not the lowest free");

console.log(
  `ok — ${VAULT_EARLY_BUYERS.length} chain early birds, ${VAULT_SOLD_AT_BUILD.toLocaleString("en-US")} sold, ` +
    `tiers, stages, entitlement and random numbering hold`,
);
