"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { canUnfreeze, formatPan, formatRemaining, isActivating, MAX_CARDS, useCards } from "@/lib/client/cards";
import { usePortfolio } from "@/lib/client/portfolio";
import { useWalletLedger } from "@/lib/client/wallet-ledger";
import { formatCurrency, formatExactCurrency } from "@/lib/format";
import { formatMoney } from "@/lib/wallet/currencies";
import { cn } from "@/lib/utils";

type Action = "none" | "move" | "freeze" | "close" | "open";

function ActionTile({
  icon: Icon,
  label,
  note,
  onClick,
  disabled,
  danger,
  active,
}: {
  icon: LucideIcon;
  label: string;
  note: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "card tap flex flex-col items-start gap-2.5 p-4 text-left transition-opacity",
        disabled && "opacity-45",
        active && "border-gold",
      )}
    >
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-full",
          danger ? "bg-danger-soft text-danger" : active ? "bg-gold text-gold-ink" : "bg-gold-soft text-gold",
        )}
      >
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
  const { cards, ready, canOpenMore, openCard, freezeCard, unfreezeCard, removeCard } = useCards(
    session?.address ?? null,
  );
  const ledger = useWalletLedger(!!session);

  const [action, setAction] = useState<Action>("none");
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const holder = session?.name ?? "Card holder";
  const accountAvailableUsd = Math.max(portfolio.totalUsd - ledger.fromAccountUsd, 0);
  const portfolioXlm = portfolio.xlmUsd > 0 ? portfolio.totalUsd / portfolio.xlmUsd : 0;

  // Clamped so closing the last card can never leave a dangling index.
  const active = cards[Math.min(index, Math.max(cards.length - 1, 0))] ?? null;
  const activeBalance = active ? ledger.cards[active.id] : undefined;

  // Register each card's currency exactly once (backfills older cards).
  const registeredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (ledger.loading) return;
    for (const c of cards) {
      if (!ledger.cards[c.id] && !registeredRef.current.has(c.id)) {
        registeredRef.current.add(c.id);
        ledger.registerCard(c.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, ledger.cards, ledger.loading]);

  useEffect(() => {
    const update = () => setNow(Date.now());
    queueMicrotask(update);
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  /* Track the visible card from native snap scrolling */
  const onScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track || track.children.length === 0) return;
    const width = (track.children[0] as HTMLElement).offsetWidth + 12;
    const next = Math.max(0, Math.min(Math.round(track.scrollLeft / width), cards.length - 1));
    setIndex((prev) => (prev === next ? prev : next));
  }, [cards.length]);

  const scrollTo = (i: number) => {
    const track = trackRef.current;
    if (!track || !track.children[i]) return;
    const width = (track.children[0] as HTMLElement).offsetWidth + 12;
    track.scrollTo({ left: i * width, behavior: "smooth" });
  };

  const copyNumber = async () => {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(formatPan(active.number));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const closeCard = async () => {
    if (!active) return;
    const returned = await ledger.removeCard(active.id);
    removeCard(active.id);
    setAction("none");
    setIndex(0);
    setNotice(
      returned
        ? `Card closed. Exactly ${formatMoney(returned.amount, returned.currency, { exact: true })} was returned to your ITDB account.`
        : "Card closed.",
    );
  };

  const activating = active ? isActivating(active, now) : false;
  const freezeLocked = active?.frozen && !canUnfreeze(active, now) && active.frozenUntil ? active.frozenUntil - now : 0;
  const status = !active
    ? ""
    : activating
      ? "Activating"
      : active.frozen
        ? freezeLocked > 0
          ? `Frozen · unlocks in ${formatRemaining(freezeLocked)}`
          : "Frozen"
        : "Active";

  const cardActivity = portfolio.payments.filter((p) => p.kind.startsWith("ledger_")).slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`Up to ${MAX_CARDS} per account`}
        title="Your cards"
        subtitle={
          cards.length > 0
            ? `${cards.length} of ${MAX_CARDS} open · funded by your ITDB account`
            : "Visa or Mastercard, funded by your ITDB account."
        }
      />

      {!ready ? (
        <Skeleton className="h-[230px] rounded-[20px]" />
      ) : cards.length === 0 ? (
        <section className="hero guilloche flex flex-col items-center px-6 py-10 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-elevated">
            <CreditCard className="size-7 text-gold-light" strokeWidth={1.6} />
          </span>
          <h2 className="font-display mt-5 text-[24px] font-semibold text-primary">Open your first card</h2>
          <p className="mt-2 max-w-[300px] text-[15px] leading-relaxed text-muted">
            Up to {MAX_CARDS} cards per account, Visa or Mastercard. Move money onto them from your balance and back at
            live rates.
          </p>
          {notice && <p className="mt-4 text-[13.5px] text-gold-light">{notice}</p>}
          <div className="mt-6 w-full max-w-[280px]">
            <Button size="lg" onClick={() => setAction("open")}>
              <Plus className="size-4" />
              Open a card
            </Button>
          </div>
        </section>
      ) : (
        <>
          {/* ---------------- Card carousel ---------------- */}
          {cards.length === 1 ? (
            <VirtualCardVisual card={cards[0]} holder={holder} activating={isActivating(cards[0], now)} />
          ) : (
            <div
              ref={trackRef}
              onScroll={onScroll}
              className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-5"
            >
              {cards.map((c, i) => (
                <div
                  key={c.id}
                  className={cn(
                    "w-[88%] shrink-0 snap-center transition-opacity duration-300",
                    i === index ? "opacity-100" : "opacity-60",
                  )}
                >
                  <VirtualCardVisual card={c} holder={holder} activating={isActivating(c, now)} />
                </div>
              ))}
            </div>
          )}

          {cards.length > 1 && (
            <div className="-mt-2 flex justify-center gap-1.5">
              {cards.map((c, i) => (
                <button
                  key={c.id}
                  aria-label={`Card ${i + 1}`}
                  onClick={() => scrollTo(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    i === index ? "w-5 bg-gold" : "w-1.5 bg-muted-2/40",
                  )}
                />
              ))}
            </div>
          )}

          {notice && <p className="text-center text-[13.5px] text-gold">{notice}</p>}

          {/* ---------------- Selected card record ---------------- */}
          {active && (
            <section className="card px-5 py-2">
              <LedgerLine
                label="Card balance"
                value={
                  activeBalance ? (
                    <ExactFigure
                      compact={formatMoney(activeBalance.balance, activeBalance.currency)}
                      exact={formatMoney(activeBalance.balance, activeBalance.currency, { exact: true })}
                      className="font-display text-[24px]"
                    />
                  ) : (
                    "…"
                  )
                }
                sub={activeBalance ? `${active.name} ·· ${active.number.slice(-4)} · held in ${activeBalance.currency}` : "Registering"}
              />
              <LedgerLine
                label="Status"
                value={status}
                valueClassName={cn("font-medium", activating ? "text-gold" : active.frozen ? "text-data" : "text-success")}
              />
              <LedgerLine
                label="Account available"
                value={<ExactFigure compact={formatCurrency(accountAvailableUsd)} exact={formatExactCurrency(accountAvailableUsd)} />}
              />
            </section>
          )}

          {/* ---------------- Actions on the selected card ---------------- */}
          {active && (
            <div className="grid grid-cols-2 gap-3">
              <ActionTile
                icon={ArrowLeftRight}
                label="Move money"
                note="Account ↔ this card"
                onClick={() => setAction("move")}
                disabled={activating || active.frozen}
              />
              <ActionTile
                icon={Snowflake}
                label={!active.frozen ? "Freeze" : freezeLocked > 0 ? "Frozen" : "Unfreeze"}
                note={
                  !active.frozen
                    ? "Locks for 3 days"
                    : freezeLocked > 0
                      ? `Unlocks in ${formatRemaining(freezeLocked)}`
                      : "Ready to unfreeze"
                }
                active={active.frozen}
                disabled={activating || freezeLocked > 0}
                onClick={() => (active.frozen ? unfreezeCard(active.id) : setAction("freeze"))}
              />
              <ActionTile
                icon={copied ? Check : Copy}
                label={copied ? "Copied" : "Copy number"}
                note={`•••• ${active.number.slice(-4)}`}
                onClick={copyNumber}
              />
              <ActionTile icon={Trash2} label="Close card" note="Balance returns" onClick={() => setAction("close")} danger />
            </div>
          )}

          {canOpenMore && (
            <Button variant="outline" size="lg" onClick={() => setAction("open")}>
              <Plus className="size-4" />
              Open another card
            </Button>
          )}

          <section className="flex flex-col gap-3">
            <SectionHeader title="Card activity" />
            {cardActivity.length === 0 ? (
              <div className="card p-5 text-center text-[14.5px] text-muted">
                Money moved to and from your cards will appear here.
              </div>
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
          // Mint locally, then register the currency server-side. The
          // server enforces the same cap, so a card opened on another
          // device is refused here rather than silently exceeding it.
          const minted = openCard(style, name, network);
          if (!minted) return { card: null, error: `You already have ${MAX_CARDS} cards on this account.` };
          registeredRef.current.add(minted.id);
          const reg = await ledger.registerCard(minted.id, currency);
          if (!reg.ok) {
            removeCard(minted.id);
            registeredRef.current.delete(minted.id);
            return { card: null, error: reg.error };
          }
          setNotice(null);
          setTimeout(() => scrollTo(cards.length), 300);
          return { card: minted };
        }}
      />

      {active && (
        <>
          <TransferPanel
            open={action === "move"}
            onClose={() => setAction("none")}
            ledger={ledger}
            card={active}
            accountAvailableUsd={accountAvailableUsd}
            portfolioXlm={portfolioXlm}
          />
          <Panel open={action === "freeze"} title="Freeze this card?" onClose={() => setAction("none")}>
            <p className="text-[15px] leading-relaxed text-muted">
              Freezing locks •••• {active.number.slice(-4)} for a{" "}
              <span className="font-semibold text-primary">minimum of 3 days</span>. During that time it can&apos;t be
              used and can&apos;t be unfrozen.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <Button variant="secondary" onClick={() => setAction("none")}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  freezeCard(active.id);
                  setAction("none");
                }}
              >
                Freeze card
              </Button>
            </div>
          </Panel>
          <Panel open={action === "close"} title="Close this card?" onClose={() => setAction("none")}>
            <p className="text-[15px] leading-relaxed text-muted">
              {activeBalance && activeBalance.balance > 0
                ? `Its balance of ${formatMoney(activeBalance.balance, activeBalance.currency, { exact: true })} returns to your ITDB account first. `
                : ""}
              You can open another card afterwards.
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
