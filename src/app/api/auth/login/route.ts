import { NextResponse } from "next/server";
import { mutateDb, toPublic, verifyPassword } from "@/lib/server/db";
import { sendOtpEmail } from "@/lib/server/mailer";
import { issueOtp } from "@/lib/server/otp";
import { attachSession } from "@/lib/server/session";

interface LoginBody {
  identifier?: string;
  password?: string;
}

/** After this many wrong passwords, the identifier is locked briefly. */
const LOCK_AFTER_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

export async function POST(req: Request) {
  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const identifier = body.identifier?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

  if (!identifier || !password) {
    return NextResponse.json(
      { error: "Enter your email or username and password." },
      { status: 400 },
    );
  }

  type LoginResult =
    | { error: string }
    | { locked: number }
    | { needsVerification: true; email: string; code: string }
    | { account: ReturnType<typeof toPublic> };

  const result = await mutateDb<LoginResult>((db) => {
    const now = Date.now();

    // Brute-force lockout per identifier
    const throttle = db.loginThrottle[identifier];
    if (throttle && now - throttle.lastAt > LOCK_MS) {
      delete db.loginThrottle[identifier];
    } else if (throttle && throttle.count >= LOCK_AFTER_FAILS) {
      return { locked: Math.ceil((LOCK_MS - (now - throttle.lastAt)) / 60000) };
    }

    const account = db.accounts.find(
      (a) => a.email === identifier || a.username === identifier,
    );

    // Uniform error — don't reveal whether the account exists
    if (!account || !verifyPassword(password, account)) {
      const prev = db.loginThrottle[identifier];
      db.loginThrottle[identifier] = { count: (prev?.count ?? 0) + 1, lastAt: now };
      return { error: "Wrong email/username or password." };
    }

    delete db.loginThrottle[identifier];

    // Unverified accounts must confirm their email first
    if (!account.emailVerified) {
      const code = issueOtp(db, account.email, "signup");
      return { needsVerification: true, email: account.email, code };
    }

    return { account: toPublic(account) };
  });

  if ("locked" in result)
    return NextResponse.json(
      {
        error: `Too many attempts — try again in ${result.locked} minute${result.locked > 1 ? "s" : ""}.`,
      },
      { status: 429 },
    );

  if ("error" in result)
    return NextResponse.json({ error: result.error }, { status: 401 });

  if ("needsVerification" in result) {
    const { sent } = await sendOtpEmail(result.email, result.code, "signup");
    return NextResponse.json(
      {
        error: "Please confirm your email to activate your account.",
        needsVerification: true,
        email: result.email,
        ...(sent ? {} : { devCode: result.code }),
      },
      { status: 403 },
    );
  }

  const res = NextResponse.json({ account: result.account });
  await attachSession(res, result.account.id);
  return res;
}
