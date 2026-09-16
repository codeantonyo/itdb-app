"use client";

import { useState } from "react";
import { Check, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import type { BonusPayoutReport, ReconcileResult, SweepResult } from "@/app/api/admin/qrs-bonus/route";
import { AppBar } from "@/components/layout/app-bar";
import { NetworkNotice } from "@/components/shared/network-notice";
import { SectionHeader } from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useJson } from "@/lib/client/use-json";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

const qrs = (n: number) => `${formatAmount(n, 2)} QRS`;
const when = (t: number) =>
  new Date(t).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

/**
 * Operator screen for the QRS 25% bonus.
 *
 * Both buttons are safe to press repeatedly. Neither moves tokens — the
 * on-chain payout is run separately with scripts/pay-qrs-bonus.mjs —
 * and neither can mark a member paid who has not actually been paid,
 * because "confirm from chain" only ticks a row when a matching QRS
 * payment exists in that wallet's own history.
 */
export default function AdminQrsBonusPage() {
  const report = useJson<BonusPayoutReport>("/api/admin/qrs-bonus", 15_000);
  const [busy, setBusy] = useState<"sweep" | "reconcile" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: "sweep" | "reconcile") => {
    setBusy(action);
    setError(null);
    setNote(null);
    try {
      const r = await fetch("/api/admin/qrs-bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await r.json()) as (SweepResult & ReconcileResult) & { error?: string };
      if (!r.ok) {
        setError(data.error ?? "That did not work.");
      } else if (action === "sweep") {
        setNote(
          `Scanned ${data.scanned} accounts — ${data.awarded} newly awarded, ${data.alreadyHad} already had it, ` +
            `${data.lockedBelowTier1} locked below Tier 1, ${data.noQrs} hold no QRS` +
            (data.unreadable ? `, ${data.unreadable} unreadable (run again)` : "") +
            `. ${qrs(data.totalQrsOwed)} owed in total.`,
        );
      } else {
        setNote(
          `Checked ${data.checked} unpaid rows — ${data.confirmed} confirmed on chain, ${data.stillOwed} still owed` +
            (data.unreadable ? `, ${data.unreadable} unreadable (run again)` : "") +
            `.`,
        );
      }
      report.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(null);
    }
  };

  const r = report.data;

  return (
    <div className="flex flex-col gap-6">
      <AppBar back title="QRS 25% bonus" subtitle="Operator controls" />

      {report.error && !r && <NetworkNotice message={report.error} onRetry={report.refresh} />}

      <section className="panel-navy engrave p-5">
        <p className="text-[13px] font-medium text-muted">Owed in total</p>
        {r ? (
          <>
            <p className="font-display tnum mt-1 text-[34px] font-semibold leading-none text-primary">
              {formatAmount(r.totals.totalQrs, 2)}
            </p>
            <p className="tnum mt-1.5 text-[13px] text-muted">
              {r.totals.rows} members · {qrs(r.totals.unpaidQrs)} still unpaid across {r.totals.unpaidRows} of them
            </p>
          </>
        ) : (
          <Skeleton className="mt-2 h-9 w-48 opacity-30" />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Actions" />
        <div className="surface flex flex-col gap-3 p-5">
          <div>
            <Button size="lg" disabled={busy !== null} onClick={() => run("sweep")}>
              <RefreshCw className={cn("mr-2 size-4", busy === "sweep" && "animate-spin")} />
              {busy === "sweep" ? "Scanning…" : "1. Record who is owed"}
            </Button>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-2">
              Reads every member&rsquo;s live QRS balance and records the 25%. Run it again whenever new members join —
              nobody is awarded twice.
            </p>
          </div>
          <div>
            <Button size="lg" variant="secondary" disabled={busy !== null} onClick={() => run("reconcile")}>
              <ShieldCheck className={cn("mr-2 size-4", busy === "reconcile" && "animate-pulse")} />
              {busy === "reconcile" ? "Checking the chain…" : "2. Confirm payouts from the chain"}
            </Button>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-2">
              Looks in each wallet for the QRS actually arriving, and only then marks it delivered. A member the payout
              missed stays listed as owed.
            </p>
          </div>
          <p className="text-[12.5px] leading-relaxed text-muted-2">
            Neither button moves tokens. The payout itself is{" "}
            <span className="font-semibold text-muted">scripts/pay-qrs-bonus.mjs</span>, run from your machine.
          </p>
        </div>
        {note && (
          <p className="rounded-xl bg-success-soft px-3.5 py-3 text-[13.5px] leading-relaxed text-success">{note}</p>
        )}
        {error && <p className="rounded-xl bg-danger-soft px-3.5 py-3 text-[13.5px] text-danger">{error}</p>}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Members" note={r ? `${r.totals.rows} awarded` : undefined} />
        {r ? (
          r.rows.length === 0 ? (
            <p className="surface p-5 text-[14.5px] text-muted">
              Nothing recorded yet. Press &ldquo;Record who is owed&rdquo; above.
            </p>
          ) : (
            <div className="surface divide-y divide-hairline">
              {r.rows.map((row) => (
                <div key={row.accountId} className="flex items-start gap-3 px-4 py-3.5">
                  <span
                    className={cn(
                      "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                      row.paidOnChainAt ? "bg-success-soft text-success" : "bg-elevated text-muted-2",
                    )}
                  >
                    {row.paidOnChainAt ? (
                      <Check className="size-[15px]" strokeWidth={2.4} />
                    ) : (
                      <Lock className="size-[14px]" strokeWidth={2.2} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-[15px] font-semibold text-primary">{row.username}</p>
                      <p className="tnum shrink-0 text-[14.5px] font-semibold text-gold">{qrs(row.bonusQrs)}</p>
                    </div>
                    <p className="tnum truncate text-[12.5px] text-muted">
                      {row.category} · 25% of {formatAmount(row.basisBalance, 2)} · {row.wallets[0] ?? "no wallet"}
                    </p>
                    <p className="text-[12.5px] text-muted-2">
                      {row.paidOnChainAt ? (
                        <>
                          Paid {when(row.paidOnChainAt)}
                          {row.txHash ? ` · ${row.txHash.slice(0, 12)}…` : ""}
                        </>
                      ) : (
                        <>Awarded {when(row.awardedAt)} · awaiting payout</>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <Skeleton className="h-[220px] rounded-[18px]" />
        )}
      </section>
    </div>
  );
}
