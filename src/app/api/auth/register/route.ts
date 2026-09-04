import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { REFERRAL_RE, referralCodeFor } from "@/lib/referral";
import {
  hashPassword,
  mutateDb,
  newSalt,
  usernameFrom,
  type DbAccount,
} from "@/lib/server/db";
import { sendOtpEmail } from "@/lib/server/mailer";
import { issueOtp } from "@/lib/server/otp";

const ADDRESS_RE = /^G[A-Z2-7]{55}$/;

interface RegisterBody {
  name?: string;
  email?: string;
  password?: string;
  address?: string;
  referredBy?: string | null;
}

export async function POST(req: Request) {
  let body: RegisterBody;
  try {
    body = (await req.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const address = body.address?.trim().toUpperCase() ?? "";
  const referredBy = body.referredBy?.trim().toUpperCase() || null;

  if (name.length < 2)
    return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  if (!/^\S+@\S+\.\S+$/.test(email))
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  if (password.length < 8)
    return NextResponse.json(
      { error: "Passwords need at least 8 characters." },
      { status: 400 },
    );
  if (!ADDRESS_RE.test(address))
    return NextResponse.json({ error: "Invalid Stellar address." }, { status: 400 });
  if (referredBy && !REFERRAL_RE.test(referredBy))
    return NextResponse.json({ error: "Referral codes look like ITDB-A1B2C3." }, { status: 400 });

  // The admin role is granted to the wallet named in the environment —
  // no seeded admin account, no hard-coded password.
  const adminWallet = process.env.ITDB_ADMIN_WALLET?.trim().toUpperCase();

  const result = await mutateDb((db) => {
    if (db.accounts.some((a) => a.email === email)) {
      return { error: "An account with this email already exists. Sign in instead." };
    }
    const salt = newSalt();
    const account: DbAccount = {
      id: randomUUID(),
      name,
      email,
      emailVerified: false,
      username: usernameFrom(name, new Set(db.accounts.map((a) => a.username))),
      passwordHash: hashPassword(password, salt),
      salt,
      role: adminWallet && address === adminWallet ? "admin" : "user",
      wallets: [address],
      referralCode: referralCodeFor(address),
      referredBy,
      createdAt: Date.now(),
    };
    db.accounts.push(account);
    // Email confirmation gate — account activates once the OTP is verified
    const code = issueOtp(db, email, "signup");
    return { code };
  });

  if ("error" in result)
    return NextResponse.json({ error: result.error }, { status: 409 });

  const { sent } = await sendOtpEmail(email, result.code, "signup");
  return NextResponse.json({
    pendingVerification: true,
    email,
    // Dev mode only: surfaced when no email provider is configured
    ...(sent ? {} : { devCode: result.code }),
  });
}
