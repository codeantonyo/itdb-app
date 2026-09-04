"use client";

import { ExternalLink, Globe, TrendingDown, TrendingUp } from "lucide-react";
import { AssetIcon } from "@/components/shared/asset-icon";
import { ExactFigure } from "@/components/shared/exact-figure";
import { Skeleton } from "@/components/ui/skeleton";
import type { PortfolioAsset } from "@/lib/client/portfolio";
import { formatAmount, formatCurrency, formatExactAmount, formatExactCurrency, formatPercent, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

interface TokenHeaderProps {
  code: string;
  role: string;
  asset: PortfolioAsset | undefined;
  marketUrl: string;
  loading: boolean;
  tierLabel?: string | null;
}

/**
 * Asset header: logo, name and home domain resolved live from the
 * issuer's stellar.toml, DEX price with a change chip, the member's
 * holding and its value, and the LOBSTR trade button.
 */
export function TokenHeader({ code, role, asset, marketUrl, loading, tierLabel }: TokenHeaderProps) {
  const price = asset?.priceUsd ?? null;
  const change = asset?.change24h ?? null;
  const up = (change ?? 0) >= 0;
  const pending = loading && !asset;

  return (
    <section className="hero guilloche p-5">
      <div className="flex items-center gap-3.5">
        {pending ? <Skeleton className="size-[68px] rounded-full opacity-40" /> : <AssetIcon symbol={code} image={asset?.image} size="xl" />}
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-muted">{role}</p>
          <h2 className="font-display truncate text-[24px] font-semibold leading-tight text-primary">{asset?.name ?? code}</h2>
          {asset?.domain ? (
            <a href={`https://${asset.domain}`} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-[13.5px] text-data">
              <Globe className="size-3.5" />
              {asset.domain}
            </a>
          ) : pending ? (
            <Skeleton className="mt-2 h-4 w-28 opacity-40" />
          ) : null}
        </div>
        {tierLabel && (
          <span className="shrink-0 rounded-full bg-gold px-3 py-1 text-[12px] font-bold uppercase tracking-wide text-gold-ink">{tierLabel}</span>
        )}
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-[12.5px] font-medium text-muted">Price</p>
          {pending ? (
            <Skeleton className="mt-1.5 h-8 w-28 opacity-40" />
          ) : price !== null ? (
            <p className="font-display mt-0.5 text-[30px] font-semibold leading-none text-primary">{formatPrice(price)}</p>
          ) : (
            <p className="mt-1 text-[15px] text-muted">{asset && !asset.resolved ? "Unavailable — network busy" : "No market yet"}</p>
          )}
        </div>
        {change !== null && (
          <span className={cn("tnum inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold", up ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
            {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
            {formatPercent(change)}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-elevated px-3.5 py-3">
          <p className="text-[12px] text-muted">You hold</p>
          {pending ? (
            <Skeleton className="mt-1.5 h-6 w-20 opacity-40" />
          ) : (
            <ExactFigure
              compact={`${formatAmount(asset?.balance ?? 0, 2)} ${code}`}
              exact={`${formatExactAmount(asset?.balance ?? 0, 7)} ${code}`}
              className="mt-0.5 block text-[17px] font-semibold text-primary"
              exactClassName="text-[13px]"
            />
          )}
        </div>
        <div className="rounded-2xl bg-elevated px-3.5 py-3">
          <p className="text-[12px] text-muted">Value</p>
          {pending ? (
            <Skeleton className="mt-1.5 h-6 w-20 opacity-40" />
          ) : (
            <ExactFigure
              compact={price !== null ? formatCurrency(asset?.valueUsd ?? 0) : "—"}
              exact={price !== null ? formatExactCurrency(asset?.valueUsd ?? 0) : "—"}
              className="mt-0.5 block text-[17px] font-semibold text-primary"
              exactClassName="text-[13px]"
            />
          )}
        </div>
      </div>

      <a href={marketUrl} target="_blank" rel="noopener noreferrer" className="cta-primary mt-4 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-[15.5px] font-semibold">
        Trade {code} on LOBSTR
        <ExternalLink className="size-4" />
      </a>
    </section>
  );
}
