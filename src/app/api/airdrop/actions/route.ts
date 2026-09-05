import { NextResponse } from "next/server";
import { claimAirdrop, withdrawAirdrop } from "@/lib/server/airdrop";
import { getDb } from "@/lib/server/db";
import { sessionAccountId } from "@/lib/server/session";
import { notifyAccount } from "@/lib/server/telegram";
import { formatExactCurrency } from "@/lib/format";

interface Body {
  action?: "claim" | "withdraw";
  /** withdraw: which asset, how many units, and the destination card */
  code?: string;
  units?: number;
  to?: string;
}

/** POST /api/airdrop/actions — claim the airdrop, or withdraw value to a card. */
export async function POST(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const db = await getDb();
  const account = db.accounts.find((a) => a.id === id);
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  if (body.action === "claim") {
    const result = await claimAirdrop(account);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    void notifyAccount(
      id,
      `🎁 <b>Airdrop claimed</b>\n\n` +
        `${result.lines} assets worth <b>${formatExactCurrency(result.grantUsd)}</b> at today's rates ` +
        `are now in your airdrop holdings.\n\nWithdraw any of it to your card whenever you like.`,
    );
    return NextResponse.json(result);
  }

  if (body.action === "withdraw") {
    const code = body.code?.trim().toUpperCase() ?? "";
    const units = Number(body.units);
    const to = body.to?.trim() ?? "";
    if (!code || !to) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const result = await withdrawAirdrop(account, code, units, to);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    void notifyAccount(
      id,
      `💳 <b>Airdrop withdrawal</b>\n\n` +
        `<b>${formatExactCurrency(result.usd)}</b> of ${result.code} has landed on your card` +
        `${result.currency !== "USD" ? ` as ${result.credited.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${result.currency}` : ""}.`,
    );
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
