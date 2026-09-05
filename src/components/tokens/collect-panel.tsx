"use client";

import { useMemo, useState } from "react";
import { LedgerLine } from "@/components/shared/ledger-line";
import { Button } from "@/components/ui/button";
import { ChoiceRow } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { cardLabel, type StoredCard } from "@/lib/client/cards";
import type { LedgerCard } from "@/lib/client/wallet-ledger";
import { formatCurrency, formatExactCurrency } from "@/lib/format";
import { formatMoney } from "@/lib/wallet/currencies";

export interface CollectOutcome {
  ok: boolean;
  error?: string;
  usd?: number;
  credited?: number;
  currency?: string;
}

interface CollectPanelProps {
  open: boolean;
  onClose: () => void;
  program: "itdbone" | "qrs";
  pendingUsd: number;
  /** Every card on the account; frozen and unregistered ones are disabled. */
  cards: StoredCard[];
  ledgerCards: Record<string, LedgerCard>;
  onConfirm: (destination: string) => Promise<CollectOutcome>;
}

/**
 * The collection slip: choose where the yield lands — the ITDB account
 * or any of the member's cards — confirm, and read the receipt, which
 * states the EXACT amount credited.
 */
export function CollectPanel({
  open,
  onClose,
  program,
  pendingUsd,
  cards,
  ledgerCards,
  onConfirm,
}: CollectPanelProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<CollectOutcome | null>(null);

  const usable = useMemo(
    () => cards.filter((c) => !c.frozen && ledgerCards[c.id]),
    [cards, ledgerCards],
  );
  // Derived, so it stays valid if a card is frozen or closed underneath.
  const destination = picked === "account" || usable.some((c) => c.id === picked) ? picked! : "account";
  const label = program === "itdbone" ? "ITDBONE" : "QRS";
  const destName =
    destination === "account"
      ? "your ITDB account"
      : (cards.find((c) => c.id === destination) ? cardLabel(cards.find((c) => c.id === destination)!) : "your card");

  const close = () => {
    onClose();
    setTimeout(() => {
      setBusy(false);
      setError(null);
      setReceipt(null);
      setPicked(null);
    }, 300);
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const result = await onConfirm(destination);
    setBusy(false);
    if (result.ok) setReceipt(result);
    else setError(result.error ?? "Collection failed.");
  };

  return (
    <Panel open={open} title={receipt ? "Receipt" : `Collect ${label} yield`} onClose={busy ? undefined : close}>
      {receipt ? (
        <div>
          <p className="font-display text-[20px] font-semibold text-primary">{label} yield collected</p>
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
            <LedgerLine label="To" value={destName} valueClassName="font-medium" />
            <LedgerLine label="Yield resumes" value="Now" valueClassName="font-medium" />
          </div>
          <Button size="lg" className="mt-4" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <div>
          <p className="text-[15px] leading-relaxed text-muted">
            {formatCurrency(pendingUsd)} is ready. Choose where it lands; the receipt confirms the exact figure.
          </p>
          <div className="mt-3 flex flex-col gap-2" role="radiogroup">
            <ChoiceRow
              selected={destination === "account"}
              onSelect={() => setPicked("account")}
              label="ITDB account"
              note="Raises your available balance"
            />
            {cards.length === 0 ? (
              <ChoiceRow selected={false} onSelect={() => {}} disabled label="Your card" note="Open a card first" />
            ) : (
              cards.map((c) => {
                const ledgerCard = ledgerCards[c.id];
                const disabled = c.frozen || !ledgerCard;
                return (
                  <ChoiceRow
                    key={c.id}
                    selected={destination === c.id}
                    onSelect={() => !disabled && setPicked(c.id)}
                    disabled={disabled}
                    label={cardLabel(c)}
                    note={
                      c.frozen
                        ? "Card is frozen"
                        : ledgerCard
                          ? `Converted to ${ledgerCard.currency} at live FX`
                          : "Card still registering"
                    }
                  />
                );
              })
            )}
          </div>
          {error && <p className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[14px] text-danger">{error}</p>}
          <Button size="lg" className="mt-4" disabled={busy} onClick={confirm}>
            {busy ? "Posting…" : "Confirm collection"}
          </Button>
        </div>
      )}
    </Panel>
  );
}
