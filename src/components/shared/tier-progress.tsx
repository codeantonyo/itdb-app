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
  /**
   * False when no balance can ever land on this tier, because a higher
   * tier's threshold sits at or below its own. Defaults to true.
   */
  reachable?: boolean;
}

interface TierProgressProps {
  rows: TierRow[];
  currentTier: number | null;
  balance: number;
  unit: string;
  className?: string;
  /** Short standing note about the ladder, e.g. a permanent discount */
  note?: string;
}

/**
 * Tier card: current tier badge, headline value, a progress bar toward
 * the next tier, and a sheet listing every tier.
 */
export function TierProgress({ rows, currentTier, balance, unit, className, note }: TierProgressProps) {
  const [open, setOpen] = useState(false);
  const current = rows.find((r) => r.tier === currentTier) ?? null;
  // The next tier by THRESHOLD, not by number — the tier above may sit
  // below where the member already is, and a tier nothing can reach is
  // never offered as a target.
  const next =
    rows
      .filter((r) => r.reachable !== false && r.min > balance)
      .sort((a, b) => a.min - b.min)[0] ?? null;
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

        {note && (
          <p className="mt-3 inline-flex items-center rounded-md bg-success-soft px-2 py-1 text-[11.5px] font-bold uppercase tracking-wide text-success">
            {note}
          </p>
        )}

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
            const off = r.reachable === false;
            const reached = !off && currentTier !== null && r.tier <= currentTier;
            const yours = r.tier === currentTier;
            return (
              <div key={r.tier} className={cn("flex items-center gap-3 py-3", yours && "-mx-2 rounded-xl bg-gold-soft px-2")}>
                <span
                  className={cn(
                    "font-display flex size-9 shrink-0 items-center justify-center rounded-full border text-[14px] font-semibold",
                    yours ? "border-gold bg-gold text-gold-ink" : reached ? "border-gold text-gold" : "border-hairline text-muted-2",
                    off && "opacity-45",
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
                    <p className="tnum text-[13px] text-muted">{off ? "Not reachable — a higher tier opens first" : r.range}</p>
                    {r.detail && <p className="truncate text-[12.5px] text-muted-2">{r.detail}</p>}
                  </div>
                </div>
                {!reached && !off && <Lock className="size-4 shrink-0 text-muted-2" />}
              </div>
            );
          })}
        </div>
      </Panel>
    </>
  );
}
