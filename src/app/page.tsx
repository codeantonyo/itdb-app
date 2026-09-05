"use client";

import Link from "next/link";
import { ArrowLeftRight, ChevronRight, CreditCard, Download, ExternalLink, Gift, Settings, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { ItdbWordmark } from "@/components/brand/logo";
import { AssetIcon } from "@/components/shared/asset-icon";
import { ExactFigure } from "@/components/shared/exact-figure";
import { NetworkNotice } from "@/components/shared/network-notice";
import { SectionHeader } from "@/components/shared/section-header";
import { PaymentRow } from "@/components/shared/statement-row";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/client/auth";
import { isDustPayment, usePortfolio, type PortfolioAsset } from "@/lib/client/portfolio";
import { useWalletLedger } from "@/lib/client/wallet-ledger";
import { formatAmount, formatCurrency, formatExactAmount, formatExactCurrency, formatPercent, formatPrice } from "@/lib/format";
import { ITDB_TOKEN, itdbTierFor, itdboneTierFor, marketUrl, qrsTierFor } from "@/lib/itdb/config";
import { cn } from "@/lib/utils";

const TOKEN_PAGES: Record<string, { href: string; role: string; tier: (b: number) => { tier: number } | null }> = {
  ITDB: { href: "/itdb", role: "Reserve token", tier: itdbTierFor },
  ITDBONE: { href: "/itdbone", role: "Bank stablecoin", tier: itdboneTierFor },
  QRS: { href: "/qrs", role: "Gold-referenced", tier: qrsTierFor },
};

function QuickAction({ icon: Icon, label, href, external }: { icon: LucideIcon; label: string; href: string; external?: boolean }) {
  const inner = (
    <>
      <span className="card flex size-[54px] items-center justify-center rounded-full text-gold">
        <Icon className="size-[22px]" strokeWidth={2} />
      </span>
      <span className="text-[12.5px] font-semibold text-muted">{label}</span>
    </>
  );
  const cls = "flex flex-col items-center gap-2";
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

function AssetRow({ asset }: { asset: PortfolioAsset }) {
  const page = TOKEN_PAGES[asset.code];
  const tier = page?.tier(asset.balance) ?? null;
  const up = (asset.change24h ?? 0) >= 0;
  const inner = (
    <div className="flex items-center gap-3 py-3">
      <AssetIcon symbol={asset.code} image={asset.image} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-primary">{asset.name}</p>
        <p className="tnum flex items-center gap-1.5 truncate text-[13px] text-muted">
          {tier && <span className="shrink-0 rounded-md bg-gold-soft px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide text-gold">Tier {tier.tier}</span>}
          {asset.priceUsd !== null ? (
            <>
              {formatPrice(asset.priceUsd)}
              {asset.change24h !== null && <span className={cn("ml-1.5 font-semibold", up ? "text-success" : "text-danger")}>{formatPercent(asset.change24h)}</span>}
            </>
          ) : asset.resolved ? (
            "No market yet"
          ) : (
            "Price unavailable"
          )}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="tnum text-[15px] font-semibold text-primary">
          {formatAmount(asset.balance, asset.isNative ? 2 : 0)} {asset.code}
        </p>
        <p className="tnum text-[13px] text-muted">{asset.priceUsd !== null ? formatCurrency(asset.valueUsd) : "—"}</p>
      </div>
      {page && <ChevronRight className="size-4 shrink-0 text-muted-2" />}
    </div>
  );
  return page ? (
    <Link href={page.href} className="block active:opacity-70">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export default function HomePage() {
  const { session } = useAuth();
  const portfolio = usePortfolio();
  const ledger = useWalletLedger(!!session);

  const availableUsd = Math.max(portfolio.totalUsd - ledger.fromAccountUsd, 0);
  const availableXlm = portfolio.xlmUsd > 0 ? availableUsd / portfolio.xlmUsd : 0;
  const positive = portfolio.change24hPercent >= -0.005;
  const movedToCard = ledger.fromAccountUsd > 0.005 ? ledger.fromAccountUsd : 0;
  const deposited = ledger.fromAccountUsd < -0.005 ? -ledger.fromAccountUsd : 0;

  const firstName = session?.name.split(" ")[0] ?? "Member";
  const activity = portfolio.payments.filter((p) => !isDustPayment(p, portfolio.prices)).slice(0, 6);
  const showUnavailable = portfolio.balancesUnknown || (!!portfolio.error && !portfolio.loading);
  const pendingFigures = portfolio.loading && portfolio.assets.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between pt-[calc(18px+var(--safe-top))]">
        <div>
          <ItdbWordmark className="text-primary" />
        </div>
        <Link href="/settings" aria-label="Settings" className="tap card flex items-center justify-center rounded-full text-primary">
          <Settings className="size-5" strokeWidth={1.8} />
        </Link>
      </header>

      <p className="font-display -mt-2 text-[22px] text-primary">Good day, {firstName}.</p>

      {/* ---------------- Balance hero ---------------- */}
      <section className="hero guilloche p-6">
        <p className="text-[13px] font-medium text-muted">Available balance</p>
        {pendingFigures ? (
          <Skeleton className="mt-3 h-11 w-52 opacity-30" />
        ) : showUnavailable && portfolio.assets.every((a) => a.balance === 0) ? (
          <p className="font-display mt-2 text-[26px] text-muted">Unavailable</p>
        ) : (
          <>
            <ExactFigure
              compact={formatCurrency(availableUsd)}
              exact={formatExactCurrency(availableUsd)}
              className="font-display mt-1 block text-[42px] font-semibold leading-none tracking-tight text-primary"
              exactClassName="text-[28px]"
            />
            <ExactFigure compact={`≈ ${formatAmount(availableXlm, 2)} XLM`} exact={`≈ ${formatExactAmount(availableXlm, 7)} XLM`} className="mt-2 block text-[14px] text-muted" />
          </>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className={cn("tnum inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold", positive ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
            {positive ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
            {formatPercent(Math.abs(portfolio.change24hPercent) < 0.005 ? 0 : portfolio.change24hPercent)} today
          </span>
          {deposited > 0 && <span className="tnum rounded-full bg-elevated px-2.5 py-1 text-[12.5px] text-muted">+{formatCurrency(deposited)} collected</span>}
          {movedToCard > 0 && <span className="tnum rounded-full bg-elevated px-2.5 py-1 text-[12.5px] text-muted">{formatCurrency(movedToCard)} on card</span>}
        </div>
      </section>

      {/* ---------------- Quick actions ---------------- */}
      <div className="grid grid-cols-4 gap-2">
        <QuickAction icon={ArrowLeftRight} label="Move" href="/card" />
        <QuickAction icon={Download} label="Collect" href="/itdbone" />
        <QuickAction icon={ExternalLink} label="Buy" href={marketUrl(ITDB_TOKEN)} external />
        <QuickAction icon={CreditCard} label="Card" href="/card" />
      </div>

      {showUnavailable && <NetworkNotice message={portfolio.error} onRetry={portfolio.refresh} />}

      {/* ---------------- Airdrop ---------------- */}
      <Link href="/airdrop" className="card flex items-center gap-3.5 p-4 active:opacity-80">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gold-soft text-gold">
          <Gift className="size-6" strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15.5px] font-semibold text-primary">Founding Airdrop</span>
          <span className="block text-[13px] leading-snug text-muted">
            For members holding ITDB, ITDBONE and QRS
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-2" />
      </Link>

      {/* ---------------- Assets ---------------- */}
      <section className="flex flex-col gap-3">
        <SectionHeader title="Your assets" note={`${portfolio.walletCount} wallet${portfolio.walletCount === 1 ? "" : "s"}`} />
        {pendingFigures ? (
          <Skeleton className="h-[240px] rounded-[20px]" />
        ) : (
          <div className="card divide-y divide-hairline px-4">
            {[...portfolio.assets.filter((a) => !a.isNative), ...portfolio.assets.filter((a) => a.isNative)].map((asset) => (
              <AssetRow key={asset.id} asset={asset} />
            ))}
          </div>
        )}
      </section>

      {/* ---------------- Activity ---------------- */}
      <section className="flex flex-col gap-3">
        <SectionHeader title="Recent activity" />
        {portfolio.loading && activity.length === 0 ? (
          <Skeleton className="h-[140px] rounded-[20px]" />
        ) : activity.length === 0 ? (
          <div className="card p-5 text-center text-[14.5px] text-muted">Payments and collections will appear here.</div>
        ) : (
          <div className="card divide-y divide-hairline px-4">
            {activity.map((payment) => (
              <PaymentRow key={payment.id} payment={payment} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
