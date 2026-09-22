#!/usr/bin/env node
/**
 * Build the QRS 25% bonus payout list from the CHAIN.
 *
 *   node scripts/qrs-holders-payout.mjs
 *
 * Writes payouts.json, which scripts/pay-qrs-bonus.mjs then sends:
 *
 *   node --env-file=.env scripts/pay-qrs-bonus.mjs payouts.json
 *   node --env-file=.env scripts/pay-qrs-bonus.mjs payouts.json --confirm
 *
 * This script only READS. It holds no key and sends nothing.
 *
 * WHO IS OWED — and the two mistakes this is built to avoid:
 *
 *   1. "Already paid" means a payment inside a BONUS transaction, not any
 *      QRS the distributor happened to send. On 2026-09-17 the distributor
 *      made ~143m QRS of unrelated transfers to ~430 wallets; counting
 *      those as the bonus skipped people who were never paid it.
 *      Bonus transactions are the three known runs below, plus any payment
 *      carrying the memo BONUS_MEMO, which pay-qrs-bonus.mjs now sets.
 *
 *   2. The 25% is taken from the balance at SNAPSHOT_AT — the moment the
 *      bonus was paid out — not today's. Today's balances include the
 *      2026-09-17 transfers, so using them would pay late claimants
 *      many times what everyone else received.
 *
 * On top of that, QRS_BONUS_GRANTS (src/lib/itdb/qrs-bonus-grants.json)
 * lists hand-approved exceptions, each with the basis to pay on.
 */

import { readFileSync, writeFileSync } from "node:fs";

const HORIZON = process.env.HORIZON_URL ?? "https://horizon.stellar.org";
const ISSUER = "GD5YLDEYUBJGXEE26WYTTHRWZF4VCSBBCUUKIH5A2UYIZE4VS2NL5QRS";
const DISTRIBUTOR = "GDSOAPAQLRL2UAIDEY6SGVPDMOFYNGSY644ZBDXOVPX4UQAUJO3I2QQQ";
const CODE = "QRS";
const TIER1 = 10_000;
const PCT = 25;

/** Bonus run 2 — the balance everyone was paid on. */
const SNAPSHOT_AT = Date.parse("2026-09-16T13:31:43Z");

/** The transactions that WERE the 25% bonus. */
const BONUS_TXS = new Set([
  "de81f90859623562fdb930bb62cb6ba9a78207866971484b4076487c2e3842cc", // run 1, 14
  "a0820d87c2d9", // run 2, 95  — prefix, matched below
  "91458c8321ce", // run 2, 69
]);
export const BONUS_MEMO = "QRS25";

const GRANTS = JSON.parse(
  readFileSync(new URL("../src/lib/itdb/qrs-bonus-grants.json", import.meta.url), "utf8"),
).grants;

const n = (v) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

async function getJson(url) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    // 429 or 5xx: back off rather than treat a busy Horizon as "no data"
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  throw new Error(`Horizon would not answer: ${url}`);
}

const isBonusTx = (hash, memo) =>
  memo === BONUS_MEMO || [...BONUS_TXS].some((h) => hash.startsWith(h));

// ---- 1. who has already had the bonus ------------------------------

process.stdout.write("Reading the distributor's bonus payments… ");
const paid = new Map();
{
  let url = `${HORIZON}/accounts/${DISTRIBUTOR}/payments?limit=200&order=desc&join=transactions`;
  for (let page = 0; page < 200 && url; page += 1) {
    const j = await getJson(url);
    const records = j?._embedded?.records ?? [];
    let past = false;
    for (const p of records) {
      if (Date.parse(p.created_at) < Date.parse("2026-09-16T00:00:00Z")) {
        past = true;
        break;
      }
      if (
        p.type === "payment" &&
        p.from === DISTRIBUTOR &&
        p.asset_code === CODE &&
        p.asset_issuer === ISSUER &&
        isBonusTx(p.transaction_hash, p.transaction?.memo)
      ) {
        paid.set(p.to, (paid.get(p.to) ?? 0) + Number(p.amount));
      }
    }
    if (past || records.length < 200) break;
    url = j._links?.next?.href ?? null;
  }
}
console.log(`${paid.size} wallets`);

// ---- 2. every current holder ----------------------------------------

process.stdout.write("Reading QRS holders… ");
const holders = [];
{
  let url = `${HORIZON}/accounts?asset=${CODE}:${ISSUER}&limit=200`;
  for (let page = 0; page < 50 && url; page += 1) {
    const j = await getJson(url);
    const records = j?._embedded?.records ?? [];
    for (const a of records) {
      const line = a.balances.find((b) => b.asset_code === CODE && b.asset_issuer === ISSUER);
      if (line) holders.push({ wallet: a.account_id, now: Number(line.balance) });
    }
    if (records.length < 200) break;
    url = j._links?.next?.href ?? null;
  }
}
console.log(holders.length);

/**
 * A wallet's QRS balance at SNAPSHOT_AT, by undoing every QRS movement
 * since then. Returns null when history could not be walked in full.
 */
async function balanceAt(wallet, now) {
  let bal = now;
  let url = `${HORIZON}/accounts/${wallet}/effects?limit=200&order=desc`;
  for (let page = 0; page < 100 && url; page += 1) {
    const j = await getJson(url);
    const records = j?._embedded?.records ?? [];
    for (const e of records) {
      if (Date.parse(e.created_at) < SNAPSHOT_AT) return bal;
      const q = (c, i) => c === CODE && i === ISSUER;
      if (e.type === "account_credited" && q(e.asset_code, e.asset_issuer)) bal -= Number(e.amount);
      if (e.type === "account_debited" && q(e.asset_code, e.asset_issuer)) bal += Number(e.amount);
      if (e.type === "trade") {
        if (q(e.bought_asset_code, e.bought_asset_issuer)) bal -= Number(e.bought_amount);
        if (q(e.sold_asset_code, e.sold_asset_issuer)) bal += Number(e.sold_amount);
      }
    }
    if (records.length < 200) return bal; // reached the account's start
    url = j._links?.next?.href ?? null;
  }
  return null;
}

// ---- 3. who is owed -------------------------------------------------

const house = new Set([ISSUER, DISTRIBUTOR]);
const rows = [];
const skipped = { paid: 0, belowTier1: 0, unreadable: [] };

const unpaid = holders.filter((h) => !house.has(h.wallet) && !paid.has(h.wallet));
process.stdout.write(`Reconstructing ${unpaid.length} unpaid balances at the snapshot… `);
for (const h of unpaid) {
  const grant = GRANTS[h.wallet];
  // A grant states its own basis; nobody else is below Tier 1 today and
  // was at or above it at the snapshot, so only the snapshot can decide.
  const basis = grant ? grant.basisQrs : await balanceAt(h.wallet, h.now);
  if (basis === null) {
    skipped.unreadable.push(h.wallet);
    continue;
  }
  if (!grant && basis < TIER1) {
    skipped.belowTier1 += 1;
    continue;
  }
  rows.push({
    accountId: h.wallet,
    username: `${h.wallet.slice(0, 4)}…${h.wallet.slice(-4)}`,
    wallets: [h.wallet],
    category: grant ? "grant" : "holder",
    basisBalance: basis,
    bonusQrs: Math.round(((basis * PCT) / 100) * 1e7) / 1e7,
    awardedAt: Date.now(),
    paidOnChainAt: null,
    txHash: null,
  });
}
skipped.paid = holders.filter((h) => paid.has(h.wallet)).length;
console.log("done");

// Grants for wallets that hold no QRS today still count.
for (const [wallet, grant] of Object.entries(GRANTS)) {
  if (paid.has(wallet) || rows.some((r) => r.accountId === wallet)) continue;
  rows.push({
    accountId: wallet,
    username: `${wallet.slice(0, 4)}…${wallet.slice(-4)}`,
    wallets: [wallet],
    category: "grant",
    basisBalance: grant.basisQrs,
    bonusQrs: Math.round(((grant.basisQrs * PCT) / 100) * 1e7) / 1e7,
    awardedAt: Date.now(),
    paidOnChainAt: null,
    txHash: null,
  });
}

// ---- 4. write the payout file ---------------------------------------

const totalQrs = rows.reduce((s, r) => s + r.bonusQrs, 0);
writeFileSync(
  "payouts.json",
  JSON.stringify(
    {
      asset: { code: CODE, issuer: ISSUER },
      pct: PCT,
      snapshotAt: SNAPSHOT_AT,
      generatedAt: Date.now(),
      source: "chain",
      totals: { rows: rows.length, unpaidRows: rows.length, totalQrs, unpaidQrs: totalQrs },
      rows,
    },
    null,
    1,
  ),
);

console.log(`
  holders on chain              ${holders.length}
  already paid the bonus        ${skipped.paid}
  below Tier 1 at the snapshot  ${skipped.belowTier1}
  history unreadable (re-run)   ${skipped.unreadable.length}
  ----------------------------------------------
  TO PAY                        ${rows.length} wallets, ${n(totalQrs)} QRS
${rows.map((r) => `     ${r.accountId}  ${n(r.bonusQrs).padStart(12)} QRS  (${r.category}, basis ${n(r.basisBalance)})`).join("\n")}

  Written to payouts.json. Nothing has been sent.
  Next:  node --env-file=.env scripts/pay-qrs-bonus.mjs payouts.json
`);
