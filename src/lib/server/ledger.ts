import { randomUUID } from "crypto";
import type { DbShape, LedgerTxn } from "./db";
import type { FxRates } from "./fx";

/**
 * Shared crediting for yield collections (ITDBONE, QRS). Converts the
 * USD value into the destination's own currency and records a ledger
 * transaction whose `from` names the source, so history reads
 * "ITDBONE yield → card ·· 6054".
 *
 * ENGINEERING WARNING (§6.1): every credit MUST carry a real, positive
 * `xlmValue`. The account balance is derived as
 * `portfolio.totalUsd − ledger.fromAccountUsd`, so a credit written
 * with xlmValue 0 posts a transaction the member can see but NO
 * spendable money. `requireXlmValue` makes that impossible to do
 * quietly — it throws instead of posting.
 */

export type CreditSource = "itdbone" | "qrs";

export const CREDIT_SOURCES: CreditSource[] = ["itdbone", "qrs"];

export const CREDIT_SOURCE_LABELS: Record<CreditSource, string> = {
  itdbone: "ITDBONE yield",
  qrs: "QRS yield",
};

function requireXlmValue(xlmValue: number, context: string): number {
  if (!Number.isFinite(xlmValue) || xlmValue <= 0) {
    throw new Error(
      `Refusing to post a ledger credit with xlmValue=${xlmValue} (${context}). ` +
        "A zero-value credit shows a transaction but no spendable money.",
    );
  }
  return xlmValue;
}

export function creditCard(
  db: DbShape,
  accountId: string,
  cardId: string,
  amount: number,
  currency: string,
  source: CreditSource,
  fx: FxRates,
): { credited: number; currency: string; txn: LedgerTxn } | { error: string } {
  const ledger = (db.ledgers[accountId] ??= { cards: {}, txns: [] });
  const card = ledger.cards[cardId];
  if (!card) return { error: "Card not found" };

  const credited = fx.convert(amount, currency, card.currency);
  const xlmValue = requireXlmValue(
    fx.convert(amount, currency, "XLM"),
    `${source} → card ${cardId}`,
  );
  card.balance += credited;
  const txn: LedgerTxn = {
    id: randomUUID(),
    at: Date.now(),
    from: source,
    to: cardId,
    amount: credited,
    currency: card.currency,
    xlmValue,
  };
  ledger.txns.push(txn);
  return { credited, currency: card.currency, txn };
}

/**
 * Credit the main account. Deposits INTO the account raise the derived
 * balance (portfolio − net moved out), like cash paid into a bank.
 */
export function creditAccount(
  db: DbShape,
  accountId: string,
  amount: number,
  currency: string,
  source: CreditSource,
  fx: FxRates,
): { credited: number; currency: string; txn: LedgerTxn } {
  const ledger = (db.ledgers[accountId] ??= { cards: {}, txns: [] });
  const xlmValue = requireXlmValue(
    fx.convert(amount, currency, "XLM"),
    `${source} → account`,
  );
  const txn: LedgerTxn = {
    id: randomUUID(),
    at: Date.now(),
    from: source,
    to: "account",
    amount,
    currency,
    xlmValue,
  };
  ledger.txns.push(txn);
  return { credited: amount, currency, txn };
}

/**
 * Net XLM moved OUT of the main account into cards (transfers out minus
 * transfers back). Yield credits are NEW money and deliberately don't
 * touch this — only genuine account→card movements reduce the
 * spendable account balance, and account deposits raise it.
 */
export function fromAccountXlm(txns: LedgerTxn[]): number {
  return txns.reduce(
    (sum, t) =>
      sum + (t.from === "account" ? t.xlmValue : 0) - (t.to === "account" ? t.xlmValue : 0),
    0,
  );
}
