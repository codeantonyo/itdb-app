"use client";

import { useMemo, useState } from "react";
import { LedgerLine } from "@/components/shared/ledger-line";
import { Button } from "@/components/ui/button";
import { ChoiceRow } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import type { StoredCard } from "@/lib/client/cards";
import type { useWalletLedger } from "@/lib/client/wallet-ledger";
import { currency as currencyDef, formatMoney } from "@/lib/wallet/currencies";

type Ledger = ReturnType<typeof useWalletLedger>;

interface TransferPanelProps {
  open: boolean;
  onClose: () => void;
  ledger: Ledger;
  card: StoredCard;
  /** Live spendable account balance (portfolio − card allocations), in USD */
  accountAvailableUsd: number;
  /** Full live portfolio value in XLM (the server's account→card ceiling) */
  portfolioXlm: number;
}

const ACCOUNT = "account";

/** The transfer slip: direction, amount, the figures, and a receipt with the exact credit. */
export function TransferPanel({ open, onClose, ledger, card, accountAvailableUsd, portfolioXlm }: TransferPanelProps) {
  const [direction, setDirection] = useState<"toCard" | "toAccount">("toCard");
  const [amountStr, setAmountStr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ credited: number; currency: string } | null>(null);

  const cardLedger = ledger.cards[card.id];
  const cardCurrency = cardLedger?.currency ?? "USD";
  const from = direction === "toCard" ? ACCOUNT : card.id;
  const to = direction === "toCard" ? card.id : ACCOUNT;
  const amountCurrency = direction === "toCard" ? "USD" : cardCurrency;
  const destCurrency = direction === "toCard" ? cardCurrency : "USD";
  const cardLabel = `${card.name} ·· ${card.number.slice(-4)}`;

  const amount = parseFloat(amountStr) || 0;
  const sourceAvailable = useMemo(
    () =>
      direction === "toCard"
        ? { balance: accountAvailableUsd, currency: "USD" }
        : { balance: cardLedger?.balance ?? 0, currency: cardCurrency },
    [direction, accountAvailableUsd, cardLedger, cardCurrency],
  );
  const destGets = ledger.convert(amount, amountCurrency, destCurrency);
  const overBalance = amount > sourceAvailable.balance + 1e-6;
  const canSubmit = amount > 0 && !overBalance && !submitting;

  const close = () => {
    onClose();
    setTimeout(() => {
      setAmountStr("");
      setError(null);
      setDone(null);
    }, 300);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const result = await ledger.transfer({ from, to, amount, currency: amountCurrency, portfolioXlm });
    setSubmitting(false);
    if (result.ok) setDone({ credited: result.credited ?? destGets, currency: result.currency ?? destCurrency });
    else setError(result.error ?? "Transfer failed.");
  };

  return (
    <Panel open={open} title={done ? "Receipt" : "Move money"} onClose={submitting ? undefined : close}>
      {done ? (
        <div>
          <p className="font-display text-[20px] font-semibold text-primary">Transfer posted</p>
          <div className="mt-3 rounded-xl bg-elevated px-3.5">
            <LedgerLine label="Credited" value={formatMoney(done.credited, done.currency, { exact: true })} />
            <LedgerLine label="To" value={direction === "toCard" ? cardLabel : "ITDB account"} valueClassName="font-medium" />
            <LedgerLine label="From" value={direction === "toCard" ? "ITDB account" : cardLabel} valueClassName="font-medium" />
          </div>
          <Button size="lg" className="mt-4" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <div>
          <div role="radiogroup" className="flex flex-col gap-2">
            <ChoiceRow
              selected={direction === "toCard"}
              onSelect={() => { setDirection("toCard"); setError(null); }}
              label="Account to card"
              note={`Available ${formatMoney(accountAvailableUsd, "USD", { exact: true })}`}
            />
            <ChoiceRow
              selected={direction === "toAccount"}
              onSelect={() => { setDirection("toAccount"); setError(null); }}
              label="Card to account"
              note={`On card ${formatMoney(cardLedger?.balance ?? 0, cardCurrency, { exact: true })}`}
            />
          </div>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-[13.5px] font-medium text-muted">Amount in {amountCurrency}</span>
            <div className="flex items-center gap-2 rounded-xl border border-hairline bg-elevated px-4 focus-within:border-gold">
              <span className="text-[18px] font-semibold text-muted">{currencyDef(amountCurrency).symbol}</span>
              <input
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => {
                  setAmountStr(e.target.value.replace(/[^0-9.]/g, ""));
                  setError(null);
                }}
                placeholder="0.00"
                className="tnum h-14 min-w-0 flex-1 bg-transparent text-[24px] font-semibold text-primary outline-none placeholder:text-muted-2"
              />
            </div>
          </label>

          {amount > 0 && (
            <div className="mt-2">
              <LedgerLine
                label={direction === "toCard" ? `${cardLabel} receives` : "Account receives"}
                value={formatMoney(destGets, destCurrency, { exact: true })}
              />
            </div>
          )}

          {(error || overBalance) && (
            <p className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[14px] text-danger">
              {error ?? "That's more than the balance available."}
            </p>
          )}

          <Button size="lg" className="mt-4" disabled={!canSubmit} onClick={submit}>
            {submitting ? "Posting…" : `Move ${amount > 0 ? formatMoney(amount, amountCurrency) : "money"}`}
          </Button>
        </div>
      )}
    </Panel>
  );
}
