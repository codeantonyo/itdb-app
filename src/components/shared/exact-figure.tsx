"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface ExactFigureProps {
  /** Compact rendering (4 significant digits) */
  compact: string;
  /** Every digit */
  exact: string;
  className?: string;
  exactClassName?: string;
}

/**
 * Tap-to-reveal exact figure. Compact numbers carry 4 significant
 * digits, but a member checking whether a credit landed needs every
 * digit — so any money figure of record is one tap from exact (§6.5).
 */
export function ExactFigure({ compact, exact, className, exactClassName }: ExactFigureProps) {
  const [showExact, setShowExact] = useState(false);
  const same = compact === exact;
  return (
    <button
      type="button"
      onClick={() => !same && setShowExact((v) => !v)}
      title={same ? undefined : showExact ? "Show rounded" : "Show every digit"}
      aria-label={same ? undefined : showExact ? "Show rounded figure" : "Show exact figure"}
      className={cn("tnum text-left active:opacity-70", same && "cursor-default", className)}
    >
      {showExact ? <span className={exactClassName}>{exact}</span> : compact}
    </button>
  );
}
