"use client";

import type { ItdbSummary } from "@/app/api/itdb/route";
import { AppBar } from "@/components/layout/app-bar";
import { ExactFigure } from "@/components/shared/exact-figure";
import { LedgerLine } from "@/components/shared/ledger-line";
import { NetworkNotice } from "@/components/shared/network-notice";
import { SectionHeader } from "@/components/shared/section-header";
import { SimulatedNotice, SourceBadge } from "@/components/shared/simulated-notice";
import { TierProgress } from "@/components/shared/tier-progress";
import { TokenHeader } from "@/components/tokens/token-header";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortfolio } from "@/lib/client/portfolio";
import { useJson } from "@/lib/client/use-json";
import { formatAmount, formatCurrency, formatExactAmount, formatExactCurrency } from "@/lib/format";
import { ITDB_TOKEN, marketUrl } from "@/lib/itdb/config";

const rangeLabel = (min: number, max: number | null) =>
  max === null ? `${formatAmount(min, 0)}+ ITDB` : `${formatAmount(min, 0)} – ${formatAmount(max, 0)} ITDB`;

export default function ItdbPage() {
  const portfolio = usePortfolio();
  const asset = portfolio.assets.find((a) => a.code === "ITDB");
  const summary = useJson<ItdbSummary>("/api/itdb", 120_000);
  const s = summary.data;

  return (
    <div className="flex flex-col gap-6">
      <AppBar back title="ITDB" subtitle="Reserve token" />

      <TokenHeader code="ITDB" role="The main asset" asset={asset} marketUrl={marketUrl(ITDB_TOKEN)} loading={portfolio.loading} tierLabel={s?.tier ? `Tier ${s.tier.tier}` : null} />

      {summary.error && !s && <NetworkNotice message={summary.error} onRetry={summary.refresh} />}

      {s ? (
        <TierProgress
          balance={s.balance}
          unit="ITDB"
          currentTier={s.tier?.tier ?? null}
          rows={s.tiers.map((t) => ({ tier: t.tier, min: t.min, max: t.max, range: rangeLabel(t.min, t.max), value: `${t.multiplier}× basket`, detail: `~${formatCurrency(t.indicativeUsd)}` }))}
        />
      ) : summary.loading ? (
        <Skeleton className="h-[170px] rounded-[20px]" />
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeader title="Reserve basket" note="at live rates" />
        {s ? (
          <div className="surface p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium text-muted">Basket value</p>
                <ExactFigure compact={formatCurrency(s.basketUsd)} exact={formatExactCurrency(s.basketUsd)} className="font-display mt-1 block text-[30px] font-semibold leading-none text-primary" exactClassName="text-[22px]" />
              </div>
              {s.tier && (
                <p className="tnum text-right text-[12px] leading-tight text-muted-2">
                  Indicative
                  <br />
                  {formatCurrency(s.tier.indicativeUsd)}
                </p>
              )}
            </div>
            {s.basket.length === 0 ? (
              <p className="mt-4 text-[14.5px] text-muted">Your basket opens at Tier 1. The nine positions are set per tier.</p>
            ) : (
              <div className="mt-3">
                {s.basket.map((line) => (
                  <LedgerLine
                    key={line.id}
                    label={
                      <span className="flex items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: line.color }} />
                        <span className="font-semibold text-primary">{line.label}</span>
                        <span className="truncate text-[13px]">{line.name}</span>
                      </span>
                    }
                    value={<ExactFigure compact={formatCurrency(line.valueUsd)} exact={formatExactCurrency(line.valueUsd)} />}
                    sub={<ExactFigure compact={`${formatAmount(line.units, 0)} ${line.ticker ?? "USD basket"}`} exact={`${formatExactAmount(line.units, 0)} ${line.ticker ?? "USD basket"}`} />}
                    mark={<SourceBadge source={line.source} />}
                  />
                ))}
              </div>
            )}
            <SimulatedNotice className="mt-4" />
          </div>
        ) : summary.loading ? (
          <Skeleton className="h-[420px] rounded-[20px]" />
        ) : null}
      </section>
    </div>
  );
}
