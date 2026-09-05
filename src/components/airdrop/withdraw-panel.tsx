"use client";

import { useMemo, useState } from "react";
import { LedgerLine } from "@/components/shared/ledger-line";
import { Button } from "@/components/ui/button";
import { ChoiceRow } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import type { AirdropLineView } from "@/lib/server/airdrop";
import { cardLabel, type StoredCard } from "@/lib/client/cards";
import type { LedgerCard } from "@/lib/client/wallet-ledger";
import { formatAmount, formatCurrency, formatExactCurrency } from "@/lib/format";
import { formatMoney } from "@/lib/wallet/currencies";

export interface WithdrawOutcome {
  ok: boolean;
  error?: string;
  code?: string;
  units?: number;
  usd?: number;
  credited?: number;
  currency?: string;
}

interface WithdrawPanelProps {
  open: boolean;
  onClose: () => void;
  lines: AirdropLineView[];
  cards: StoredCard[];
  ledgerCards: Record<string, LedgerCard>;
  /** Pre-select this asset when opening */
  initialCode?: string | null;
  onConfirm: (code: string, units: number, cardId: string) => Promise<WithdrawOutcome>;
}

/**
 * Withdraw airdropped value onto a card. Assets with no public market
 * are excluded, since there is no value to move. The card chooser only
 * appears when the account actually has more than one card.
 */
export function WithdrawPanel({
  open,
  onClose,
  lines,
  cards,
  ledgerCards,
  initialCode,
  onConfirm,
}: WithdrawPanelProps) {
  const available = useMemo(
    () => lines.filter((l) => l.usdPerUnit !== null && l.remaining > 0),
    [lines],
  );
  const usableCards = useMemo(() => cards.filter((c) => !c.frozen && ledgerCards[c.id]), [cards, ledgerCards]);

  // Both selections are DERIVED, not synced in an effect: an explicit
  // pick wins, otherwise fall back to the caller's asset and the first
  // usable card. That keeps them valid when the lists change underneath.
  const [pickedCode, setPickedCode] = useState<string | null>(null);
  const [pickedCard, setPickedCard] = useState<string | null>(null);
  const [amountStr, setAmountStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<WithdrawOutcome | null>(null);

  const line =
    available.find((l) => l.code === (pickedCode ?? initialCode)) ?? available[0] ?? null;
  const cardId = usableCards.some((c) => c.id === pickedCard)
    ? (pickedCard as string)
    : (usableCards[0]?.id ?? "");
  const units = parseFloat(amountStr) || 0;
  const usd = line?.usdPerUnit != null ? units * line.usdPerUnit : 0;
  const over = !!line && units > line.remaining + 1e-9;
  const canSubmit = !!line && !!cardId && units > 0 && !over && !busy;

  const close = () => {
    onClose();
    setTimeout(() => {
      setAmountStr("");
      setError(null);
      setReceipt(null);
      setBusy(false);
      setPickedCode(null);
      setPickedCard(null);
    }, 300);
  };

  const submit = async () => {
    if (!canSubmit || !line) return;
    setBusy(true);
    setError(null);
    const result = await onConfirm(line.code, units, cardId);
    setBusy(false);
    if (result.ok) setReceipt(result);
    else setError(result.error ?? "Withdrawal failed.");
  };


  return (
    <Panel open={open} title={receipt ? "Receipt" : "Withdraw to card"} onClose={busy ? undefined : close}>
      {receipt ? (
        <div>
          <p className="font-display text-[20px] font-semibold text-primary">Withdrawal complete</p>
          <div className="mt-3 rounded-xl bg-elevated px-3.5">
            <LedgerLine
              label="Credited"
              value={
                receipt.currency && receipt.currency !== "USD"
                  ? formatMoney(receipt.credited ?? 0, receipt.currency, { exact: true })
                  : formatExactCurrency(receipt.usd ?? 0)
              }
            />
            {receipt.currency && receipt.currency !== "USD" && (
              <LedgerLine label="At today's rate" value={formatExactCurrency(receipt.usd ?? 0)} />
            )}
            <LedgerLine
              label="Taken from"
              value={`${formatAmount(receipt.units ?? 0, 2)} ${receipt.code}`}
              valueClassName="font-medium"
            />
            <LedgerLine
              label="To card"
              value={cards.find((c) => c.id === cardId) ? cardLabel(cards.find((c) => c.id === cardId)!) : "Your card"}
              valueClassName="font-medium"
            />
          </div>
          <Button size="lg" className="mt-4" onClick={close}>
            Done
          </Button>
        </div>
      ) : usableCards.length === 0 ? (
        <div>
          <p className="text-[15px] leading-relaxed text-muted">
            {cards.length === 0
              ? "You need a card before you can withdraw. Open one from the Card tab, then come back."
              : "Your card is frozen or still registering. Unfreeze it from the Card tab, then come back."}
          </p>
          <Button size="lg" className="mt-4" onClick={close}>
            Close
          </Button>
        </div>
      ) : available.length === 0 ? (
        <div>
          <p className="text-[15px] leading-relaxed text-muted">
            You have withdrawn everything with a market value. The reserve assets have no public price, so they stay in
            your holdings.
          </p>
          <Button size="lg" className="mt-4" onClick={close}>
            Close
          </Button>
        </div>
      ) : (
        <div>
          <label className="block">
            <span className="mb-1.5 block text-[13.5px] font-medium text-muted">Asset</span>
            <div className="rounded-xl border border-hairline bg-elevated px-4 focus-within:border-gold">
              <select
                value={line?.code ?? ""}
                onChange={(e) => {
                  setPickedCode(e.target.value);
                  setAmountStr("");
                  setError(null);
                }}
                className="h-[54px] w-full bg-transparent text-[16px] text-primary outline-none"
              >
                {available.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name} — {formatAmount(l.remaining, 2)} {l.unit} left
                  </option>
                ))}
              </select>
            </div>
          </label>

          {line && (
            <label className="mt-4 block">
              <span className="mb-1.5 block text-[13.5px] font-medium text-muted">
                Amount in {line.unit}
              </span>
              <div className="flex items-center gap-2 rounded-xl border border-hairline bg-elevated px-4 focus-within:border-gold">
                <input
                  inputMode="decimal"
                  value={amountStr}
                  onChange={(e) => {
                    setAmountStr(e.target.value.replace(/[^0-9.]/g, ""));
                    setError(null);
                  }}
                  placeholder="0"
                  className="tnum h-14 min-w-0 flex-1 bg-transparent text-[22px] font-semibold text-primary outline-none placeholder:text-muted-2"
                />
                <button
                  onClick={() => setAmountStr(String(line.remaining))}
                  className="tap shrink-0 px-2 text-[13px] font-semibold text-gold"
                >
                  Max
                </button>
              </div>
            </label>
          )}

          {units > 0 && line && (
            <div className="mt-2 rounded-xl bg-elevated px-3.5">
              <LedgerLine label="Value at today's rate" value={formatCurrency(usd)} />
            </div>
          )}

          {usableCards.length > 1 && (
            <>
              <p className="mb-2 mt-4 text-[13.5px] font-medium text-muted">Send to which card</p>
              <div role="radiogroup" className="flex flex-col gap-2">
                {usableCards.map((c) => (
                  <ChoiceRow
                    key={c.id}
                    selected={cardId === c.id}
                    onSelect={() => setPickedCard(c.id)}
                    label={cardLabel(c)}
                    note={`Held in ${ledgerCards[c.id]?.currency ?? "USD"}`}
                  />
                ))}
              </div>
            </>
          )}
          {usableCards.length === 1 && (
            <p className="mt-3 text-[13.5px] text-muted">
              Landing on {cardLabel(usableCards[0])}, converted to {ledgerCards[usableCards[0].id]?.currency ?? "USD"} at
              live rates.
            </p>
          )}

          {(error || over) && (
            <p className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[14px] text-danger">
              {error ?? `That's more than the ${formatAmount(line?.remaining ?? 0, 2)} ${line?.unit} you hold.`}
            </p>
          )}

          <Button size="lg" className="mt-4" disabled={!canSubmit} onClick={submit}>
            {busy ? "Posting…" : units > 0 ? `Withdraw ${formatCurrency(usd)}` : "Withdraw"}
          </Button>
        </div>
      )}
    </Panel>
  );
}
