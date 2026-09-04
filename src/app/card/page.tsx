"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Check, Copy, CreditCard, Plus, Snowflake, Trash2, type LucideIcon } from "lucide-react";
import { OpenCardPanel } from "@/components/card/open-card-panel";
import { TransferPanel } from "@/components/card/transfer-panel";
import { VirtualCardVisual } from "@/components/card/virtual-card";
import { PageHeader } from "@/components/layout/page-header";
import { ExactFigure } from "@/components/shared/exact-figure";
import { LedgerLine } from "@/components/shared/ledger-line";
import { SectionHeader } from "@/components/shared/section-header";
import { PaymentRow } from "@/components/shared/statement-row";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/client/auth";
import { canUnfreeze, formatPan, formatRemaining, isActivating, useCards } from "@/lib/client/cards";
import { usePortfolio } from "@/lib/client/portfolio";
import { useWalletLedger } from "@/lib/client/wallet-ledger";
import { formatCurrency, formatExactCurrency } from "@/lib/format";
import { formatMoney } from "@/lib/wallet/currencies";
import { cn } from "@/lib/utils";

type Action = "none" | "move" | "freeze" | "close" | "open";

function ActionTile({ icon: Icon, label, note, onClick, disabled, danger, active }: { icon: LucideIcon; label: string; note: string; onClick: () => void; disabled?: boolean; danger?: boolean; active?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={cn("card tap flex flex-col items-start gap-2.5 p-4 text-left transition-opacity", disabled && "opacity-45", active && "border-gold")}>
      <span className={cn("flex size-10 items-center justify-center rounded-full", danger ? "bg-danger-soft text-danger" : active ? "bg-gold text-gold-ink" : "bg-gold-soft text-gold")}>
        <Icon className="size-[19px]" strokeWidth={2} />
      </span>
      <span>
        <span className={cn("block text-[15px] font-semibold", danger ? "text-danger" : "text-primary")}>{label}</span>
        <span className="block text-[12.5px] text-muted">{note}</span>
      </span>
    </button>
  );
}

export default function CardPage() {
  const { session } = useAuth();
  const portfolio = usePortfolio();
  const { card, ready, openCard, freezeCard, unfreezeCard, removeCard } = useCards(session?.address ?? null);
  const ledger = useWalletLedger(!!session);

  const [action, setAction] = useState<Action>("none");
  const [copied, setCopied] = useState(false);
  const [closedNotice, setClosedNotice] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  const holder = session?.name ?? "Card holder";
  const accountAvailableUsd = Math.max(portfolio.totalUsd - ledger.fromAccountUsd, 0);
  const portfolioXlm = portfolio.xlmUsd > 0 ? portfolio.totalUsd / portfolio.xlmUsd : 0;
  const cardBalance = card ? ledger.cards[card.id] : undefined;

  const registeredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (ledger.loading || !card) return;
    if (!ledger.cards[card.id] && !registeredRef.current.has(card.id)) {
      registeredRef.current.add(card.id);
      ledger.registerCard(card.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, ledger.cards, ledger.loading]);

  useEffect(() => {
    const update = () => setNow(Date.now());
    queueMicrotask(update);
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const copyNumber = async () => {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(formatPan(card.number));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const closeCard = async () => {
    if (!card) return;
    const returned = await ledger.removeCard(card.id);
    removeCard(card.id);
    setAction("none");
    setClosedNotice(returned ? `Card closed. Exactly ${formatMoney(returned.amount, returned.currency, { exact: true })} was returned to your ITDB account.` : "Card closed.");
  };

  const activating = card ? isActivating(card, now) : false;
  const freezeLocked = card?.frozen && !canUnfreeze(card, now) && card.frozenUntil ? card.frozenUntil - now : 0;
  const status = !card ? "" : activating ? "Activating" : card.frozen ? (freezeLocked > 0 ? `Frozen · unlocks in ${formatRemaining(freezeLocked)}` : "Frozen") : "Active";
  const cardActivity = portfolio.payments.filter((p) => p.kind.startsWith("ledger_")).slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="One per account" title="Your card" subtitle={card ? `${card.name} · funded by your ITDB account` : "Visa or Mastercard, funded by your ITDB account."} />

      {!ready ? (
        <Skeleton className="h-[230px] rounded-[20px]" />
      ) : !card ? (
        <section className="hero guilloche flex flex-col items-center px-6 py-10 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-elevated">
            <CreditCard className="size-7 text-gold-light" strokeWidth={1.6} />
          </span>
          <h2 className="font-display mt-5 text-[24px] font-semibold text-primary">Open your ITDB card</h2>
          <p className="mt-2 max-w-[300px] text-[15px] leading-relaxed text-muted">One card per account, Visa or Mastercard. Move money onto it from your balance and back at live rates.</p>
          {closedNotice && <p className="mt-4 text-[13.5px] text-gold-light">{closedNotice}</p>}
          <div className="mt-6 w-full max-w-[280px]">
            <Button size="lg" onClick={() => setAction("open")}>
              <Plus className="size-4" />
              Open my card
            </Button>
          </div>
        </section>
      ) : (
        <>
          <VirtualCardVisual card={card} holder={holder} activating={activating} />

          <section className="card px-5 py-2">
            <LedgerLine
              label="Card balance"
              value={cardBalance ? <ExactFigure compact={formatMoney(cardBalance.balance, cardBalance.currency)} exact={formatMoney(cardBalance.balance, cardBalance.currency, { exact: true })} className="font-display text-[24px]" /> : "…"}
              sub={cardBalance ? `Held in ${cardBalance.currency}` : "Registering"}
            />
            <LedgerLine label="Status" value={status} valueClassName={cn("font-medium", activating ? "text-gold" : card.frozen ? "text-data" : "text-success")} />
            <LedgerLine label="Account available" value={<ExactFigure compact={formatCurrency(accountAvailableUsd)} exact={formatExactCurrency(accountAvailableUsd)} />} />
          </section>

          <div className="grid grid-cols-2 gap-3">
            <ActionTile icon={ArrowLeftRight} label="Move money" note="Account ↔ card" onClick={() => setAction("move")} disabled={activating || card.frozen} />
            <ActionTile
              icon={Snowflake}
              label={!card.frozen ? "Freeze" : freezeLocked > 0 ? "Frozen" : "Unfreeze"}
              note={!card.frozen ? "Locks for 3 days" : freezeLocked > 0 ? `Unlocks in ${formatRemaining(freezeLocked)}` : "Ready to unfreeze"}
              active={card.frozen}
              disabled={activating || freezeLocked > 0}
              onClick={() => (card.frozen ? unfreezeCard(card.id) : setAction("freeze"))}
            />
            <ActionTile icon={copied ? Check : Copy} label={copied ? "Copied" : "Copy number"} note={`•••• ${card.number.slice(-4)}`} onClick={copyNumber} />
            <ActionTile icon={Trash2} label="Close card" note="Balance returns" onClick={() => setAction("close")} danger />
          </div>

          <section className="flex flex-col gap-3">
            <SectionHeader title="Card activity" />
            {cardActivity.length === 0 ? (
              <div className="card p-5 text-center text-[14.5px] text-muted">Money moved to and from this card will appear here.</div>
            ) : (
              <div className="card divide-y divide-hairline px-4">
                {cardActivity.map((p) => (
                  <PaymentRow key={p.id} payment={p} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <OpenCardPanel
        open={action === "open"}
        holder={holder}
        onClose={() => setAction("none")}
        onIssue={async (style, name, network, currency) => {
          const minted = openCard(style, name, network);
          if (!minted) return { card: null, error: "You already have a card on this account." };
          registeredRef.current.add(minted.id);
          const reg = await ledger.registerCard(minted.id, currency);
          if (!reg.ok) {
            removeCard(minted.id);
            registeredRef.current.delete(minted.id);
            return { card: null, error: reg.error };
          }
          setClosedNotice(null);
          return { card: minted };
        }}
      />

      {card && (
        <>
          <TransferPanel open={action === "move"} onClose={() => setAction("none")} ledger={ledger} card={card} accountAvailableUsd={accountAvailableUsd} portfolioXlm={portfolioXlm} />
          <Panel open={action === "freeze"} title="Freeze this card?" onClose={() => setAction("none")}>
            <p className="text-[15px] leading-relaxed text-muted">
              Freezing locks •••• {card.number.slice(-4)} for a <span className="font-semibold text-primary">minimum of 3 days</span>. During that time it can&apos;t be used and can&apos;t be unfrozen.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <Button variant="secondary" onClick={() => setAction("none")}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  freezeCard(card.id);
                  setAction("none");
                }}
              >
                Freeze card
              </Button>
            </div>
          </Panel>
          <Panel open={action === "close"} title="Close this card?" onClose={() => setAction("none")}>
            <p className="text-[15px] leading-relaxed text-muted">
              {cardBalance && cardBalance.balance > 0 ? `Its balance of ${formatMoney(cardBalance.balance, cardBalance.currency, { exact: true })} returns to your ITDB account first. ` : ""}
              You can open a new card afterwards.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <Button variant="secondary" onClick={() => setAction("none")}>
                Keep card
              </Button>
              <Button variant="danger" onClick={closeCard}>
                Close card
              </Button>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
