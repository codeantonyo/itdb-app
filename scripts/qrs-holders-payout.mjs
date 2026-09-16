#!/usr/bin/env node
/**
 * Build the QRS 25% bonus payout list from the CHAIN.
 *
 * Eligibility is every wallet holding at least Tier 1 (10,000 QRS),
 * whether or not its owner ever signed up for the ITDB app. The app's
 * own database only knows about registered members, so it cannot answer
 * this question — Horizon can.
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
 * THREE EXCLUSIONS, each of which would otherwise cost real tokens:
 *
 *   issuer and distributor — the distributor holds most of the supply,
 *     and 25% of it would dwarf the entire holder payout.
 *   below Tier 1 — 10,000 QRS is the bar.
 *   already paid — a wallet that received a QRS payment from the
 *     distributor since the unlock is skipped. Without this, a second
 *     run pays them again AND on a balance the first payment inflated.
 */

import { writeFileSync } from "node:fs";

const HORIZON = process.env.HORIZON_URL ?? "https://horizon.stellar.org";
const ISSUER = "GD5YLDEYUBJGXEE26WYTTHRWZF4VCSBBCUUKIH5A2UYIZE4VS2NL5QRS";
const DISTRIBUTOR = "GDSOAPAQLRL2UAIDEY6SGVPDMOFYNGSY644ZBDXOVPX4UQAUJO3I2QQQ";
const CODE = "QRS";
const TIER1 = 10_000;
const PCT = 25;
/** Payments from the distributor after this count as the bonus already paid. */
const UNLOCK_AT = Date.UTC(2026, 8, 16, 0, 0, 0);

const n = (v) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

async function getJson(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    // 429 or 5xx: back off rather than treat a busy Horizon as "no data"
    await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
  }
  throw new Error(`Horizon would not answer: ${url}`);
}

// ---- 1. every holder -------------------------------------------------

process.stdout.write("Reading QRS holders from Horizon… ");
const holders = [];
let url = `${HORIZON}/accounts?asset=${CODE}:${ISSUER}&limit=200`;
for (let page = 0; page < 50 && url; page += 1) {
  const j = await getJson(url);
  const records = j?._embedded?.records ?? [];
  for (const a of records) {
    const line = a.balances.find((b) => b.asset_code === CODE && b.asset_issuer === ISSUER);
    if (line) holders.push({ wallet: a.account_id, balance: Number(line.balance) });
  }
  if (records.length < 200) break;
  url = j._links?.next?.href ?? null;
}
console.log(`${holders.length} found`);

// ---- 2. who qualifies ------------------------------------------------

const house = new Set([ISSUER, DISTRIBUTOR]);
const candidates = holders
  .filter((h) => !house.has(h.wallet) && h.balance >= TIER1)
  .sort((a, b) => b.balance - a.balance);
const belowTier1 = holders.filter((h) => !house.has(h.wallet) && h.balance > 0 && h.balance < TIER1);

// ---- 3. drop anyone already paid ------------------------------------

/**
 * Who has already had the bonus, read from the DISTRIBUTOR's own
 * outgoing payments rather than from each recipient's history.
 *
 * Scanning per recipient looked simpler and was wrong: a busy wallet can
 * push the bonus payment out of any fixed window — one of them took 200
 * payments in the first few hours and read as unpaid, which would have
 * paid it a second time. Every bonus leaves from one account, so that
 * account's ledger is the authoritative record and needs one scan.
 */
process.stdout.write("Reading the distributor's payment history… ");
const paidWallets = new Map();
let payUrl = `${HORIZON}/accounts/${DISTRIBUTOR}/payments?limit=200&order=desc`;
let reachedUnlock = false;
for (let page = 0; page < 200 && payUrl && !reachedUnlock; page += 1) {
  const j = await getJson(payUrl);
  const records = j?._embedded?.records ?? [];
  for (const p of records) {
    if (Date.parse(p.created_at) < UNLOCK_AT) {
      reachedUnlock = true;
      break;
    }
    if (
      p.type === "payment" &&
      p.from === DISTRIBUTOR &&
      p.asset_code === CODE &&
      p.asset_issuer === ISSUER &&
      p.to
    ) {
      paidWallets.set(p.to, (paidWallets.get(p.to) ?? 0) + Number(p.amount));
    }
  }
  if (records.length < 200) break;
  payUrl = j._links?.next?.href ?? null;
}
console.log(`${paidWallets.size} wallets already paid`);

const rows = [];
const alreadyPaid = [];
for (const h of candidates) {
  if (paidWallets.has(h.wallet)) {
    alreadyPaid.push({ ...h, received: paidWallets.get(h.wallet) });
    continue;
  }
  rows.push({
    accountId: h.wallet,
    username: `${h.wallet.slice(0, 4)}…${h.wallet.slice(-4)}`,
    wallets: [h.wallet],
    category: "holder",
    basisBalance: h.balance,
    bonusQrs: Math.round(((h.balance * PCT) / 100) * 1e7) / 1e7,
    awardedAt: Date.now(),
    paidOnChainAt: null,
    txHash: null,
  });
}

// ---- 4. write the payout file ---------------------------------------

const totalQrs = rows.reduce((s, r) => s + r.bonusQrs, 0);
const report = {
  asset: { code: CODE, issuer: ISSUER },
  pct: PCT,
  unlockAt: UNLOCK_AT,
  generatedAt: Date.now(),
  source: "chain",
  totals: { rows: rows.length, unpaidRows: rows.length, totalQrs, unpaidQrs: totalQrs },
  rows,
};
writeFileSync("payouts.json", JSON.stringify(report, null, 1));

console.log(`
  holders on chain          ${holders.length}
  at Tier 1 or above        ${candidates.length}
  below Tier 1 (not paid)   ${belowTier1.length}
  already had the bonus     ${alreadyPaid.length}
  ------------------------------------------
  TO PAY                    ${rows.length} wallets, ${n(totalQrs)} QRS

  Written to payouts.json. Nothing has been sent.
  Next:  node --env-file=.env scripts/pay-qrs-bonus.mjs payouts.json
`);
