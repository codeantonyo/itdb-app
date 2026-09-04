import { NextResponse } from "next/server";
import { hashPassword, mutateDb, newSalt, toPublic } from "@/lib/server/db";
import { consumeOtp } from "@/lib/server/otp";
import { attachSession } from "@/lib/server/session";

interface Body {
  email?: string;
  code?: string;
  newPassword?: string;
}

/** Completes a "forgot password" flow: OTP + new password. */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const code = body.code?.trim() ?? "";
  const newPassword = body.newPassword ?? "";

  if (!email || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "Passwords need at least 8 characters." },
      { status: 400 },
    );
  }

  const result = await mutateDb((db) => {
    const account = db.accounts.find((a) => a.email === email);
    if (!account) return { error: "Account not found." };
    const otp = consumeOtp(db, email, "reset", code);
    if (otp === "invalid") return { error: "Wrong code — check your email and try again." };
    if (otp === "expired") return { error: "That code expired. Request a new one." };
    account.salt = newSalt();
    account.passwordHash = hashPassword(newPassword, account.salt);
    account.emailVerified = true; // proving email ownership verifies it
    return { account: toPublic(account) };
  });

  if ("error" in result)
    return NextResponse.json({ error: result.error }, { status: 400 });
  const res = NextResponse.json(result);
  await attachSession(res, result.account.id);
  return res;
}
