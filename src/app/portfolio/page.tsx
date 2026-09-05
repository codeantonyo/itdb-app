"use client";

import { useMemo, useState } from "react";
import { AppBar } from "@/components/layout/app-bar";
import { AssetRow } from "@/components/shared/asset-row";
import { ExactFigure } from "@/components/shared/exact-figure";
import { NetworkNotice } from "@/components/shared/network-notice";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortfolio } from "@/lib/client/portfolio";
import { formatCurrency, formatExactCurrency, formatPercent } from "@/lib/format";
import { itdbTierFor, itdboneTierFor, qrsTierFor } from "@/lib/itdb/config";
import { cn } from "@/lib/utils";

const TIER_OF: Record<string, (b: number) => { tier: number } | null> = {
  ITDB: itdbTierFor,
  ITDBONE: itdboneTierFor,
  QRS: qrsTierFor,
};
const HREF_OF: Record<string, string> = { ITDB: "/itdb", ITDBONE: "/itdbone", QRS: "/qrs" };

export default function PortfolioPage() {
  const portfolio = usePortfolio();
  const [view, setView] = useState<"all" | "reserve">("all");

  const pending = portfolio.loading && portfolio.assets.length === 0;
  const unavailable = portfolio.balancesUnknown || (!!portfolio.error && !portfolio.loading);
  const total = portfolio.totalUsd;
  const positive = portfolio.change24hPercent >= -0.005;

  const rows = useMemo(() => {
    const sorted = [...portfolio.assets].sort((a, b) => b.valueUsd - a.valueUsd);
    return view === "reserve" ? sorted.filter((a) => HREF_OF[a.code]) : sorted;
  }, [portfolio.assets, view]);

  const heldCount = portfolio.assets.filter((a) => a.balance > 0).length;

  return (
    <div className="flex flex-col">
      <AppBar title="Portfolio" subtitle={`${heldCount} asset${heldCount === 1 ? "" : "s"} held`} />

      {/* ---------------- Total ---------------- */}
      <section className="surface mt-1 p-5">
        <p className="text-[13px] font-medium text-muted">Value held on chain</p>
        {pending ? (
          <Skeleton className="mt-2 h-9 w-44" />
        ) : (
          <>
            <ExactFigure
              compact={formatCurrency(total)}
              exact={formatExactCurrency(total)}
              className="font-display mt-1 block text-[34px] font-semibold leading-none text-primary"
              exactClassName="text-[24px]"
            />
            <div className="mt-2.5 flex items-center gap-2 text-[13.5px]">
              <span className={cn("tnum font-semibold", positive ? "text-success" : "text-danger")}>
                {formatPercent(Math.abs(portfolio.change24hPercent) < 0.005 ? 0 : portfolio.change24hPercent)}
              </span>
              <span className="text-muted">today</span>
              <span className="text-muted-2">·</span>
              <span className="text-muted">
                {portfolio.walletCount} wallet{portfolio.walletCount === 1 ? "" : "s"}
              </span>
            </div>
          </>
        )}
      </section>

      {unavailable && <NetworkNotice className="mt-4" message={portfolio.error} onRetry={portfolio.refresh} />}

      <Segmented
        className="mt-5"
        value={view}
        onChange={setView}
        options={[
          { value: "all", label: "All assets" },
          { value: "reserve", label: "ITDB reserve" },
        ]}
      />

      {pending ? (
        <Skeleton className="mt-4 h-[280px] rounded-[18px]" />
      ) : rows.length === 0 ? (
        <p className="surface mt-4 p-6 text-center text-[14.5px] text-muted">Nothing to show here yet.</p>
      ) : (
        <div className="surface mt-4 divide-y divide-hairline">
          {rows.map((asset) => (
            <AssetRow
              key={asset.id}
              asset={asset}
              href={HREF_OF[asset.code]}
              tier={TIER_OF[asset.code]?.(asset.balance)?.tier ?? null}
              share={total > 0 ? asset.valueUsd / total : 0}
            />
          ))}
        </div>
      )}

      <p className="mt-3 px-1 text-[12.5px] leading-relaxed text-muted-2">
        Balances read live from every wallet linked to your account, so this is what you hold on chain. Your Home balance
        also counts yield you have collected into the account. The bar under each asset is its share of the total.
      </p>
    </div>
  );
}
