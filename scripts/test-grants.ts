// Self-check for hand grants. Run: npx tsx --tsconfig tsconfig.json scripts/test-grants.ts
import assert from "node:assert/strict";
import { ITDB_EARLY_BIRDS, tokenMultiplier } from "@/lib/itdb/early-birds";
import { QRS_BONUS_GRANTS, TOKEN_MULTIPLIER_GRANTS } from "@/lib/itdb/grants";

const x5 = Object.keys(TOKEN_MULTIPLIER_GRANTS)[0];
const eb = ITDB_EARLY_BIRDS[0];
const nobody = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";

assert.equal(tokenMultiplier([nobody], "ITDB"), 1, "no grant, no status: x1");
assert.equal(tokenMultiplier([x5], "ITDB"), 5, "x5 grant on ITDB");
assert.equal(tokenMultiplier([x5], "ITDBONE"), 5, "x5 grant on ITDB ONE");
assert.equal(tokenMultiplier([x5], "QRS"), 1, "x5 does NOT reach QRS");
assert.equal(tokenMultiplier([eb], "QRS"), 10, "the x10 early bird covers every token");
assert.equal(tokenMultiplier([eb, x5], "ITDB"), 10, "both: the higher wins, never x50");

assert.ok(ITDB_EARLY_BIRDS.includes("GBRPC2YBYNYC6KBU4JQPEUMRC4EQRIKUQMXGITGKRBFMLSOPZNULOQY6"), "#5 is an ITDB early bird");
assert.equal(new Set(ITDB_EARLY_BIRDS).size, ITDB_EARLY_BIRDS.length, "no duplicate early birds");

const g7 = QRS_BONUS_GRANTS["GDYGEUEO23AOGA7PTAGMA47ETUV6I2EGZZLMH5OF3WJSWKOPIFLJDQDM"];
assert.equal(g7.basisQrs * 0.25, 2_175, "#7 is paid 25% of the 8,700 they held at the snapshot");

console.log("ok — grants: x5 scoped to ITDB/ITDB ONE, higher-wins with x10, #5 and #7 in place");
