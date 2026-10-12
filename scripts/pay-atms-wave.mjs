#!/usr/bin/env node
/**
 * Pay ITDB ATMS bonus tokens on chain. Three kinds, one per run:
 *
 *   --presale     Pre-sale Bonus 1: 100% of what each wallet bought in the
 *                 pre-sale, for wallets that bought 1,000 or more.
 *   --discount    Tier discount: 100% of what each wallet bought while the
 *                 tier discount ran (DISCOUNT_STARTS_AT → DISCOUNT_ENDS_AT).
 *   --wave 25     A milestone wave: basis × the wave's bonus (25% → 100%,
 *                 50% → 200%, 75% → 300%, 100% → 500%), where basis is the
 *                 balance minus every bonus already received. Waves
 *                 REPLACE: earlier waves' payments are subtracted, so a
 *                 later wave pays only the top-up.
 *
 * Run BY A PERSON, not by the app:
 *
 *   1. Put the ITDBATMS distributor's secret in .env as  ATMS_SECRET=S...
 *   2. Dry run (sends nothing):  node scripts/pay-atms-wave.mjs --presale
 *   3. Send:                     node --env-file=.env scripts/pay-atms-wave.mjs --presale --confirm
 *
 * Every payment carries a memo — "ATMS PRE", "ATMS DSC", "ATMS W<wave>".
 * That is how a re-run knows who is paid (re-running is safe), and how
 * the app tells bonuses from sales — without it, bonuses would count as
 * "sold" and unlock the next wave on their own. Never pay a bonus from
 * this account without it.
 *
 * The secret is read from the env file only — never an argument, never
 * printed.
 */

const ISSUER = "GDEIVYTG65ECPXM2SMFPAL5GRFASAYDPDMJ6NY3WKMCWCRLOC2OAOATM";
const DISTRIBUTOR = "GA7I3HKV3AN7OSCKNU625D6SN6YDMMYTY3AUVXQ6HZQRNBY47M7AQQFS";
const HORIZON = "https://horizon.stellar.org";
// These mirror src/lib/itdb/atms.ts — change both together.
const MEMO_PREFIX = "ATMS ";
const PRESALE_ENDS_AT = Date.parse("2026-10-05T16:00:00Z");
const DISCOUNT_STARTS_AT = null; // e.g. "2026-10-09T10:00:00Z"
const DISCOUNT_ENDS_AT = Date.parse("2026-10-12T10:00:00Z");
const BONUS_PCT = { 25: 100, 50: 200, 75: 300, 100: 500 };
const MIN = 1_000;
const OPS_PER_TX = 95;

const args = process.argv.slice(2);
const mode = args.includes("--presale") ? "presale" : args.includes("--discount") ? "discount" : args.includes("--wave") ? "wave" : null;
const wave = Number(args[args.indexOf("--wave") + 1]);
const confirm = args.includes("--confirm");
const die = (m) => {
  console.error(`\n✗ ${m}\n`);
  process.exit(1);
};
if (!mode) die("Say what to pay: --presale, --discount, or --wave 25");
if (mode === "wave" && !BONUS_PCT[wave]) die("--wave must be 25, 50, 75 or 100.");
if (mode === "discount" && !DISCOUNT_STARTS_AT) die("Set DISCOUNT_STARTS_AT (here and in src/lib/itdb/atms.ts) first.");
const MEMO = mode === "presale" ? "ATMS PRE" : mode === "discount" ? "ATMS DSC" : `ATMS W${wave}`;

// The key is needed only to send; a dry run reads the chain without it.
const secret = process.env.ATMS_SECRET;
if (confirm && !secret) die("ATMS_SECRET is not set. Run with: node --env-file=.env scripts/pay-atms-wave.mjs ...");
const { Keypair, TransactionBuilder, Operation, Asset, Memo, Networks, BASE_FEE, Horizon } = await import("@stellar/stellar-sdk");
let keys = null;
if (secret) {
  try {
    keys = Keypair.fromSecret(secret.trim());
  } catch {
    die("ATMS_SECRET is not a valid Stellar secret key.");
  }
  if (keys.publicKey() === ISSUER) die("That is the ISSUER key — paying from it would mint new ITDBATMS. Use the distributor's key.");
  if (keys.publicKey() !== DISTRIBUTOR) die(`ATMS_SECRET must be the distributor's key (${DISTRIBUTOR}).`);
}

const server = new Horizon.Server(HORIZON);
const atms = new Asset("ITDBATMS", ISSUER);

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

const holders = new Map();
for (const a of await pages(`${HORIZON}/accounts?asset=ITDBATMS:${ISSUER}&limit=200`)) {
  if (a.id === DISTRIBUTOR || a.id === ISSUER) continue;
  const b = a.balances.find((x) => x.asset_code === "ITDBATMS" && x.asset_issuer === ISSUER);
  if (b && b.is_authorized !== false) holders.set(a.id, Number(b.balance));
}

const received = new Map(); // every bonus already paid, any kind
const receivedWaves = new Map(); // wave bonuses only — what a later wave tops up
const paidThisRun = new Set();
const sales = []; // ITDBATMS that left the distributor as sales, oldest first
for (const p of await pages(`${HORIZON}/accounts/${DISTRIBUTOR}/payments?order=asc&limit=200&join=transactions`)) {
  if (p.from !== DISTRIBUTOR || p.asset_code !== "ITDBATMS" || p.asset_issuer !== ISSUER || p.to === ISSUER) continue;
  if (p.type !== "payment" && !p.type?.startsWith("path_payment")) continue;
  const memo = p.transaction?.memo ?? "";
  if (!memo.startsWith(MEMO_PREFIX)) {
    sales.push({ wallet: p.to, amount: Number(p.amount), at: Date.parse(p.created_at) });
    continue;
  }
  received.set(p.to, (received.get(p.to) ?? 0) + Number(p.amount));
  if (memo.startsWith("ATMS W")) receivedWaves.set(p.to, (receivedWaves.get(p.to) ?? 0) + Number(p.amount));
  if (memo === MEMO) paidThisRun.add(p.to);
}
if (mode !== "wave") {
  // base_amount always moves base_account → counter_account.
  for (const t of await pages(`${HORIZON}/accounts/${DISTRIBUTOR}/trades?order=asc&limit=200`)) {
    const at = Date.parse(t.ledger_close_time);
    if (t.base_asset_code === "ITDBATMS" && t.base_asset_issuer === ISSUER && t.base_account === DISTRIBUTOR)
      sales.push({ wallet: t.counter_account, amount: Number(t.base_amount), at });
    else if (t.counter_asset_code === "ITDBATMS" && t.counter_asset_issuer === ISSUER && t.counter_account === DISTRIBUTOR)
      sales.push({ wallet: t.base_account, amount: Number(t.counter_amount), at });
  }
  sales.sort((a, b) => a.at - b.at);
}

/** What each wallet bought from the distributor in [from, to]. */
function bought(from, to) {
  const m = new Map();
  for (const x of sales) if (x.at >= from && x.at <= to) m.set(x.wallet, (m.get(x.wallet) ?? 0) + x.amount);
  return m;
}

const rows = [];
const noTrustline = [];
if (mode === "wave") {
  for (const [wallet, balance] of holders) {
    if (paidThisRun.has(wallet)) continue;
    const basis = balance - (received.get(wallet) ?? 0);
    if (basis < MIN) continue;
    const amount = Math.floor(((basis * BONUS_PCT[wave]) / 100 - (receivedWaves.get(wallet) ?? 0)) * 1e7) / 1e7;
    if (amount > 0) rows.push({ wallet, basis, amount });
  }
} else {
  // Pre-sale orders filled when the sale opened, after the window shut:
  // everything up to that opening fill belongs to the pre-sale.
  const due =
    mode === "presale"
      ? bought(0, Math.max(PRESALE_ENDS_AT, sales[0]?.at ?? 0))
      : bought(Date.parse(DISCOUNT_STARTS_AT), DISCOUNT_ENDS_AT - 1);
  for (const [wallet, amount] of due) {
    if (paidThisRun.has(wallet) || (mode === "presale" && amount < MIN)) continue;
    if (!holders.has(wallet)) noTrustline.push(wallet); // a payment there would fail the whole batch
    else rows.push({ wallet, basis: amount, amount: Math.floor(amount * 1e7) / 1e7 });
  }
}
rows.sort((a, b) => b.amount - a.amount);
const total = rows.reduce((t, r) => t + r.amount, 0);

const dist = (await server.loadAccount(DISTRIBUTOR)).balances.find((b) => b.asset_code === "ITDBATMS" && b.asset_issuer === ISSUER);
const held = Number(dist?.balance ?? 0);

const title = { presale: "pre-sale bonus — tokens doubled", discount: "tier discount — tokens doubled", wave: `${wave}% wave — ${BONUS_PCT[wave]}% bonus tokens` }[mode];
console.log(`\nITDB ATMS ${title}, memo "${MEMO}"`);
console.log(`  holders with a trustline   ${holders.size}`);
console.log(`  already paid this kind     ${paidThisRun.size}`);
if (noTrustline.length) console.log(`  skipped, no trustline     ${noTrustline.length} (pay them by hand later, with memo "${MEMO}")`);
console.log(`  to pay now                 ${rows.length} wallets, ${total.toLocaleString("en-US")} ITDBATMS`);
console.log(`  distributor holds          ${held.toLocaleString("en-US")} ITDBATMS`);
if (total > held) die("The distributor cannot cover this payout.");
if (rows.length === 0) {
  console.log("\nNothing to pay.\n");
  process.exit(0);
}

if (!confirm) {
  console.log(`\n── DRY RUN — nothing has been sent ──`);
  for (const r of rows.slice(0, 25))
    console.log(`  ${r.wallet}  ${mode === "wave" ? "basis " : "bought"} ${r.basis.toLocaleString("en-US").padStart(10)}  →  +${r.amount.toLocaleString("en-US")}`);
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
  for (const r of batch) tx = tx.addOperation(Operation.payment({ destination: r.wallet, asset: atms, amount: r.amount.toFixed(7) }));
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
writeFileSync("atms-wave-paid.json", JSON.stringify({ wave, memo: MEMO, paid: done }, null, 2));
console.log(`\n  ${done.length} of ${rows.length} paid. Receipts in atms-wave-paid.json (do not commit it).`);
console.log(`  Members see "Sent to your wallet ✓" in the app within a minute. Re-running pays only who is left.\n`);
