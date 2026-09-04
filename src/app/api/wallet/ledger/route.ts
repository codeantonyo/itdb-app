import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getDb, mutateDb, type AccountLedger } from "@/lib/server/db";
import { getFx } from "@/lib/server/fx";
import { fromAccountXlm } from "@/lib/server/ledger";
import { sessionAccountId } from "@/lib/server/session";
import { CURRENCIES, DEFAULT_CURRENCY, isCurrency } from "@/lib/wallet/currencies";

const EMPTY: AccountLedger = { cards: {}, txns: [] };

/**
 * GET /api/wallet/ledger — this account's card balance, recent
 * transfers, and the current USD value of each supported currency (so
 * the client can price the main balance and conversions consistently).
 */
export async function GET(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const db = await getDb();
  const ledger = db.ledgers[id] ?? EMPTY;
  const fx = await getFx();

  const usdRates: Record<string, number> = {};
  for (const c of CURRENCIES) usdRates[c.code] = fx.usdOf(c.code);

  return NextResponse.json({
    cards: ledger.cards,
    txns: ledger.txns.slice(-40).reverse(),
    usdRates,
    xlmUsd: fx.xlmUsd,
    fromAccountXlm: fromAccountXlm(ledger.txns),
  });
}

interface PutBody {
  cardId?: string;
  currency?: string;
}

/**
 * PUT — register the card's currency (on open) or change it later (the
 * balance is converted). ITDB issues ONE card per account: a second
 * card id is refused while another is registered.
 */
export async function PUT(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const cardId = body.cardId?.trim() ?? "";
  const currency = body.currency ?? DEFAULT_CURRENCY;
  if (!cardId || !isCurrency(currency)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const fx = await getFx();
  const result = await mutateDb((db) => {
    const ledger = (db.ledgers[id] ??= { cards: {}, txns: [] });
    const existing = ledger.cards[cardId];
    if (existing) {
      existing.balance = fx.convert(existing.balance, existing.currency, currency);
      existing.currency = currency;
      return { card: existing };
    }
    const others = Object.keys(ledger.cards);
    if (others.length > 0) {
      return { error: "ITDB issues one card per account. Close your current card first." };
    }
    ledger.cards[cardId] = { currency, balance: 0 };
    return { card: ledger.cards[cardId] };
  });
  if ("error" in result)
    return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true, card: result.card });
}

interface DeleteBody {
  cardId?: string;
}

/**
 * DELETE — close the card. Any balance it still holds is returned to the
 * main account first, so closing a card can never lose money.
 */
export async function DELETE(req: Request) {
  const id = await sessionAccountId(req);
  if (!id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  let body: DeleteBody;
  try {
    body = (await req.json()) as DeleteBody;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const cardId = body.cardId?.trim() ?? "";
  if (!cardId) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const fx = await getFx();
  const returned = await mutateDb((db) => {
    const ledger = db.ledgers[id];
    const card = ledger?.cards[cardId];
    if (!ledger || !card) return null;
    let moved: { amount: number; currency: string } | null = null;
    if (card.balance > 0) {
      const xlmValue = fx.convert(card.balance, card.currency, "XLM");
      if (xlmValue > 0) {
        ledger.txns.push({
          id: randomUUID(),
          at: Date.now(),
          from: cardId,
          to: "account",
          amount: card.balance,
          currency: card.currency,
          xlmValue,
        });
        moved = { amount: card.balance, currency: card.currency };
      }
    }
    delete ledger.cards[cardId];
    return moved;
  });
  return NextResponse.json({ ok: true, returned });
}
