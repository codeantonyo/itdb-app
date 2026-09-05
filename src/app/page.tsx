"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Gift, Plus, type LucideIcon } from "lucide-react";
import { AppBar } from "@/components/layout/app-bar";
import { AreaChart } from "@/components/shared/area-chart";
import { AssetRow } from "@/components/shared/asset-row";
import { ExactFigure } from "@/components/shared/exact-figure";
import { NetworkNotice } from "@/components/shared/network-notice";
import { PaymentRow } from "@/components/shared/statement-row";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/client/auth";
import { isDustPayment, usePortfolio, type PortfolioPayment } from "@/lib/client/portfolio";
import { useWalletLedger } from "@/lib/client/wallet-ledger";
import {
  formatAmount,
  formatCurrency,
  formatExactAmount,
  formatExactCurrency,
  formatPercent,
} from "@/lib/format";
import { ITDB_TOKEN, itdbTierFor, itdboneTierFor, marketUrl, qrsTierFor } from "@/lib/itdb/config";
import { cn } from "@/lib/utils";

const TIER_OF: Record<string, (b: number) => { tier: number } | null> = {
  ITDB: itdbTierFor,
  ITDBONE: itdboneTierFor,
  QRS: qrsTierFor,
};
const HREF_OF: Record<string, string> = { ITDB: "/itdb", ITDBONE: "/itdbone", QRS: "/qrs" };

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** An action inside the balance panel. */
function PanelAction({ icon: Icon, label, href, external }: { icon: LucideIcon; label: string; href: string; external?: boolean }) {
  const inner = (
    <>
      <span className="flex size-10 items-center justify-center rounded-full bg-elevated text-gold">
        <Icon className="size-[18px]" strokeWidth={2} />
      </span>
      <span className="text-[12px] font-medium text-muted">{label}</span>
    </>
  );
  const cls = "tap flex flex-1 flex-col items-center gap-1.5 transition-opacity active:opacity-70";
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}

/** Group payments under Today / Yesterday / a date. */
function groupByDay(payments: PortfolioPayment[]) {
  const groups: { label: string; items: PortfolioPayment[] }[] = [];
  const today = new Date().setHours(0, 0, 0, 0);
  for (const p of payments) {
    const day = new Date(p.at).setHours(0, 0, 0, 0);
    const diff = Math.round((today - day) / 86_400_000);
    const label =
      diff <= 0
        ? "Today"
        : diff === 1
          ? "Yesterday"
          : new Date(p.at).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
    const last = groups.at(-1);
    if (last && last.label === label) last.items.push(p);
    else groups.push({ label, items: [p] });
  }
  return groups;
}

export default function HomePage() {
  const { session } = useAuth();
  const portfolio = usePortfolio();
  const ledger = useWalletLedger(!!session);
  const [view, setView] = useState<"assets" | "activity">("assets");

  const availableUsd = Math.max(portfolio.totalUsd - ledger.fromAccountUsd, 0);
  const availableXlm = portfolio.xlmUsd > 0 ? availableUsd / portfolio.xlmUsd : 0;
  const positive = portfolio.change24hPercent >= -0.005;
  const firstName = session?.name.split(" ")[0] ?? "there";
  const pending = portfolio.loading && portfolio.assets.length === 0;
  const unavailable = portfolio.balancesUnknown || (!!portfolio.error && !portfolio.loading);

  const activity = useMemo(
    () => portfolio.payments.filter((p) => !isDustPayment(p, portfolio.prices)).slice(0, 25),
    [portfolio.payments, portfolio.prices],
  );
  const groups = useMemo(() => groupByDay(activity), [activity]);

  const held = useMemo(
    () => [...portfolio.assets].sort((a, b) => b.valueUsd - a.valueUsd),
    [portfolio.assets],
  );

  return (
    <div className="flex flex-col">
      <AppBar title={`${greeting()}, ${firstName}`} avatarFor={session?.name ?? "Member"} />

      {/* ---------------- Balance panel ---------------- */}
      <section className="panel-navy engrave mt-1 px-5 pb-4 pt-5">
        <p className="text-[13px] font-medium text-muted">Total balance</p>
        {pending ? (
          <Skeleton className="mt-2.5 h-10 w-48 opacity-30" />
        ) : unavailable && portfolio.assets.every((a) => a.balance === 0) ? (
          <p className="font-display mt-1.5 text-[28px] text-muted">Unavailable</p>
        ) : (
          <>
            <ExactFigure
              compact={formatCurrency(availableUsd)}
              exact={formatExactCurrency(availableUsd)}
              className="font-display mt-1 block text-[40px] font-semibold leading-none text-primary"
              exactClassName="text-[26px]"
            />
            <div className="mt-2 flex items-center gap-2">
              <span
                className={cn(
                  "tnum inline-flex items-center gap-1 text-[13.5px] font-semibold",
                  positive ? "text-success" : "text-danger",
                )}
              >
                {positive ? <ArrowUpRight className="size-3.5" /> : <ArrowDownLeft className="size-3.5" />}
                {formatPercent(Math.abs(portfolio.change24hPercent) < 0.005 ? 0 : portfolio.change24hPercent)}
              </span>
              <ExactFigure
                compact={`≈ ${formatAmount(availableXlm, 2)} XLM`}
                exact={`≈ ${formatExactAmount(availableXlm, 7)} XLM`}
                className="text-[13px] text-muted"
              />
            </div>
          </>
        )}

        <AreaChart points={portfolio.history.map((p) => p.v)} className="mt-3" height={56} />

        <div className="mt-2 flex border-t border-hairline pt-3.5">
          <PanelAction icon={ArrowLeftRight} label="Move" href="/cards" />
          <PanelAction icon={Gift} label="Collect" href="/rewards" />
          <PanelAction icon={Plus} label="Buy" href={marketUrl(ITDB_TOKEN)} external />
          <PanelAction icon={ArrowUpRight} label="Portfolio" href="/portfolio" />
        </div>
      </section>

      {unavailable && (
        <NetworkNotice className="mt-4" message={portfolio.error} onRetry={portfolio.refresh} />
      )}

      {/* ---------------- Assets / Activity ---------------- */}
      <Segmented
        className="mt-5"
        value={view}
        onChange={setView}
        options={[
          { value: "assets", label: "Assets" },
          { value: "activity", label: "Activity" },
        ]}
      />

      {view === "assets" ? (
        pending ? (
          <Skeleton className="mt-4 h-[260px] rounded-[18px]" />
        ) : (
          <>
            <div className="surface mt-4 divide-y divide-hairline">
              {held.map((asset) => (
                <AssetRow
                  key={asset.id}
                  asset={asset}
                  href={HREF_OF[asset.code]}
                  tier={TIER_OF[asset.code]?.(asset.balance)?.tier ?? null}
                />
              ))}
            </div>
            <Link
              href="/portfolio"
              className="tap mt-3 flex items-center justify-center text-[14px] font-semibold text-gold"
            >
              See full portfolio
            </Link>
          </>
        )
      ) : pending ? (
        <Skeleton className="mt-4 h-[260px] rounded-[18px]" />
      ) : activity.length === 0 ? (
        <p className="surface mt-4 p-6 text-center text-[14.5px] text-muted">
          Payments and collections will appear here.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="label mb-1.5 px-1">{g.label}</p>
              <div className="surface divide-y divide-hairline px-4">
                {g.items.map((p) => (
                  <PaymentRow key={p.id} payment={p} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
