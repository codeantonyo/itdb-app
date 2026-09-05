import { NextResponse } from "next/server";
import { MAX_WALLETS } from "@/lib/itdb/config";
import { mutateDb, toPublic } from "@/lib/server/db";
import { sessionAccountId } from "@/lib/server/session";

const ADDRESS_RE = /^G[A-Z2-7]{55}$/;

interface PatchBody {
  id?: string;
  name?: string;
  username?: string;
  wallets?: string[];
}

/**
 * PATCH /api/auth/account — sync profile edits and wallet changes.
 * Authenticated by the session cookie; the body's `id` is only accepted
 * when it matches the session.
 */
export async function PATCH(req: Request) {
  const sessionId = await sessionAccountId(req);
  if (!sessionId)
    return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (body.id && body.id !== sessionId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await mutateDb((db) => {
    const account = db.accounts.find((a) => a.id === sessionId);
    if (!account) return { error: "Account not found" };

    if (body.name && body.name.trim().length >= 2) {
      account.name = body.name.trim();
    }
    if (body.username) {
      const username = body.username.toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (username.length >= 3) {
        const taken = db.accounts.some(
          (a) => a.id !== account.id && a.username === username,
        );
        if (taken) return { error: "That username is already taken." };
        account.username = username;
      }
    }
    if (Array.isArray(body.wallets)) {
      // De-duplicate, keep only valid addresses, and enforce the cap
      // server-side so the client can't raise it.
      const valid = [...new Set(body.wallets.filter((w) => ADDRESS_RE.test(w)))];
      if (valid.length > MAX_WALLETS) {
        return { error: `You can link up to ${MAX_WALLETS} wallets.` };
      }
      // Primary wallet (index 0) can never be removed
      if (valid.length > 0 && valid[0] === account.wallets[0]) {
        account.wallets = valid;
      }
    }
    return { account: toPublic(account) };
  });

  if ("error" in result) {
    const status = result.error === "Account not found" ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result);
}
