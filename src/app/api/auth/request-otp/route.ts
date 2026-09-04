import { NextResponse } from "next/server";
import { mutateDb, type OtpPurpose } from "@/lib/server/db";
import { sendOtpEmail } from "@/lib/server/mailer";
import { issueOtp } from "@/lib/server/otp";

interface Body {
  purpose?: OtpPurpose;
  email?: string;
}

/**
 * Escalating resend cooldowns per email: the 1st code is instant, then
 * 5m → 10m → 30m → 1h between further codes. The counter resets after a
 * quiet day.
 */
const RESEND_LADDER_MS = [0, 5 * 60 * 1000, 10 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000];
const LADDER_RESET_MS = 24 * 60 * 60 * 1000;

function formatWait(ms: number): string {
  const minutes = Math.ceil(ms / 60000);
  return minutes >= 60 ? `${Math.ceil(minutes / 60)}h` : `${Math.max(minutes, 1)} min`;
}

/** Issues (or re-issues) a one-time code for the given purpose. */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const purpose = body.purpose;
  const email = body.email?.trim().toLowerCase() ?? "";
  if (
    !email ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    !purpose ||
    !["signup", "reset", "change_email"].includes(purpose)
  ) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  type OtpResult = { throttled: number } | { error: string } | { code: string };

  const result = await mutateDb<OtpResult>((db) => {
    const now = Date.now();

    for (const [key, entry] of Object.entries(db.otpThrottle)) {
      if (now - entry.lastAt > LADDER_RESET_MS) delete db.otpThrottle[key];
    }
    const throttle = db.otpThrottle[email];
    const wait = RESEND_LADDER_MS[Math.min(throttle?.count ?? 0, RESEND_LADDER_MS.length - 1)];
    if (throttle && now - throttle.lastAt < wait) {
      return { throttled: wait - (now - throttle.lastAt) };
    }

    const account = db.accounts.find((a) => a.email === email);

    if (purpose === "signup") {
      if (!account) return { error: "Account not found." };
      if (account.emailVerified)
        return { error: "This account is already verified — just sign in." };
    }
    if (purpose === "reset" && !account) {
      return { error: "No account found with this email." };
    }
    if (purpose === "change_email" && account) {
      return { error: "That email is already in use by another account." };
    }

    db.otpThrottle[email] = { count: (throttle?.count ?? 0) + 1, lastAt: now };
    return { code: issueOtp(db, email, purpose) };
  });

  if ("throttled" in result)
    return NextResponse.json(
      {
        error: `A code was recently sent — you can request another in ${formatWait(result.throttled)}.`,
        retryAfter: Math.ceil(result.throttled / 1000),
      },
      { status: 429 },
    );

  if ("error" in result)
    return NextResponse.json({ error: result.error }, { status: 400 });

  const { sent } = await sendOtpEmail(email, result.code, purpose);
  return NextResponse.json({ ok: true, ...(sent ? {} : { devCode: result.code }) });
}
