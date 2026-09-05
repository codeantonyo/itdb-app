"use client";

import { Clock } from "lucide-react";
import { ExactFigure } from "@/components/shared/exact-figure";
import { LedgerLine } from "@/components/shared/ledger-line";
import { SourceBadge } from "@/components/shared/simulated-notice";
import { Button } from "@/components/ui/button";
import { formatRemaining } from "@/lib/client/cards";
import type { YieldComputed } from "@/lib/server/accrual";
import { formatAmount, formatCurrency, formatExactAmount, formatExactCurrency } from "@/lib/format";

interface YieldCardProps {
  y: YieldComputed;
  minLabel: string;
  onCollect: () => void;
}

/**
 * Pending daily yield: the headline figure, per-line breakdown, collect
 * button. Accrual runs from the day the member first acquired the token
 * on chain (see programInputs), so the figure reflects their full
 * holding period, not the day they signed up.
 */
export function YieldCard({ y, minLabel, onCollect }: YieldCardProps) {
  const eligible = y.tier !== null;
  const canCollect = eligible && y.pendingUsd >= y.minCollectUsd && y.cooldownRemainingMs === 0;

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-muted">Yield built up</p>
          <ExactFigure
            compact={formatCurrency(y.pendingUsd)}
            exact={formatExactCurrency(y.pendingUsd)}
            className="font-display mt-1 block text-[34px] font-semibold leading-none text-primary"
            exactClassName="text-[24px]"
          />
        </div>
        {y.collectedUsd > 0 && (
          <div className="rounded-xl bg-elevated px-3 py-2 text-right">
            <p className="text-[11.5px] text-muted">Collected</p>
            <p className="tnum text-[14px] font-semibold text-primary">{formatCurrency(y.collectedUsd)}</p>
          </div>
        )}
      </div>
      <p className="tnum mt-2 text-[13.5px] text-muted">
        {eligible ? `${formatCurrency(y.perDayUsd)} per day · ${formatCurrency(y.yearlyUsd)} per year at Tier ${y.tier}` : `Hold at least ${minLabel} to start earning daily yield.`}
      </p>

      {eligible && y.lines.length > 0 && (
        <div className="mt-3">
          {y.lines.map((l) => (
            <LedgerLine
              key={l.code}
              label={l.code === "USD" ? "Currency allowance" : l.code}
              value={<ExactFigure compact={formatCurrency(l.usd)} exact={formatExactCurrency(l.usd)} />}
              sub={`${formatAmount(l.perDay, 0)} ${l.code === "USD" ? "USD" : l.code} / day${l.code !== "USD" ? ` · ${formatAmount(l.accrued, 2)} built up` : ""}`}
              mark={l.code !== "USD" ? <SourceBadge source={l.source} /> : undefined}
            />
          ))}
        </div>
      )}

      {eligible && y.from > 0 && (
        <p className="tnum mt-2 flex items-center gap-1.5 text-[12.5px] text-muted-2">
          <Clock className="size-3.5" />
          Since {new Date(y.from).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {formatExactAmount(y.daysAccrued, 2)} days
        </p>
      )}

      <Button size="lg" className="mt-4" disabled={!canCollect} onClick={onCollect}>
        {y.cooldownRemainingMs > 0
          ? `Collect again in ${formatRemaining(y.cooldownRemainingMs)}`
          : eligible && y.pendingUsd < y.minCollectUsd
            ? `Collect from ${formatCurrency(y.minCollectUsd)}`
            : `Collect ${formatCurrency(y.pendingUsd)}`}
      </Button>

    </section>
  );
}
