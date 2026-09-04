import type { OtpPurpose } from "./db";

/**
 * Transactional email via Brevo (free tier: 300 emails/day).
 *
 * Setup:
 *   1. Create a free account at https://www.brevo.com
 *   2. Verify a sender address (Settings → Senders)
 *   3. Create an API key (SMTP & API → API keys)
 *   4. Set env vars:  BREVO_API_KEY, MAIL_FROM_EMAIL, MAIL_FROM_NAME
 *
 * Without a key the mailer runs in DEV MODE: the code is logged to the
 * server console and returned to the client so flows stay testable.
 */

const SUBJECTS: Record<OtpPurpose, string> = {
  signup: "Confirm your ITDB account",
  reset: "Reset your ITDB password",
  change_email: "Confirm your new ITDB email",
};

const INTROS: Record<OtpPurpose, string> = {
  signup: "Welcome to the International Tokenized Development Bank. Use this code to activate your account:",
  reset: "Use this code to reset your ITDB password:",
  change_email: "Use this code to confirm your new email address:",
};

function htmlFor(purpose: OtpPurpose, code: string): string {
  return `
  <div style="font-family:Georgia,'Times New Roman',serif;max-width:460px;margin:0 auto;padding:36px 28px;background:#06162f;border:1px solid rgba(212,160,23,0.35);border-radius:6px;color:#f4efe4">
    <p style="font-size:12px;letter-spacing:0.28em;font-weight:700;margin:0 0 6px;color:#d4a017">ITDB</p>
    <p style="font-size:11px;letter-spacing:0.08em;margin:0 0 26px;color:rgba(244,239,228,0.55);font-family:system-ui,-apple-system,sans-serif">International Tokenized Development Bank</p>
    <p style="font-size:15px;line-height:1.6;color:rgba(244,239,228,0.8);margin:0 0 22px;font-family:system-ui,-apple-system,sans-serif">${INTROS[purpose]}</p>
    <p style="font-size:36px;font-weight:700;letter-spacing:0.3em;margin:0 0 22px;color:#ffe9a3;font-family:system-ui,-apple-system,sans-serif">${code}</p>
    <p style="font-size:13px;color:rgba(244,239,228,0.5);margin:0;font-family:system-ui,-apple-system,sans-serif">This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</p>
  </div>`;
}

export interface MailResult {
  /** false = dev mode (no BREVO_API_KEY) or provider error */
  sent: boolean;
}

export async function sendOtpEmail(
  to: string,
  code: string,
  purpose: OtpPurpose,
): Promise<MailResult> {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    console.log(`[mailer:dev] OTP for ${to} (${purpose}): ${code}`);
    return { sent: false };
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: process.env.MAIL_FROM_NAME ?? "ITDB",
          email: process.env.MAIL_FROM_EMAIL ?? "no-reply@itdb-qfs.org",
        },
        to: [{ email: to }],
        subject: SUBJECTS[purpose],
        htmlContent: htmlFor(purpose, code),
      }),
    });
    if (!res.ok) {
      console.error(`[mailer] Brevo error ${res.status}: ${await res.text()}`);
      return { sent: false };
    }
    return { sent: true };
  } catch (e) {
    console.error("[mailer] send failed", e);
    return { sent: false };
  }
}
