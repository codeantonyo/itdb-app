"use client";

import { useState } from "react";
import { Check, ChevronRight, Lock } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TierRow {
  tier: number;
  min: number;
  max: number | null;
  range: string;
  value: string;
  detail?: string;
}

interface TierProgressProps {
  rows: TierRow[];
  currentTier: number | null;
  balance: number;
  unit: string;
  className?: string;
}

/**
 * Tier card: current tier badge, headline value, a progress bar toward
 * the next tier, and a sheet listing every tier.
 */
export function TierProgress({ rows, currentTier, balance, unit, className }: TierProgressProps) {
  const [open, setOpen] = useState(false);
  const current = rows.find((r) => r.tier === currentTier) ?? null;
  const next = rows.find((r) => r.tier === (currentTier ?? 0) + 1) ?? null;
  const floor = current?.min ?? 0;
  const ceiling = next?.min ?? current?.min ?? 1;
  const progress = next ? Math.max(0, Math.min(1, (balance - floor) / Math.max(ceiling - floor, 1))) : 1;

  return (
    <>
      <section className={cn("surface p-5", className)}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-display flex size-11 items-center justify-center rounded-full bg-gold text-[18px] font-semibold text-gold-ink">
              {current ? current.tier : "–"}
            </span>
            <div>
              <p className="text-[16px] font-semibold text-primary">{current ? `Tier ${current.tier}` : "Below Tier 1"}</p>
              <p className="tnum text-[13px] text-muted">{current ? current.range : `From ${formatAmount(rows[0].min, 0)} ${unit}`}</p>
            </div>
          </div>
          {current && <p className="tnum text-right text-[15px] font-semibold text-gold">{current.value}</p>}
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-elevated">
          <div className="h-full rounded-full bg-gold transition-[width] duration-700" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <p className="tnum mt-2 text-[13px] text-muted">
          {next
            ? `${formatAmount(Math.max(next.min - balance, 0), 2)} ${unit} more to Tier ${next.tier} · ${next.value}`
            : "Top tier reached"}
        </p>

        <button onClick={() => setOpen(true)} className="tap mt-2 flex w-full items-center justify-between text-[14px] font-semibold text-gold">
          View all tiers
          <ChevronRight className="size-4" />
        </button>
      </section>

      <Panel open={open} title="Holding tiers" onClose={() => setOpen(false)}>
        <div className="flex flex-col divide-y divide-hairline">
          {rows.map((r) => {
            const reached = currentTier !== null && r.tier <= currentTier;
            const yours = r.tier === currentTier;
            return (
              <div key={r.tier} className={cn("flex items-center gap-3 py-3", yours && "-mx-2 rounded-xl bg-gold-soft px-2")}>
                <span
                  className={cn(
                    "font-display flex size-9 shrink-0 items-center justify-center rounded-full border text-[14px] font-semibold",
                    yours ? "border-gold bg-gold text-gold-ink" : reached ? "border-gold text-gold" : "border-hairline text-muted-2",
                  )}
                >
                  {reached && !yours ? <Check className="size-4" strokeWidth={2.5} /> : r.tier}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[15px] font-semibold text-primary">
                      Tier {r.tier}
                      {yours && <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-gold">Yours</span>}
                    </p>
                    <p className={cn("tnum text-[14.5px] font-semibold", yours ? "text-gold" : "text-primary")}>{r.value}</p>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="tnum text-[13px] text-muted">{r.range}</p>
                    {r.detail && <p className="truncate text-[12.5px] text-muted-2">{r.detail}</p>}
                  </div>
                </div>
                {!reached && <Lock className="size-4 shrink-0 text-muted-2" />}
              </div>
            );
          })}
        </div>
      </Panel>
    </>
  );
}
