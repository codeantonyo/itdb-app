import { NextResponse } from "next/server";
import { mutateDb, toPublic } from "@/lib/server/db";
import { consumeOtp } from "@/lib/server/otp";
import { sessionAccountId } from "@/lib/server/session";

interface Body {
  newEmail?: string;
  code?: string;
}

/**
 * Completes an email change: the OTP was sent to the NEW address,
 * proving the member controls it.
 */
export async function POST(req: Request) {
  const sessionId = await sessionAccountId(req);
  if (!sessionId)
    return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const newEmail = body.newEmail?.trim().toLowerCase() ?? "";
  const code = body.code?.trim() ?? "";

  if (!/^\S+@\S+\.\S+$/.test(newEmail) || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = await mutateDb((db) => {
    const account = db.accounts.find((a) => a.id === sessionId);
    if (!account) return { error: "Account not found." };
    if (db.accounts.some((a) => a.id !== account.id && a.email === newEmail)) {
      return { error: "That email is already in use by another account." };
    }
    const otp = consumeOtp(db, newEmail, "change_email", code);
    if (otp === "invalid") return { error: "Wrong code — check your email and try again." };
    if (otp === "expired") return { error: "That code expired. Request a new one." };
    account.email = newEmail;
    account.emailVerified = true;
    return { account: toPublic(account) };
  });

  if ("error" in result)
    return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
