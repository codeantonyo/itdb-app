#!/usr/bin/env node
/**
 * Pay ITDB 100 bonus tokens on chain. One kind per run:
 *
 *   --early      Early birds: tokens bought at 0.5 XLM (or in the opening
 *                fill) × (their early-bird step % + 100% for the doubling).
 *                Steps by XLM spent: 100+ → 100%, 500+ → 150%, 1,000+ →
 *                200%, 2,500+ → 250%, 5,000+ → 300%.
 *   --gate 25    A milestone gate (25 / 50 / 75 / 100): bonus % of what each
 *                wallet had bought by the moment the gate opened
 *                (100% / 200% / 300% / 500%). Gates ADD UP: each is paid on
 *                its own.
 *
 * Run BY A PERSON, not by the app:
 *
 *   1. Put the ITDB100 distributor's secret in .env as  I100_SECRET=S...
 *   2. Dry run (sends nothing):  node scripts/pay-itdb100.mjs --early
 *   3. Send:                     node --env-file=.env scripts/pay-itdb100.mjs --early --confirm
 *
 * Every payment carries a memo — "I100 EB", "I100 G25" … That is how a
 * re-run knows who is paid (re-running is safe, it tops up only what is
 * missing), and how the app tells bonuses from sales. Never pay a bonus
 * from this account without it.
 *
 * The rules mirror src/lib/itdb/itdb100.ts (walletDue) — change both.
 */

const ISSUER = "GC2SCEDYLDH6ZYNQOL7HBMFIH73U4RVYGXHC6P64YQ3BUHKXTTQQITDB";
const DISTRIBUTOR = "GBAR5C4B6JZIWWD2E5BZHVZM3HZUTZIVZ3HWDFFOV2Q3RKDYSJL44QFS";
const HORIZON = "https://horizon.stellar.org";
const SUPPLY = 100_000;
const EARLY_PRICE = 0.5;
const EARLY_STEPS = [
  { xlm: 100, pct: 100 },
  { xlm: 500, pct: 150 },
  { xlm: 1_000, pct: 200 },
  { xlm: 2_500, pct: 250 },
  { xlm: 5_000, pct: 300 },
];
const GATE_PCT = { 25: 100, 50: 200, 75: 300, 100: 500 };
const OPS_PER_TX = 95;

const args = process.argv.slice(2);
const mode = args.includes("--early") ? "early" : args.includes("--gate") ? "gate" : null;
const gate = Number(args[args.indexOf("--gate") + 1]);
const confirm = args.includes("--confirm");
const die = (m) => {
  console.error(`\n✗ ${m}\n`);
  process.exit(1);
};
if (!mode) die("Say what to pay: --early, or --gate 25");
if (mode === "gate" && !GATE_PCT[gate]) die("--gate must be 25, 50, 75 or 100.");
const MEMO = mode === "early" ? "I100 EB" : `I100 G${gate}`;

// The key is needed only to send; a dry run reads the chain without it.
const secret = process.env.I100_SECRET;
if (confirm && !secret) die("I100_SECRET is not set. Run with: node --env-file=.env scripts/pay-itdb100.mjs ...");
const { Keypair, TransactionBuilder, Operation, Asset, Memo, Networks, BASE_FEE, Horizon } = await import("@stellar/stellar-sdk");
let keys = null;
if (secret) {
  try {
    keys = Keypair.fromSecret(secret.trim());
  } catch {
    die("I100_SECRET is not a valid Stellar secret key.");
  }
  if (keys.publicKey() === ISSUER) die("That is the ISSUER key — paying from it would mint new ITDB100. Use the distributor's key.");
  if (keys.publicKey() !== DISTRIBUTOR) die(`I100_SECRET must be the distributor's key (${DISTRIBUTOR}).`);
}

const server = new Horizon.Server(HORIZON);
const asset = new Asset("ITDB100", ISSUER);

async function pages(url) {
  const out = [];
  for (let next = url; next; ) {
    const res = await fetch(next);
    if (!res.ok) die(`Horizon answered ${res.status} — nothing was sent. Try again in a minute.`);
    const data = await res.json();
    const recs = data._embedded?.records ?? [];
    out.push(...recs);
    next = recs.length === 200 ? data._links?.next?.href : null;
  }
  return out;
}

// ---- read the chain -------------------------------------------------------

const isI100 = (code, issuer) => code === "ITDB100" && issuer === ISSUER;
const sales = [];
const paid = new Map(); // already paid with THIS memo, per wallet
for (const t of await pages(`${HORIZON}/accounts/${DISTRIBUTOR}/trades?order=asc&limit=200`)) {
  const at = Date.parse(t.ledger_close_time);
  // base_amount moves base_account → counter_account, counter_amount the other way.
  if (isI100(t.base_asset_code, t.base_asset_issuer) && t.base_account === DISTRIBUTOR)
    sales.push({ wallet: t.counter_account, amount: +t.base_amount, xlm: t.counter_asset_type === "native" ? +t.counter_amount : 0, at });
  else if (isI100(t.counter_asset_code, t.counter_asset_issuer) && t.counter_account === DISTRIBUTOR)
    sales.push({ wallet: t.base_account, amount: +t.counter_amount, xlm: t.base_asset_type === "native" ? +t.base_amount : 0, at });
}
for (const p of await pages(`${HORIZON}/accounts/${DISTRIBUTOR}/payments?order=asc&limit=200&join=transactions`)) {
  if (p.from !== DISTRIBUTOR || !isI100(p.asset_code, p.asset_issuer) || p.to === ISSUER) continue;
  if (p.type !== "payment" && !p.type?.startsWith("path_payment")) continue;
  const memo = p.transaction?.memo ?? "";
  if (memo === MEMO) paid.set(p.to, (paid.get(p.to) ?? 0) + Number(p.amount));
  else if (!memo.startsWith("I100 ")) sales.push({ wallet: p.to, amount: +p.amount, xlm: 0, at: Date.parse(p.created_at) });
}
sales.sort((a, b) => a.at - b.at);
if (sales.length === 0) die("No ITDB100 has been sold yet — nothing to pay.");

const trustlines = new Set();
for (const a of await pages(`${HORIZON}/accounts?asset=ITDB100:${ISSUER}&limit=200`)) {
  const b = a.balances.find((x) => x.asset_code === "ITDB100" && x.asset_issuer === ISSUER);
  if (b && b.is_authorized !== false) trustlines.add(a.id);
}

const opening = sales[0].at;
const isEarly = (s) => s.at <= opening || (s.amount > 0 && s.xlm / s.amount <= EARLY_PRICE + 1e-6);
let gateAt = null;
if (mode === "gate") {
  // Sold = XLM raised at the 1 XLM price (early birds' 0.5 tokens count at half) — as in src/lib/itdb/itdb100.ts.
  let sold = 0;
  for (const s of sales) {
    sold += s.xlm > 0 ? s.xlm : s.amount;
    if (sold >= (SUPPLY * gate) / 100) {
      gateAt = s.at;
      break;
    }
  }
  if (gateAt === null) die(`The ${gate}% gate has not opened yet (${sold.toLocaleString("en-US")} of ${SUPPLY.toLocaleString("en-US")} sold).`);
}

const due = new Map();
for (const w of new Set(sales.map((s) => s.wallet))) {
  const mine = sales.filter((s) => s.wallet === w);
  if (mode === "early") {
    const early = mine.filter(isEarly);
    const tokens = early.reduce((t, s) => t + s.amount, 0);
    const xlm = early.reduce((t, s) => t + s.xlm, 0);
    const step = [...EARLY_STEPS].reverse().find((x) => xlm >= x.xlm);
    if (tokens > 0) due.set(w, { basis: tokens, xlm, amount: (tokens * ((step?.pct ?? 0) + 100)) / 100 });
  } else {
    const bought = mine.filter((s) => s.at <= gateAt).reduce((t, s) => t + s.amount, 0);
    if (bought > 0) due.set(w, { basis: bought, amount: (bought * GATE_PCT[gate]) / 100 });
  }
}

const rows = [];
const noTrustline = [];
for (const [wallet, d] of due) {
  const amount = Math.floor((d.amount - (paid.get(wallet) ?? 0)) * 1e7) / 1e7;
  if (amount <= 0) continue;
  if (!trustlines.has(wallet)) noTrustline.push(wallet);
  else rows.push({ wallet, ...d, amount });
}
rows.sort((a, b) => b.amount - a.amount);
const total = rows.reduce((t, r) => t + r.amount, 0);

const dist = (await server.loadAccount(DISTRIBUTOR)).balances.find((b) => b.asset_code === "ITDB100" && b.asset_issuer === ISSUER);
const held = Number(dist?.balance ?? 0);

console.log(`\nITDB 100 — ${mode === "early" ? "early-bird bonus + doubling" : `${gate}% gate, +${GATE_PCT[gate]}%`}, memo "${MEMO}"`);
console.log(`  wallets owed               ${due.size}`);
console.log(`  already fully paid         ${due.size - rows.length - noTrustline.length}`);
if (noTrustline.length) console.log(`  skipped, no trustline     ${noTrustline.length} (pay them later, with memo "${MEMO}")`);
console.log(`  to pay now                 ${rows.length} wallets, ${total.toLocaleString("en-US")} ITDB100`);
console.log(`  distributor holds          ${held.toLocaleString("en-US")} ITDB100`);
if (total > held) die("The distributor cannot cover this payout.");
if (rows.length === 0) {
  console.log("\nNothing to pay.\n");
  process.exit(0);
}

if (!confirm) {
  console.log(`\n── DRY RUN — nothing has been sent ──`);
  for (const r of rows.slice(0, 25))
    console.log(`  ${r.wallet}  bought ${r.basis.toLocaleString("en-US").padStart(9)}${r.xlm !== undefined ? ` for ${r.xlm.toLocaleString("en-US")} XLM` : ""}  →  +${r.amount.toLocaleString("en-US")}`);
  if (rows.length > 25) console.log(`  …and ${rows.length - 25} more`);
  console.log(`\n  Re-run with --confirm to send.\n`);
  process.exit(0);
}

// ---- send -----------------------------------------------------------------

const done = [];
for (let i = 0; i < rows.length; i += OPS_PER_TX) {
  const batch = rows.slice(i, i + OPS_PER_TX);
  const account = await server.loadAccount(DISTRIBUTOR);
  let tx = new TransactionBuilder(account, { fee: String(Number(BASE_FEE) * 10), networkPassphrase: Networks.PUBLIC });
  for (const r of batch) tx = tx.addOperation(Operation.payment({ destination: r.wallet, asset, amount: r.amount.toFixed(7) }));
  const built = tx.addMemo(Memo.text(MEMO)).setTimeout(120).build();
  built.sign(keys);
  try {
    const res = await server.submitTransaction(built);
    console.log(`  batch ${i / OPS_PER_TX + 1}: ${batch.length} paid — ${res.hash}`);
    for (const r of batch) done.push({ ...r, txHash: res.hash });
  } catch (e) {
    const codes = e?.response?.data?.extras?.result_codes;
    console.error(`  batch ${i / OPS_PER_TX + 1} FAILED${codes ? `: ${JSON.stringify(codes)}` : " (no answer)"}`);
    console.error(`  Wait 2 minutes before re-running: a transaction that got no answer can still land until it expires.`);
    break;
  }
}

const { writeFileSync } = await import("node:fs");
writeFileSync("itdb100-paid.json", JSON.stringify({ memo: MEMO, paid: done }, null, 2));
console.log(`\n  ${done.length} of ${rows.length} paid. Receipts in itdb100-paid.json (do not commit it).`);
console.log(`  Members see "Sent ✓" in the app within a minute. Re-running pays only who is left.\n`);
