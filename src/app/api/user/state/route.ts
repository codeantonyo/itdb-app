import { NextResponse } from "next/server";
import { getDb, mutateDb } from "@/lib/server/db";
import { sessionAccountId } from "@/lib/server/session";

/**
 * Durable per-account state backup.
 *
 * GET  /api/user/state?id={accountId}      → returns the stored blob
 * PATCH /api/user/state  { id, blob }       → merges keys into the blob
 *
 * The blob is a snapshot of the account's namespaced localStorage keys
 * (the card, notifications). This makes that data survive cookie clears
 * and follow the member across devices.
 */

// Guardrail so a runaway blob can't bloat the row unbounded.
const MAX_BLOB_BYTES = 256 * 1024;

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing account id" }, { status: 400 });
  const sessionId = await sessionAccountId(req);
  if (sessionId !== id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const db = await getDb();
  const record = db.userStates[id];
  return NextResponse.json({ blob: record?.blob ?? {}, updatedAt: record?.updatedAt ?? 0 });
}

interface PatchBody {
  id?: string;
  blob?: Record<string, string>;
}

export async function PATCH(req: Request) {
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { id, blob } = body;
  if (!id || !blob || typeof blob !== "object") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const sessionId = await sessionAccountId(req);
  if (sessionId !== id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  if (JSON.stringify(blob).length > MAX_BLOB_BYTES) {
    return NextResponse.json({ error: "State too large" }, { status: 413 });
  }

  // No-op pushes skip the write entirely.
  const cached = await getDb();
  const current = cached.userStates[id]?.blob;
  if (current) {
    const merged = { ...current, ...blob };
    if (JSON.stringify(merged) === JSON.stringify(current)) {
      return NextResponse.json({ ok: true, unchanged: true });
    }
  }

  const result = await mutateDb((db) => {
    const account = db.accounts.find((a) => a.id === id);
    if (!account) return { error: "Account not found" as const };
    const existing = db.userStates[id]?.blob ?? {};
    db.userStates[id] = { blob: { ...existing, ...blob }, updatedAt: Date.now() };
    return { ok: true as const };
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true });
}
