import { NextResponse } from "next/server";
import { getDb, toPublic } from "@/lib/server/db";
import { clearSession, sessionAccountId } from "@/lib/server/session";

/** GET /api/auth/session — who the cookie says you are (or null). */
export async function GET(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return NextResponse.json({ accountId: null });
  const db = await getDb();
  const account = db.accounts.find((a) => a.id === id);
  return NextResponse.json({
    accountId: account ? id : null,
    account: account ? toPublic(account) : null,
  });
}

/** DELETE /api/auth/session — sign out. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clearSession(res);
  return res;
}
