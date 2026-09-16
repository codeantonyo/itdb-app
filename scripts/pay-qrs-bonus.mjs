#!/usr/bin/env node
/**
 * Pay the QRS 25% Milestone Bonus on chain.
 *
 * Run BY A PERSON, not by the app. The app records what is owed; this
 * script is what actually moves the tokens, and you run it yourself.
 *
 *   1. Install the SDK once:   npm i -D @stellar/stellar-sdk
 *   2. Save the payout list:   open https://<your-app>/api/admin/qrs-bonus
 *                              while signed in as admin, save as payouts.json
 *   3. Dry run (no send):      node --env-file=.env scripts/pay-qrs-bonus.mjs payouts.json
 *   4. Send for real:          node --env-file=.env scripts/pay-qrs-bonus.mjs payouts.json --confirm
 *
 * QRS_SECRET is read from the environment file you pass on the command
 * line. It is never taken as an argument (that would put it in your
 * shell history) and never printed — not in logs, not in errors.
 *
 * The dry run is the default on purpose: it shows every payment, checks
 * each destination can actually receive QRS, and warns before the total
 * issued would pass the supply cap. Read it before using --confirm.
 */

import { readFileSync, writeFileSync } from "node:fs";

const HORIZON = process.env.HORIZON_URL ?? "https://horizon.stellar.org";
const SUPPLY_CAP = 100_000_000;
const OPS_PER_TX = 95; // Stellar allows 100; leave headroom

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const confirm = args.includes("--confirm");

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

if (!file) die("Pass the payout file: node --env-file=.env scripts/pay-qrs-bonus.mjs payouts.json");

const secret = process.env.QRS_SECRET;
if (!secret) die("QRS_SECRET is not set. Pass your env file: node --env-file=.env scripts/pay-qrs-bonus.mjs ...");
if (!/^S[A-Z2-7]{55}$/.test(secret)) die("QRS_SECRET does not look like a Stellar secret key (S… , 56 chars).");

let sdk;
try {
  sdk = await import("@stellar/stellar-sdk");
} catch {
  die("The Stellar SDK is not installed. Run:  npm i -D @stellar/stellar-sdk");
}
const { Keypair, TransactionBuilder, Operation, Asset, Networks, BASE_FEE, Horizon } = sdk;

const report = JSON.parse(readFileSync(file, "utf8"));
const asset = report.asset ?? {};
if (!asset.code || !asset.issuer) die(`${file} does not look like the admin payout report.`);

const keypair = Keypair.fromSecret(secret);
const issuer = keypair.publicKey();
if (issuer !== asset.issuer) {
  die(
    `QRS_SECRET belongs to ${issuer},\n  but the report's issuer is ${asset.issuer}.\n` +
      "  Refusing to pay from the wrong account.",
  );
}

const unpaid = (report.rows ?? []).filter((r) => !r.paidOnChainAt && r.bonusQrs > 0);
if (unpaid.length === 0) {
  console.log("\nNothing to pay — every row in the report is already marked paid.\n");
  process.exit(0);
}

const server = new Horizon.Server(HORIZON);
const qrs = new Asset(asset.code, asset.issuer);

// ---- checks before anything is signed ---------------------------------

console.log(`\nQRS ${report.pct}% Milestone Bonus payout`);
console.log(`  issuer      ${issuer}`);
console.log(`  horizon     ${HORIZON}`);
console.log(`  rows unpaid ${unpaid.length} of ${report.rows.length}\n`);

process.stdout.write("Checking destinations can receive QRS… ");
const payable = [];
const blocked = [];
for (const row of unpaid) {
  const dest = row.wallets?.[0];
  if (!dest) {
    blocked.push({ row, why: "no wallet recorded" });
    continue;
  }
  try {
    const acct = await server.loadAccount(dest);
    const line = acct.balances.find(
      (b) => b.asset_code === asset.code && b.asset_issuer === asset.issuer,
    );
    if (!line) blocked.push({ row, why: "no QRS trustline" });
    else if (line.is_authorized === false) blocked.push({ row, why: "trustline not authorized" });
    else payable.push({ row, dest });
  } catch {
    blocked.push({ row, why: "account not found on chain" });
  }
}
console.log("done\n");

const total = payable.reduce((s, p) => s + p.row.bonusQrs, 0);

if (blocked.length > 0) {
  console.log(`⚠ ${blocked.length} row(s) cannot be paid and are skipped:`);
  for (const b of blocked.slice(0, 20))
    console.log(`    ${b.row.username.padEnd(16)} ${String(b.row.bonusQrs).padStart(12)} QRS — ${b.why}`);
  if (blocked.length > 20) console.log(`    …and ${blocked.length - 20} more`);
  console.log("");
}

// Supply cap: an issuer payment MINTS, and Stellar does not enforce a
// cap unless the issuer is locked. Check it here so the promise holds.
try {
  const [{ amount: circulating = "0" } = {}] = (
    await server.assets().forCode(asset.code).forIssuer(asset.issuer).call()
  ).records;
  const after = Number(circulating) + total;
  console.log(`  circulating now   ${Number(circulating).toLocaleString("en-US")} QRS`);
  console.log(`  this payout       ${total.toLocaleString("en-US")} QRS`);
  console.log(`  after payout      ${after.toLocaleString("en-US")} QRS of ${SUPPLY_CAP.toLocaleString("en-US")} cap`);
  if (after > SUPPLY_CAP) {
    console.log(`\n⚠ THIS PAYOUT WOULD PASS THE ${SUPPLY_CAP.toLocaleString("en-US")} QRS CAP by ${(after - SUPPLY_CAP).toLocaleString("en-US")} QRS.`);
    if (confirm) die("Refusing to mint past the stated cap. Remove --confirm and review the list.");
  }
} catch {
  console.log("  (could not read circulating supply — check the cap yourself)");
}

if (payable.length === 0) die("No payable rows.");

if (!confirm) {
  console.log(`\n── DRY RUN — nothing has been sent ──`);
  for (const p of payable.slice(0, 30))
    console.log(`  ${p.row.username.padEnd(16)} ${String(p.row.bonusQrs).padStart(12)} QRS  →  ${p.dest}`);
  if (payable.length > 30) console.log(`  …and ${payable.length - 30} more`);
  console.log(`\n  ${payable.length} payments, ${total.toLocaleString("en-US")} QRS total.`);
  console.log(`  Re-run with --confirm to send.\n`);
  process.exit(0);
}

// ---- send -------------------------------------------------------------

const batches = [];
for (let i = 0; i < payable.length; i += OPS_PER_TX) batches.push(payable.slice(i, i + OPS_PER_TX));

console.log(`Sending ${payable.length} payments in ${batches.length} transaction(s)…\n`);
const done = [];
for (const [i, batch] of batches.entries()) {
  const account = await server.loadAccount(issuer); // reload for a fresh sequence
  let tx = new TransactionBuilder(account, {
    fee: String(Number(BASE_FEE) * 10),
    networkPassphrase: Networks.PUBLIC,
  });
  for (const p of batch) {
    tx = tx.addOperation(
      Operation.payment({ destination: p.dest, asset: qrs, amount: p.row.bonusQrs.toFixed(7) }),
    );
  }
  const built = tx.setTimeout(120).build();
  built.sign(keypair);
  try {
    const res = await server.submitTransaction(built);
    console.log(`  batch ${i + 1}/${batches.length}: ${batch.length} paid — ${res.hash}`);
    for (const p of batch) done.push({ accountId: p.row.accountId, txHash: res.hash, at: Date.now() });
  } catch (e) {
    const codes = e?.response?.data?.extras?.result_codes;
    console.error(`  batch ${i + 1}/${batches.length} FAILED${codes ? `: ${JSON.stringify(codes)}` : ""}`);
    break; // stop rather than plough on — earlier batches stay recorded
  }
}

const out = "qrs-bonus-paid.json";
writeFileSync(out, JSON.stringify({ paid: done }, null, 2));
console.log(`\n  ${done.length} of ${payable.length} paid. Receipts written to ${out}.`);
console.log(`  Mark them delivered in the app by POSTing that file to /api/admin/qrs-bonus`);
console.log(`  while signed in as admin. Unpaid rows stay listed, so re-running is safe.\n`);
