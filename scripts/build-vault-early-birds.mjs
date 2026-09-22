#!/usr/bin/env node
/**
 * Build the ITDBVAULT early-bird list from the CHAIN.
 *
 *   node scripts/build-vault-early-birds.mjs
 *
 * An early bird is a wallet that BOUGHT ITDBVAULT from the distributor
 * before the window closed — not one that happened to open the app in
 * time. Claiming a vault in the app is picking a location; buying is
 * what the early-bird offer was for, and only buyers paid the XLM the
 * 50% refund is refunded from.
 *
 * Also records how much had sold when each milestone stage was crossed,
 * because "double metal rewards for 14 days" needs to know when the
 * fourteen days started.
 *
 * Reading trades: `base_amount` of the base asset always moves from
 * base_account to counter_account. `base_is_seller` says which side
 * placed the offer, NOT which side sold — reading it as the latter
 * flips every buyer into a seller.
 */

import { writeFileSync } from "node:fs";

const HORIZON = process.env.HORIZON_URL ?? "https://horizon.stellar.org";
const ISSUER = "GBBA6ZFTOKUJKTXLXJSV26YWWCMGLHP5R2UREFBLV25HJTWEC3YYJVLT";
const DISTRIBUTOR = "GCAA2CIQUWBZGOD3D2FHMLRA2476KRHORZYCCSO3CTT5JXWUOFCF3QFS";
/** 48 hours closing here. Sales on either side sit two hours clear of it. */
const ENDS_AT = "2026-09-21T09:00:00Z";
const SALE_SUPPLY = 1_000_000;
const STAGES = [25, 50, 75, 100];

async function getJson(url) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) return res.json();
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  throw new Error(`Horizon would not answer: ${url}`);
}

const sales = [];
let url =
  `${HORIZON}/trades?base_asset_type=credit_alphanum12&base_asset_code=ITDBVAULT` +
  `&base_asset_issuer=${ISSUER}&counter_asset_type=native&limit=200&order=asc`;
for (let page = 0; page < 200 && url; page += 1) {
  const j = await getJson(url);
  const records = j._embedded.records;
  for (const t of records) {
    if (t.base_account !== DISTRIBUTOR) continue; // secondary trades are not sales
    sales.push({
      at: t.ledger_close_time,
      buyer: t.counter_account,
      vault: Number(t.base_amount),
      xlm: Number(t.counter_amount),
    });
  }
  if (records.length < 200) break;
  url = j._links.next.href;
}

const buyers = {};
for (const s of sales) {
  if (s.at >= ENDS_AT) continue;
  const b = (buyers[s.buyer] ??= { first: s.at, vault: 0, xlm: 0 });
  b.vault += s.vault;
  b.xlm += s.xlm;
}

let running = 0;
const stageAt = {};
for (const s of sales) {
  running += s.vault;
  for (const pct of STAGES) {
    if (!stageAt[pct] && running >= (SALE_SUPPLY * pct) / 100) stageAt[pct] = s.at;
  }
}

const round = (v) => Math.round(v * 1e7) / 1e7;
const rows = Object.entries(buyers)
  .sort((a, b) => b[1].vault - a[1].vault)
  .map(
    ([w, b]) =>
      `  { wallet: "${w}", xlmSpent: ${round(b.xlm)}, vaultBought: ${round(b.vault)}, firstAt: "${b.first}" },`,
  );

const soldTotal = round(sales.reduce((s, x) => s + x.vault, 0));

writeFileSync(
  "src/lib/itdb/vault-early-birds.ts",
  `/**
 * GENERATED — do not edit. Run: node scripts/build-vault-early-birds.mjs
 *
 * Wallets that bought ITDBVAULT from the distributor before the early-bird
 * window closed at ${ENDS_AT}, read from the chain on
 * ${new Date().toISOString().slice(0, 10)}. ${rows.length} wallets.
 */

export const VAULT_EARLY_BIRD_ENDS_AT = Date.parse("${ENDS_AT}");

export interface VaultEarlyBuyer {
  wallet: string;
  /** XLM paid inside the window — the 50% refund is taken from this */
  xlmSpent: number;
  vaultBought: number;
  firstAt: string;
}

export const VAULT_EARLY_BUYERS: VaultEarlyBuyer[] = [
${rows.join("\n")}
];

/**
 * ITDBVAULT sold when this file was built. The live figure is read from
 * the distributor's balance; this is the floor under it, so a Horizon
 * failure can never un-sell tokens and re-lock a milestone.
 */
export const VAULT_SOLD_AT_BUILD = ${soldTotal};

/** When cumulative sales first crossed each milestone, or null. */
export const VAULT_STAGE_REACHED_AT: Record<number, string | null> = ${JSON.stringify(
    Object.fromEntries(STAGES.map((p) => [p, stageAt[p] ?? null])),
  )};
`,
);

console.log(
  `vault-early-birds.ts — ${rows.length} early buyers, ${soldTotal.toLocaleString("en-US")} sold ` +
    `(${((soldTotal / SALE_SUPPLY) * 100).toFixed(2)}%), stages: ${JSON.stringify(stageAt)}`,
);
