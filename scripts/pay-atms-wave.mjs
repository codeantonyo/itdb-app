#!/usr/bin/env node
/**
 * Pay ITDB ATMS milestone bonus tokens on chain.
 *
 * Run BY A PERSON, not by the app:
 *
 *   1. Put the ITDBATMS distributor's secret in .env as  ATMS_SECRET=S...
 *   2. Dry run (sends nothing):  node --env-file=.env scripts/pay-atms-wave.mjs --wave 25
 *   3. Send:                     node --env-file=.env scripts/pay-atms-wave.mjs --wave 25 --confirm
 *
 * Who and how much, all read from the chain at run time:
 *   - every wallet holding ITDBATMS whose balance, minus bonus tokens it
 *     already received, is 1,000 or more ("basis");
 *   - due for the wave = basis × the wave's bonus (25% → 100%, 50% →
 *     200%, 75% → 300%, 100% → 500%). Waves REPLACE, they do not add:
 *     what earlier waves already paid is subtracted, so a later run pays
 *     only the top-up.
 *
 * Every payment carries the memo "ATMS W<wave>". That is how a re-run
 * knows who is paid (re-running is safe), and how the app tells bonuses
 * from sales — without it, bonuses would count as "sold" and unlock the
 * next wave on their own. Never pay a bonus from this account without it.
 *
 * The secret is read from the env file only — never an argument, never
 * printed.
 */

const ISSUER = "GDEIVYTG65ECPXM2SMFPAL5GRFASAYDPDMJ6NY3WKMCWCRLOC2OAOATM";
const DISTRIBUTOR = "GA7I3HKV3AN7OSCKNU625D6SN6YDMMYTY3AUVXQ6HZQRNBY47M7AQQFS";
const HORIZON = "https://horizon.stellar.org";
const MEMO_PREFIX = "ATMS W"; // = WAVE_MEMO_PREFIX in src/lib/itdb/atms.ts
const BONUS_PCT = { 25: 100, 50: 200, 75: 300, 100: 500 };
const MIN = 1_000;
const OPS_PER_TX = 95;

const args = process.argv.slice(2);
const wave = Number(args[args.indexOf("--wave") + 1] || 25);
const confirm = args.includes("--confirm");
const die = (m) => {
  console.error(`\n✗ ${m}\n`);
  process.exit(1);
};
if (!BONUS_PCT[wave]) die("--wave must be 25, 50, 75 or 100.");
const MEMO = `${MEMO_PREFIX}${wave}`;

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

const received = new Map(); // every bonus already paid, any wave
const paidThisWave = new Set();
for (const p of await pages(`${HORIZON}/accounts/${DISTRIBUTOR}/payments?order=asc&limit=200&join=transactions`)) {
  const memo = p.transaction?.memo ?? "";
  if (p.from !== DISTRIBUTOR || p.asset_code !== "ITDBATMS" || !memo.startsWith(MEMO_PREFIX)) continue;
  received.set(p.to, (received.get(p.to) ?? 0) + Number(p.amount));
  if (memo === MEMO) paidThisWave.add(p.to);
}

const rows = [];
for (const [wallet, balance] of holders) {
  if (paidThisWave.has(wallet)) continue;
  const already = received.get(wallet) ?? 0;
  const basis = balance - already;
  if (basis < MIN) continue;
  const amount = Math.floor(((basis * BONUS_PCT[wave]) / 100 - already) * 1e7) / 1e7;
  if (amount > 0) rows.push({ wallet, basis, amount });
}
rows.sort((a, b) => b.amount - a.amount);
const total = rows.reduce((t, r) => t + r.amount, 0);

const dist = (await server.loadAccount(DISTRIBUTOR)).balances.find((b) => b.asset_code === "ITDBATMS" && b.asset_issuer === ISSUER);
const held = Number(dist?.balance ?? 0);

console.log(`\nITDB ATMS ${wave}% wave — ${BONUS_PCT[wave]}% bonus tokens, memo "${MEMO}"`);
console.log(`  holders with a trustline   ${holders.size}`);
console.log(`  already paid this wave     ${paidThisWave.size}`);
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
    console.log(`  ${r.wallet}  basis ${r.basis.toLocaleString("en-US").padStart(10)}  →  +${r.amount.toLocaleString("en-US")}`);
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
