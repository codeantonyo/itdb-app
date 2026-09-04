import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { NextResponse } from "next/server";
import { getDb, mutateDb } from "./db";

/**
 * Server sessions — signed httpOnly cookies (ported from NEWBANK).
 *
 * Login / verify set `itdb_session` (HMAC-signed, 30 days) and every
 * protected route derives the account from it — never from a client-
 * supplied accountId.
 *
 * The signing key is `SESSION_SECRET` when set (Vercel), otherwise a
 * key generated once and stored in the database so every serverless
 * instance signs with the same value.
 */

const COOKIE_NAME = "itdb_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const holder = globalThis as typeof globalThis & { __itdbSessionSecret?: string };

async function sessionSecret(): Promise<string> {
  if (holder.__itdbSessionSecret) return holder.__itdbSessionSecret;
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) {
    holder.__itdbSessionSecret = fromEnv;
    return fromEnv;
  }
  const db = await getDb();
  const secret =
    db.sessionSecret ??
    (await mutateDb((d) => (d.sessionSecret ??= randomBytes(32).toString("hex"))));
  holder.__itdbSessionSecret = secret;
  return secret;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Set the session cookie on an outgoing response. */
export async function attachSession(
  res: NextResponse,
  accountId: string,
): Promise<void> {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${accountId}.${expires}`;
  const token = `${payload}.${sign(payload, await sessionSecret())}`;
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

/** Remove the session cookie (sign-out). */
export function clearSession(res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** The authenticated accountId, or null when absent/expired/forged. */
export async function sessionAccountId(req: Request): Promise<string | null> {
  const cookies = req.headers.get("cookie") ?? "";
  const raw = cookies.split(/;\s*/).find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!raw) return null;

  const token = decodeURIComponent(raw.slice(COOKIE_NAME.length + 1));
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [accountId, expiresStr, sig] = parts;
  const expires = Number(expiresStr);
  if (!accountId || !Number.isFinite(expires) || expires < Date.now()) {
    return null;
  }

  const expected = sign(`${accountId}.${expires}`, await sessionSecret());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return accountId;
}
