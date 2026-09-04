"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface AssetIconProps {
  symbol: string;
  image?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeClasses = {
  sm: "size-8 text-[10px]",
  md: "size-11 text-[11px]",
  lg: "size-14 text-[13px]",
  xl: "size-[68px] text-[15px]",
};

/** Circular asset icon: issuer artwork when published (SEP-1), a monogram otherwise. */
export function AssetIcon({ symbol, image, size = "md", className }: AssetIconProps) {
  const [failed, setFailed] = useState(false);
  const box = sizeClasses[size].split(" ")[0];
  if (image && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={symbol}
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-full border border-hairline-gold bg-elevated object-cover", box, className)}
      />
    );
  }
  return (
    <span
      className={cn("font-display flex shrink-0 items-center justify-center rounded-full border border-hairline-gold font-semibold text-gold-light", sizeClasses[size], className)}
      style={{ background: "linear-gradient(160deg, #123a7a, #06162f)" }}
      aria-hidden
    >
      {symbol.slice(0, 4)}
    </span>
  );
}
