/**
 * Verify the Brevo configuration without touching the app or database.
 *
 *   node --env-file=.env.local scripts/test-email.mjs you@example.com
 *
 * Reads BREVO_API_KEY / MAIL_FROM_EMAIL / MAIL_FROM_NAME from the
 * environment and sends one email built exactly like the real OTP mail
 * (src/lib/server/mailer.ts), so a success here means signup, password
 * reset and email-change will all work.
 *
 * The key is never passed on the command line — it would land in shell
 * history. Put it in .env.local (git-ignored) and use --env-file.
 */

const recipient = process.argv[2];
const apiKey = process.env.BREVO_API_KEY;
const fromEmail = process.env.MAIL_FROM_EMAIL;
const fromName = process.env.MAIL_FROM_NAME ?? "ITDB";

const die = (msg) => {
  console.error(`\n  ✖ ${msg}\n`);
  process.exit(1);
};

if (!recipient || !recipient.includes("@")) {
  die("Pass the address to send to:\n    node --env-file=.env.local scripts/test-email.mjs you@example.com");
}
if (!apiKey) {
  die("BREVO_API_KEY is not set. Add it to .env.local, then re-run with --env-file=.env.local");
}
if (!fromEmail) {
  die(
    "MAIL_FROM_EMAIL is not set.\n    Brevo rejects any sender it has not verified, so this must be an address\n    or domain you verified in Brevo (Senders, Domains & Dedicated IPs).",
  );
}

const code = String(Math.floor(100000 + Math.random() * 900000));

// Same markup the app sends, so this also previews the real design.
const html = `
  <div style="font-family:Georgia,'Times New Roman',serif;max-width:460px;margin:0 auto;padding:36px 28px;background:#06162f;border:1px solid rgba(212,160,23,0.35);border-radius:6px;color:#f4efe4">
    <p style="font-size:12px;letter-spacing:0.28em;font-weight:700;margin:0 0 6px;color:#d4a017">ITDB</p>
    <p style="font-size:11px;letter-spacing:0.08em;margin:0 0 26px;color:rgba(244,239,228,0.55);font-family:system-ui,-apple-system,sans-serif">International Tokenized Development Bank</p>
    <p style="font-size:15px;line-height:1.6;color:rgba(244,239,228,0.8);margin:0 0 22px;font-family:system-ui,-apple-system,sans-serif">This is a configuration test. Your code would look like this:</p>
    <p style="font-size:36px;font-weight:700;letter-spacing:0.3em;margin:0 0 22px;color:#ffe9a3;font-family:system-ui,-apple-system,sans-serif">${code}</p>
    <p style="font-size:13px;color:rgba(244,239,228,0.5);margin:0;font-family:system-ui,-apple-system,sans-serif">If this arrived in your inbox, ITDB email is configured correctly.</p>
  </div>`;

console.log(`\n  Sending as : ${fromName} <${fromEmail}>`);
console.log(`  Sending to : ${recipient}`);
console.log(`  API key    : ${apiKey.slice(0, 8)}… (${apiKey.length} chars)\n`);

const res = await fetch("https://api.brevo.com/v3/smtp/email", {
  method: "POST",
  headers: {
    "api-key": apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({
    sender: { name: fromName, email: fromEmail },
    to: [{ email: recipient }],
    subject: "ITDB email configuration test",
    htmlContent: html,
  }),
});

const body = await res.text();

if (res.ok) {
  console.log(`  ✔ Brevo accepted it (HTTP ${res.status}). ${body}`);
  console.log("\n  Check the inbox, and the spam folder. If it landed in spam,");
  console.log("  verify a domain you own rather than a single address.\n");
  process.exit(0);
}

console.error(`  ✖ Brevo refused it (HTTP ${res.status})`);
console.error(`    ${body}\n`);

if (res.status === 401) {
  console.error("  The key is wrong, revoked, or has a leading/trailing space.");
  console.error("  Make a fresh one under SMTP & API, and copy the v3 API key.\n");
} else if (body.includes("sender")) {
  console.error(`  Brevo does not recognise ${fromEmail} as a verified sender.`);
  console.error("  Verify that exact address, or the whole domain, in Brevo first.\n");
}
process.exit(1);
