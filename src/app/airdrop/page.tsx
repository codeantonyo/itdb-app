"use client";

import { useState } from "react";
import { Check, Gift, Lock } from "lucide-react";
import type { AirdropSummary } from "@/lib/server/airdrop";
import { WithdrawPanel, type WithdrawOutcome } from "@/components/airdrop/withdraw-panel";
import { AppBar } from "@/components/layout/app-bar";
import { ExactFigure } from "@/components/shared/exact-figure";
import { LedgerLine } from "@/components/shared/ledger-line";
import { NetworkNotice } from "@/components/shared/network-notice";
import { SectionHeader } from "@/components/shared/section-header";
import { SourceBadge } from "@/components/shared/simulated-notice";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/client/auth";
import { useCards } from "@/lib/client/cards";
import { useJson } from "@/lib/client/use-json";
import { useWalletLedger } from "@/lib/client/wallet-ledger";
import { formatAmount, formatCurrency, formatExactAmount, formatExactCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = {
  crypto: "Digital assets",
  metal: "Precious metals",
  reserve: "Special reserve assets",
};

export default function AirdropPage() {
  const { session } = useAuth();
  const summary = useJson<AirdropSummary>("/api/airdrop", 120_000);
  const ledger = useWalletLedger(!!session);
  const { cards } = useCards(session?.address ?? null);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawCode, setWithdrawCode] = useState<string | null>(null);

  const s = summary.data;

  const claim = async () => {
    setClaiming(true);
    setClaimError(null);
    try {
      const r = await fetch("/api/airdrop/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim" }),
      });
      const data = (await r.json()) as { error?: string };
      if (r.ok) summary.refresh();
      else setClaimError(data.error ?? "Claim failed.");
    } catch {
      setClaimError("Network error — try again.");
    } finally {
      setClaiming(false);
    }
  };

  const withdraw = async (code: string, units: number, cardId: string): Promise<WithdrawOutcome> => {
    try {
      const r = await fetch("/api/airdrop/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "withdraw", code, units, to: cardId }),
      });
      const data = (await r.json()) as WithdrawOutcome & { error?: string };
      if (r.ok) {
        summary.refresh();
        ledger.refresh();
        return { ...data, ok: true };
      }
      return { ok: false, error: data.error };
    } catch {
      return { ok: false, error: "Network error — try again." };
    }
  };

  const openWithdraw = (code?: string) => {
    setWithdrawCode(code ?? null);
    setWithdrawOpen(true);
  };

  const groups: ("crypto" | "metal" | "reserve")[] = ["crypto", "metal", "reserve"];

  return (
    <div className="flex flex-col gap-6">
      <AppBar back title={s?.title ?? "Founding Airdrop"} subtitle="One-time distribution" />

      {summary.error && !s && <NetworkNotice message={summary.error} onRetry={summary.refresh} />}

      {!s ? (
        <Skeleton className="h-[320px] rounded-[20px]" />
      ) : s.claimed ? (
        <>
          {/* ---------------- Claimed: holdings value ---------------- */}
          <section className="panel-navy engrave p-6">
            <p className="text-[13px] font-medium text-muted">Your airdrop holdings</p>
            <ExactFigure
              compact={formatCurrency(s.remainingUsd)}
              exact={formatExactCurrency(s.remainingUsd)}
              className="font-display mt-1 block text-[42px] font-semibold leading-none tracking-tight text-primary"
              exactClassName="text-[28px]"
            />
            <p className="mt-2 text-[14px] text-muted">
              Claimed {new Date(s.claimedAt ?? 0).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </p>
            {s.withdrawnUsd > 0 && (
              <p className="tnum mt-3 inline-block rounded-full bg-elevated px-2.5 py-1 text-[12.5px] text-muted">
                {formatCurrency(s.withdrawnUsd)} already withdrawn
              </p>
            )}
            <Button size="lg" className="mt-5" onClick={() => openWithdraw()}>
              Withdraw to card
            </Button>
          </section>

          {/* ---------------- Asset table ---------------- */}
          {groups.map((kind) => {
            const rows = s.lines.filter((l) => l.kind === kind);
            if (rows.length === 0) return null;
            return (
              <section key={kind} className="flex flex-col gap-3">
                <SectionHeader title={KIND_LABEL[kind]} />
                <div className="surface px-4">
                  {rows.map((l) => (
                    <LedgerLine
                      key={l.code}
                      label={
                        <span className="flex items-center gap-2">
                          <span className="font-semibold text-primary">{l.code}</span>
                          <span className="truncate text-[13px]">{l.name}</span>
                        </span>
                      }
                      value={
                        l.valueUsd === null ? (
                          <span className="text-muted-2">No market</span>
                        ) : (
                          <ExactFigure compact={formatCurrency(l.valueUsd)} exact={formatExactCurrency(l.valueUsd)} />
                        )
                      }
                      sub={
                        <span className="flex items-center gap-2">
                          <ExactFigure
                            compact={`${formatAmount(l.remaining, 2)} ${l.unit}`}
                            exact={`${formatExactAmount(l.remaining, 2)} ${l.unit}`}
                          />
                          {l.remaining < l.granted && (
                            <span className="text-muted-2">of {formatAmount(l.granted, 0)} granted</span>
                          )}
                        </span>
                      }
                      mark={
                        l.source ? (
                          <SourceBadge source={l.source} />
                        ) : (
                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-2">
                            Unpriced
                          </span>
                        )
                      }
                    />
                  ))}
                </div>
                {kind === "reserve" && (
                  <p className="px-1 text-[13px] leading-relaxed text-muted-2">
                    These carry no public market price, so they are held as quantities and cannot be withdrawn as value.
                  </p>
                )}
              </section>
            );
          })}

          {/* ---------------- Withdrawal history ---------------- */}
          {s.withdrawals.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionHeader title="Withdrawals" />
              <div className="surface px-4">
                {[...s.withdrawals].reverse().map((w) => (
                  <LedgerLine
                    key={w.id}
                    label={`${formatAmount(w.units, 2)} ${w.code}`}
                    value={formatCurrency(w.usd)}
                    sub={new Date(w.at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <>
          {/* ---------------- Unclaimed: eligibility ---------------- */}
          <section className="panel-navy engrave p-6 text-center">
            <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-elevated">
              <Gift className="size-8 text-gold-light" strokeWidth={1.6} />
            </span>
            <p className="mt-4 text-[13px] font-medium text-muted">Total value at today&apos;s rates</p>
            <p className="font-display mt-1 text-[38px] font-semibold leading-none text-primary">
              {formatCurrency(s.grantUsd)}
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-muted">
              {s.lines.length} assets across digital currencies, precious metals and reserve assets.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeader title="Who can claim" />
            <div className="surface px-4">
              {s.requirements.map((r) => (
                <LedgerLine
                  key={r.code}
                  label={
                    <span className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "flex size-6 items-center justify-center rounded-full",
                          r.ok ? "bg-gold text-gold-ink" : "bg-elevated text-muted-2",
                        )}
                      >
                        {r.ok ? <Check className="size-3.5" strokeWidth={3} /> : <Lock className="size-3" />}
                      </span>
                      <span className={cn("font-semibold", r.ok ? "text-primary" : "text-muted")}>Holds {r.code}</span>
                    </span>
                  }
                  value={r.ok ? formatAmount(r.held, 2) : "None"}
                  valueClassName={r.ok ? "text-success" : "text-muted-2"}
                />
              ))}
            </div>
            <p className="px-1 text-[13px] leading-relaxed text-muted-2">
              Holdings are read from every wallet linked to your account.
            </p>
          </section>

          {/* ---------------- What's in it ---------------- */}
          {groups.map((kind) => {
            const rows = s.lines.filter((l) => l.kind === kind);
            if (rows.length === 0) return null;
            return (
              <section key={kind} className="flex flex-col gap-3">
                <SectionHeader title={KIND_LABEL[kind]} />
                <div className="surface px-4">
                  {rows.map((l) => (
                    <LedgerLine
                      key={l.code}
                      label={
                        <span className="flex items-center gap-2">
                          <span className="font-semibold text-primary">{l.code}</span>
                          <span className="truncate text-[13px]">{l.name}</span>
                        </span>
                      }
                      value={`${formatAmount(l.granted, 0)} ${l.unit}`}
                      sub={
                        l.usdPerUnit === null
                          ? "No public market"
                          : formatCurrency(l.granted * l.usdPerUnit)
                      }
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {claimError && (
            <p className="rounded-xl bg-danger-soft px-4 py-3 text-[14px] text-danger">{claimError}</p>
          )}

          <Button size="lg" disabled={!s.eligible || claiming} onClick={claim}>
            {claiming
              ? "Claiming…"
              : s.eligible
                ? `Claim ${formatCurrency(s.grantUsd)}`
                : "Hold all three assets to claim"}
          </Button>
        </>
      )}

      {s?.claimed && (
        <WithdrawPanel
          open={withdrawOpen}
          onClose={() => setWithdrawOpen(false)}
          lines={s.lines}
          cards={cards}
          ledgerCards={ledger.cards}
          initialCode={withdrawCode}
          onConfirm={withdraw}
        />
      )}
    </div>
  );
}
