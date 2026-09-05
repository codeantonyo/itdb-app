"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Gift } from "lucide-react";
import type { AirdropSummary } from "@/lib/server/airdrop";
import type { ItdboneSummary } from "@/app/api/itdbone/route";
import type { QrsSummary } from "@/app/api/qrs/route";
import { AppBar } from "@/components/layout/app-bar";
import { ExactFigure } from "@/components/shared/exact-figure";
import { NetworkNotice } from "@/components/shared/network-notice";
import { CollectPanel, type CollectOutcome } from "@/components/tokens/collect-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/client/auth";
import { useCards } from "@/lib/client/cards";
import { formatRemaining } from "@/lib/client/cards";
import { usePortfolio } from "@/lib/client/portfolio";
import { useJson } from "@/lib/client/use-json";
import { useWalletLedger } from "@/lib/client/wallet-ledger";
import { formatCurrency, formatExactCurrency } from "@/lib/format";
import type { YieldComputed } from "@/lib/server/accrual";

type Program = "itdbone" | "qrs";

/** One yield programme as a card with its own collect action. */
function YieldRow({
  name,
  href,
  y,
  onCollect,
}: {
  name: string;
  href: string;
  y: YieldComputed;
  onCollect: () => void;
}) {
  const eligible = y.tier !== null;
  const ready = eligible && y.pendingUsd >= y.minCollectUsd && y.cooldownRemainingMs === 0;
  return (
    <section className="surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={href} className="flex items-center gap-1 text-[15px] font-semibold text-primary">
            {name}
            <ChevronRight className="size-4 text-muted-2" />
          </Link>
          <p className="text-[13px] text-muted">
            {eligible ? `Tier ${y.tier} · ${formatCurrency(y.perDayUsd)} per day` : "Not earning yet"}
          </p>
        </div>
        {eligible && (
          <span className="inset shrink-0 px-2.5 py-1 text-right">
            <span className="block text-[11px] text-muted">Collected</span>
            <span className="tnum block text-[13px] font-semibold text-primary">{formatCurrency(y.collectedUsd)}</span>
          </span>
        )}
      </div>

      <ExactFigure
        compact={formatCurrency(y.pendingUsd)}
        exact={formatExactCurrency(y.pendingUsd)}
        className="font-display mt-3 block text-[30px] font-semibold leading-none text-primary"
        exactClassName="text-[22px]"
      />
      <p className="mt-1 text-[13px] text-muted">ready to collect</p>

      <Button size="lg" className="mt-4" disabled={!ready} onClick={onCollect}>
        {!eligible
          ? "Hold more to earn"
          : y.cooldownRemainingMs > 0
            ? `Available in ${formatRemaining(y.cooldownRemainingMs)}`
            : y.pendingUsd < y.minCollectUsd
              ? `Collect from ${formatCurrency(y.minCollectUsd)}`
              : `Collect ${formatCurrency(y.pendingUsd)}`}
      </Button>
    </section>
  );
}

export default function RewardsPage() {
  const { session } = useAuth();
  const portfolio = usePortfolio();
  const ledger = useWalletLedger(!!session);
  const { cards } = useCards(session?.address ?? null);

  const itdbone = useJson<ItdboneSummary>("/api/itdbone", 60_000);
  const qrs = useJson<QrsSummary>("/api/qrs", 60_000);
  const airdrop = useJson<AirdropSummary>("/api/airdrop", 120_000);
  const [collecting, setCollecting] = useState<Program | null>(null);

  const collect = async (program: Program, destination: string): Promise<CollectOutcome> => {
    try {
      const r = await fetch(`/api/${program}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "collect", to: destination }),
      });
      const data = (await r.json()) as { error?: string; usd?: number; credited?: number; currency?: string };
      if (r.ok) {
        (program === "itdbone" ? itdbone : qrs).refresh();
        ledger.refresh();
        portfolio.refresh();
        return { ok: true, usd: data.usd, credited: data.credited, currency: data.currency };
      }
      return { ok: false, error: data.error };
    } catch {
      return { ok: false, error: "Network error — try again." };
    }
  };

  const pendingTotal = (itdbone.data?.yield.pendingUsd ?? 0) + (qrs.data?.yield.pendingUsd ?? 0);
  const airdropValue = airdrop.data
    ? airdrop.data.claimed
      ? airdrop.data.remainingUsd
      : airdrop.data.grantUsd
    : 0;
  const loading = itdbone.loading && qrs.loading;
  const anyError = itdbone.error ?? qrs.error ?? airdrop.error;

  return (
    <div className="flex flex-col">
      <AppBar title="Rewards" subtitle="Yield and airdrops in one place" />

      {/* ---------------- Ready to collect ---------------- */}
      <section className="panel-navy engrave mt-1 p-5">
        <p className="text-[13px] font-medium text-muted">Ready to collect</p>
        {loading ? (
          <Skeleton className="mt-2 h-9 w-40 opacity-30" />
        ) : (
          <ExactFigure
            compact={formatCurrency(pendingTotal)}
            exact={formatExactCurrency(pendingTotal)}
            className="font-display mt-1 block text-[36px] font-semibold leading-none text-primary"
            exactClassName="text-[24px]"
          />
        )}
        <p className="mt-1.5 text-[13px] text-muted">Across ITDBONE and QRS daily yield</p>
      </section>

      {anyError && !itdbone.data && !qrs.data && (
        <NetworkNotice
          className="mt-4"
          message={anyError}
          onRetry={() => {
            itdbone.refresh();
            qrs.refresh();
            airdrop.refresh();
          }}
        />
      )}

      {/* ---------------- Airdrop ---------------- */}
      <Link href="/airdrop" className="surface mt-4 flex items-center gap-3.5 p-4 transition-opacity active:opacity-70">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gold-soft text-gold">
          <Gift className="size-[21px]" strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15.5px] font-semibold text-primary">
            {airdrop.data?.title ?? "Founding Airdrop"}
          </span>
          <span className="block text-[13px] text-muted">
            {airdrop.data
              ? airdrop.data.claimed
                ? "Claimed · withdraw to a card"
                : airdrop.data.eligible
                  ? "You are eligible to claim"
                  : "Hold all three ITDB assets to claim"
              : "Checking eligibility…"}
          </span>
        </span>
        {airdropValue > 0 && (
          <span className="tnum shrink-0 text-[15px] font-semibold text-gold">{formatCurrency(airdropValue)}</span>
        )}
        <ChevronRight className="size-4 shrink-0 text-muted-2" />
      </Link>

      {/* ---------------- Yield programmes ---------------- */}
      <div className="mt-4 flex flex-col gap-4">
        {itdbone.data ? (
          <YieldRow
            name="ITDBONE daily yield"
            href="/itdbone"
            y={itdbone.data.yield}
            onCollect={() => setCollecting("itdbone")}
          />
        ) : (
          <Skeleton className="h-[210px] rounded-[18px]" />
        )}
        {qrs.data ? (
          <YieldRow name="QRS daily yield" href="/qrs" y={qrs.data.yield} onCollect={() => setCollecting("qrs")} />
        ) : (
          <Skeleton className="h-[210px] rounded-[18px]" />
        )}
      </div>

      <p className="mt-4 px-1 text-[12.5px] leading-relaxed text-muted-2">
        Yield counts from the day you first acquired each token on chain, and keeps building while you wait.
      </p>

      {collecting && (
        <CollectPanel
          open
          onClose={() => setCollecting(null)}
          program={collecting}
          pendingUsd={(collecting === "itdbone" ? itdbone.data : qrs.data)?.yield.pendingUsd ?? 0}
          cards={cards}
          ledgerCards={ledger.cards}
          onConfirm={(destination) => collect(collecting, destination)}
        />
      )}
    </div>
  );
}
