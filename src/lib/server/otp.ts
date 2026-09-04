import { createHash, randomInt } from "crypto";
import type { DbShape, OtpPurpose } from "./db";

/**
 * One-time codes for email verification, password reset and email change.
 * 6 digits, 10-minute expiry, 5 attempts, single active code per
 * (email, purpose) pair.
 */

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashCode(email: string, purpose: OtpPurpose, code: string): string {
  return createHash("sha256")
    .update(`${email.toLowerCase()}|${purpose}|${code}`)
    .digest("hex");
}

/** Creates (or replaces) the active code and returns it for delivery. */
export function issueOtp(db: DbShape, email: string, purpose: OtpPurpose): string {
  const normalized = email.toLowerCase();
  const code = String(randomInt(100000, 1000000));
  db.otps = db.otps.filter(
    (o) =>
      !(o.email === normalized && o.purpose === purpose) && o.expiresAt > Date.now(),
  );
  db.otps.push({
    email: normalized,
    purpose,
    codeHash: hashCode(normalized, purpose, code),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });
  return code;
}

export type OtpResult = "ok" | "expired" | "invalid";

/** Validates and consumes a code. */
export function consumeOtp(
  db: DbShape,
  email: string,
  purpose: OtpPurpose,
  code: string,
): OtpResult {
  const normalized = email.toLowerCase();
  const record = db.otps.find((o) => o.email === normalized && o.purpose === purpose);
  if (!record || record.expiresAt < Date.now()) {
    db.otps = db.otps.filter((o) => o !== record);
    return "expired";
  }
  if (record.codeHash !== hashCode(normalized, purpose, code.trim())) {
    record.attempts += 1;
    if (record.attempts >= MAX_ATTEMPTS) {
      db.otps = db.otps.filter((o) => o !== record);
      return "expired";
    }
    return "invalid";
  }
  db.otps = db.otps.filter((o) => o !== record);
  return "ok";
}
