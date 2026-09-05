"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, Gift, Home, PieChart, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Five tabs by job, not by asset.
 *
 * The three tokens used to have a tab each, which is not how a bank is
 * organised — it forced members to know which token holds which feature.
 * They now live behind Portfolio, and everything collectable (both yield
 * programmes and the airdrop) lives behind Rewards.
 */
const TABS: { href: string; match: (p: string) => boolean; label: string; icon: LucideIcon }[] = [
  { href: "/", match: (p) => p === "/", label: "Home", icon: Home },
  {
    href: "/portfolio",
    match: (p) => p.startsWith("/portfolio") || p === "/itdb" || p === "/itdbone" || p === "/qrs",
    label: "Portfolio",
    icon: PieChart,
  },
  { href: "/rewards", match: (p) => p.startsWith("/rewards") || p.startsWith("/airdrop"), label: "Rewards", icon: Gift },
  { href: "/cards", match: (p) => p.startsWith("/cards"), label: "Cards", icon: CreditCard },
  { href: "/profile", match: (p) => p.startsWith("/profile"), label: "Profile", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center">
      <div className="bar w-full max-w-[460px] border-t border-hairline pb-[var(--safe-bottom)]">
        <div className="flex h-[58px] items-stretch">
          {TABS.map((t) => {
            const active = t.match(pathname);
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className="tap flex flex-1 flex-col items-center justify-center gap-[3px]"
              >
                <Icon
                  className={cn("size-[22px] transition-colors duration-200", active ? "text-gold" : "text-muted-2")}
                  strokeWidth={active ? 2.3 : 1.8}
                />
                <span
                  className={cn(
                    "text-[10.5px] transition-colors duration-200",
                    active ? "font-semibold text-gold" : "font-medium text-muted-2",
                  )}
                >
                  {t.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
