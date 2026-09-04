"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coins, CreditCard, Home, Landmark, Medal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/itdb", label: "ITDB", icon: Landmark },
  { href: "/itdbone", label: "ITDBONE", icon: Coins },
  { href: "/qrs", label: "QRS", icon: Medal },
  { href: "/card", label: "Card", icon: CreditCard },
];

/** Standard five-tab bottom bar. Active tab in gold. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center">
      <div className="tab-bar w-full max-w-[460px] pb-[var(--safe-bottom)]">
        <div className="flex h-[64px] items-stretch">
          {TABS.map((t) => {
            const active = pathname === t.href;
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className="tap flex flex-1 flex-col items-center justify-center gap-1"
                aria-current={active ? "page" : undefined}
              >
                <Icon
                  className={cn("size-[23px] transition-colors duration-300", active ? "text-gold" : "text-muted-2")}
                  strokeWidth={active ? 2.2 : 1.8}
                />
                <span className={cn("text-[11px] font-semibold transition-colors duration-300", active ? "text-gold" : "text-muted-2")}>
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
