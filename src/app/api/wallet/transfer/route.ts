import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getFx } from "@/lib/server/fx";
import { mutateDb, type LedgerTxn } from "@/lib/server/db";
import { fromAccountXlm } from "@/lib/server/ledger";
import { sessionAccountId } from "@/lib/server/session";
import { isCurrency } from "@/lib/wallet/currencies";

const ACCOUNT = "account";
/** Floating-point slack so "send my whole balance" isn't blocked by dust. */
const EPSILON = 1e-6;

interface Body {
  from?: string; // "account" | cardId
  to?: string; // "account" | cardId
  amount?: number;
  currency?: string; // currency the amount is expressed in
  /** Client's live portfolio value in XLM — bounds account→card only. */
  portfolioXlm?: number;
}

/**
 * POST /api/wallet/transfer — move in-app funds between the main account
 * (the live "Available balance") and the card, converting across
 * currencies at live FX. Every confirmation carries the exact amount
 * credited so the member can check it landed.
 *
 * Card balances and card→account conservation are fully server-
 * authoritative. The account→card ceiling uses the client's live
 * portfolio value, as in NEWBANK — an accepted simplification for
 * simulated in-app funds.
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

  const from = body.from ?? "";
  const to = body.to ?? "";
  const amount = Number(body.amount);
  const currency = body.currency ?? "";
  const portfolioXlm = Math.max(0, Number(body.portfolioXlm) || 0);

  if (
    !from ||
    !to ||
    from === to ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !isCurrency(currency)
  ) {
    return NextResponse.json({ error: "Invalid transfer" }, { status: 400 });
  }

  const fx = await getFx();
  const amountXlm = fx.convert(amount, currency, "XLM");
  if (!(amountXlm > 0)) {
    return NextResponse.json({ error: "Rates unavailable — try again." }, { status: 503 });
  }

  type Result =
    | { error: string; status: number }
    | { cards: Record<string, { currency: string; balance: number }>; credited: number; currency: string };

  const result = await mutateDb<Result>((db) => {
    const ledger = (db.ledgers[id] ??= { cards: {}, txns: [] });

    const src = from === ACCOUNT ? null : ledger.cards[from];
    const dst = to === ACCOUNT ? null : ledger.cards[to];
    if ((from !== ACCOUNT && !src) || (to !== ACCOUNT && !dst)) {
      return { error: "Card not found", status: 404 };
    }

    // --- overdraft checks ---
    if (from === ACCOUNT) {
      const availableXlm = portfolioXlm - fromAccountXlm(ledger.txns);
      if (amountXlm > availableXlm + EPSILON) {
        return { error: "That's more than your account balance.", status: 409 };
      }
    } else if (src) {
      const debit = fx.convert(amount, currency, src.currency);
      if (debit > src.balance + EPSILON) {
        return { error: "That's more than the card holds.", status: 409 };
      }
    }

    // --- apply ---
    if (src) {
      const debit = fx.convert(amount, currency, src.currency);
      src.balance = Math.max(0, src.balance - debit);
    }
    let creditAmount = amount;
    let creditCurrency = currency;
    if (dst) {
      creditAmount = fx.convert(amount, currency, dst.currency);
      creditCurrency = dst.currency;
      dst.balance += creditAmount;
    }

    const txn: LedgerTxn = {
      id: randomUUID(),
      at: Date.now(),
      from,
      to,
      amount: creditAmount,
      currency: creditCurrency,
      xlmValue: amountXlm,
    };
    ledger.txns.push(txn);

    return { cards: ledger.cards, credited: creditAmount, currency: creditCurrency };
  });

  if ("error" in result)
    return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, ...result });
}
