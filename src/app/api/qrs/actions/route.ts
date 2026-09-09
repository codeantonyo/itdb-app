import { NextResponse } from "next/server";
import { collectYield } from "@/lib/server/accrual";
import { getDb } from "@/lib/server/db";
import { payPresaleRefund } from "@/lib/server/presale";
import { sessionAccountId } from "@/lib/server/session";
import { notifyAccount } from "@/lib/server/telegram";
import { formatExactCurrency } from "@/lib/format";

interface Body {
  action?: "collect" | "presale-refund";
  /** "account" or the cardId */
  to?: string;
}

/**
 * POST /api/qrs/actions
 *   collect         — collect accrued QRS daily yield
 *   presale-refund  — take the 20% pre-sale refund onto a card
 */
export async function POST(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (body.action !== "collect" && body.action !== "presale-refund")
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const db = await getDb();
  const account = db.accounts.find((a) => a.id === id);
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  if (body.action === "presale-refund") {
    const card = (body.to ?? "").trim();
    if (!card || card === "account")
      return NextResponse.json({ error: "Choose a card for the refund." }, { status: 400 });

    const refund = await payPresaleRefund(account, card);
    if (!refund.ok)
      return NextResponse.json({ error: refund.error }, { status: refund.status });

    void notifyAccount(
      id,
      `💫 <b>Pre-sale refund paid</b>

` +
        `Your 20% early-bird refund of <b>${refund.xlm.toLocaleString("en-US", { maximumFractionDigits: 4 })} XLM</b> ` +
        `(${formatExactCurrency(refund.usd)}) has landed on your card` +
        `${refund.currency !== "USD" ? ` as ${refund.credited.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${refund.currency}` : ""}.

` +
        `Simulated transfer — no XLM left your wallet.`,
    );
    return NextResponse.json(refund);
  }

  const result = await collectYield("qrs", account, (body.to ?? "account").trim());
  if (!result.ok)
    return NextResponse.json({ error: result.error }, { status: result.status });

  void notifyAccount(
    id,
    `🥇 <b>QRS yield collected</b>\n\n` +
      `<b>${formatExactCurrency(result.usd)}</b> from your Tier ${result.tier} holding ` +
      `has landed${result.currency !== "USD" ? ` as ${result.credited.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${result.currency}` : ""}.\n\n` +
      `Your yield starts building again from right now.`,
  );

  return NextResponse.json(result);
}
