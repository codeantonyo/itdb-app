import { NextResponse } from "next/server";
import { mutateDb, toPublic } from "@/lib/server/db";
import { attachSession, sessionAccountId } from "@/lib/server/session";
import { telegramUserId } from "@/lib/server/telegram";

interface Body {
  initData?: string;
}

/**
 * POST /api/auth/telegram  { initData }
 *
 * Telegram Mini App persistence — members shouldn't log in on every open:
 * 1. If the Telegram user is already bound to an account, sign them in.
 * 2. Otherwise, if the request carries a valid session, bind this
 *    Telegram user to that account — future opens hit case 1.
 * 3. Otherwise there's nothing to do; the client shows normal login.
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const tgId = telegramUserId(body.initData ?? "");
  if (!tgId) return NextResponse.json({ ok: false });

  const currentSession = await sessionAccountId(req);

  const result = await mutateDb((db) => {
    const bound = db.accounts.find((a) => a.telegramId === tgId);
    if (bound) return { account: toPublic(bound) };

    if (currentSession) {
      const account = db.accounts.find((a) => a.id === currentSession);
      if (account) {
        account.telegramId = tgId;
        return { account: toPublic(account) };
      }
    }
    return { none: true as const };
  });

  if ("none" in result) return NextResponse.json({ ok: false });

  const res = NextResponse.json({ ok: true, account: result.account });
  await attachSession(res, result.account.id);
  return res;
}
