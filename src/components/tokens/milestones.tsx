"use client";

import { BadgeCheck, Check, Lock, Sparkles } from "lucide-react";
import type { ActiveMultiplier, Milestone, MilestoneStatus } from "@/lib/itdb/milestones";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS: Record<MilestoneStatus, { label: string; chip: string; icon: typeof Check }> = {
  active: { label: "Active", chip: "bg-success-soft text-success", icon: Check },
  delivered: { label: "Delivered", chip: "bg-gold-soft text-gold", icon: Check },
  locked: { label: "Locked", chip: "bg-elevated text-muted-2", icon: Lock },
};

/**
 * The multiplier currently in force for one token, with what would
 * raise it next. Deliberately says which token it belongs to, because
 * a bonus for one token never applies to another.
 */
export function MultiplierBanner({
  token,
  multiplier,
  scales,
}: {
  token: string;
  multiplier: ActiveMultiplier;
  /** What the multiplier scales, in the member's words */
  scales: string;
}) {
  if (multiplier.value <= 1 && !multiplier.next) return null;
  return (
    <section className="surface p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gold-soft text-gold">
          <Sparkles className="size-[21px]" strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          {multiplier.value > 1 ? (
            <>
              <p className="font-display text-[24px] font-semibold leading-none text-gold">
                ×{formatAmount(multiplier.value, 0)}
              </p>
              <p className="mt-1 text-[13.5px] text-muted">
                {multiplier.from?.title} · applied to your {scales}
              </p>
            </>
          ) : (
            <>
              <p className="text-[15.5px] font-semibold text-primary">No multiplier active yet</p>
              <p className="mt-0.5 text-[13.5px] text-muted">Your {scales} is at its base rate.</p>
            </>
          )}
        </div>
      </div>

      {multiplier.next && (
        <p className="mt-3 border-t border-hairline pt-3 text-[13.5px] leading-relaxed text-muted">
          Next: <span className="font-semibold text-primary">×{formatAmount(multiplier.next.multiplier ?? 0, 0)}</span> at{" "}
          {multiplier.next.threshold}. It replaces the current multiplier rather than adding to it.
        </p>
      )}

      <p className="mt-2 text-[12.5px] leading-relaxed text-muted-2">
        {token} bonuses apply to {token} only. They never carry across to another token.
      </p>
    </section>
  );
}

/** Every milestone for one token, with its status. */
export function MilestoneList({ milestones }: { milestones: Milestone[] }) {
  return (
    <div className="surface divide-y divide-hairline">
      {milestones.map((m) => {
        const s = STATUS[m.status];
        const Icon = s.icon;
        const dim = m.status === "locked";
        return (
          <div key={m.id} className="flex items-start gap-3 px-4 py-3.5">
            <span
              className={cn(
                "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                dim ? "bg-elevated text-muted-2" : "bg-gold-soft text-gold",
              )}
            >
              <Icon className="size-[15px]" strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className={cn("text-[15px] font-semibold", dim ? "text-muted" : "text-primary")}>{m.title}</p>
                <span
                  className={cn(
                    "shrink-0 rounded-md px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide",
                    s.chip,
                  )}
                >
                  {s.label}
                </span>
              </div>
              {m.amount && (
                <p className="tnum font-display mt-1 text-[20px] font-semibold leading-none text-gold">{m.amount}</p>
              )}
              <p className="mt-1 text-[13px] leading-snug text-muted">{m.detail}</p>
              {m.threshold && (
                <p className="mt-1 text-[12.5px] text-muted-2">
                  {m.status === "locked" ? "Unlocks at" : "Unlocked at"} {m.threshold}
                  {m.restricted && " · eligible holders only"}
                </p>
              )}
              {!m.threshold && m.restricted && (
                <p className="mt-1 text-[12.5px] text-muted-2">Eligible holders only</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The ITDB early-bird lifetime status. Account-wide rather than
 * per-token: it multiplies every reward the member earns, and it is
 * shown only to wallets on the allowlist.
 */
export function EarlyBirdBanner({ multiplier }: { multiplier: number }) {
  return (
    <section className="surface p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
          <BadgeCheck className="size-[22px]" strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15.5px] font-semibold text-primary">
              Early Bird Status: ×{formatAmount(multiplier, 0)} Lifetime Multiplier
            </p>
            <span className="rounded-md bg-success-soft px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide text-success">
              Active
            </span>
          </div>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
            You bought ITDB at the 0.5 XLM early-bird price. Every reward, commission, distribution and daily yield on
            this account is multiplied by {formatAmount(multiplier, 0)}, for life. It never expires.
          </p>
        </div>
      </div>
    </section>
  );
}
