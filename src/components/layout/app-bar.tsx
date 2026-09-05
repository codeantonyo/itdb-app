"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import { cn } from "@/lib/utils";

interface AppBarProps {
  title: string;
  /** Small line under the title */
  subtitle?: string;
  /** Show a back chevron instead of the avatar */
  back?: boolean;
  /** Member name; renders the avatar linking to the profile */
  avatarFor?: string;
  right?: React.ReactNode;
  className?: string;
}

/**
 * The screen header: title on the left, one affordance on the right.
 * Sticky and translucent, so content scrolls beneath it.
 */
export function AppBar({ title, subtitle, back, avatarFor, right, className }: AppBarProps) {
  const router = useRouter();
  return (
    <header
      className={cn(
        "bar sticky top-0 z-30 -mx-5 flex items-center gap-3 px-5 pb-3 pt-[calc(14px+var(--safe-top))]",
        className,
      )}
    >
      {back && (
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="tap -ml-2.5 flex items-center justify-center text-primary"
        >
          <ChevronLeft className="size-6" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className={cn("truncate font-semibold text-primary", subtitle ? "text-[19px]" : "text-[22px]")}>{title}</h1>
        {subtitle && <p className="truncate text-[13px] text-muted">{subtitle}</p>}
      </div>
      {right}
      {avatarFor && !right && (
        <Link href="/profile" aria-label="Profile" className="tap flex items-center justify-center">
          <Avatar name={avatarFor} />
        </Link>
      )}
    </header>
  );
}
