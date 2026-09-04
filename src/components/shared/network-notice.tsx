"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/** Unknown is never rendered as zero (§6.4) — it is rendered as this, with a retry. */
export function NetworkNotice({ message, onRetry, className }: { message?: string | null; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3.5", className)} role="status">
      <CloudOff className="size-5 shrink-0 text-danger" strokeWidth={2} />
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold text-primary">Figures unavailable right now</p>
        <p className="text-[13px] leading-snug text-muted">
          {message ?? "The Stellar network is busy. Your holdings are safe — nothing here is zero, it just can't be read yet."}
        </p>
      </div>
      {onRetry && (
        <button onClick={onRetry} aria-label="Retry" className="tap flex items-center justify-center rounded-full bg-elevated text-primary">
          <RefreshCw className="size-4" />
        </button>
      )}
    </div>
  );
}
