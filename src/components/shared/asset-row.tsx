"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AssetIcon } from "@/components/shared/asset-icon";
import type { PortfolioAsset } from "@/lib/client/portfolio";
import { formatAmount, formatCurrency, formatPercent, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface AssetRowProps {
  asset: PortfolioAsset;
  href?: string;
  /** Tier number, when the asset has a tier ladder */
  tier?: number | null;
  /** Share of the total portfolio, 0–1. Renders an allocation bar. */
  share?: number;
}

/**
 * One holding in a list: seal, name, tier, then units over value.
 * Value leads on the right because that is the question members are
 * actually asking.
 */
export function AssetRow({ asset, href, tier, share }: AssetRowProps) {
  const up = (asset.change24h ?? 0) >= 0;

  const body = (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <AssetIcon symbol={asset.code} image={asset.image} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[15.5px] font-semibold text-primary">{asset.name}</p>
          {tier != null && (
            <span className="shrink-0 rounded-md bg-gold-soft px-1.5 py-px text-[10.5px] font-bold text-gold">
              T{tier}
            </span>
          )}
        </div>
        <p className="tnum truncate text-[13px] text-muted">
          {asset.priceUsd !== null ? (
            <>
              {formatPrice(asset.priceUsd)}
              {asset.change24h !== null && (
                <span className={cn("ml-1.5 font-medium", up ? "text-success" : "text-danger")}>
                  {formatPercent(asset.change24h)}
                </span>
              )}
            </>
          ) : asset.resolved ? (
            "No market yet"
          ) : (
            "Price unavailable"
          )}
        </p>
        {share != null && share > 0 && (
          <div className="track mt-2 h-1">
            <div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(share * 100, 100)}%` }} />
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="tnum text-[15.5px] font-semibold text-primary">
          {asset.priceUsd !== null ? formatCurrency(asset.valueUsd) : "—"}
        </p>
        <p className="tnum text-[13px] text-muted">
          {formatAmount(asset.balance, asset.isNative ? 2 : 0)} {asset.code}
        </p>
      </div>
      {href && <ChevronRight className="size-4 shrink-0 text-muted-2" />}
    </div>
  );

  return href ? (
    <Link href={href} className="block transition-opacity active:opacity-70">
      {body}
    </Link>
  ) : (
    body
  );
}
