"use client";

import { cn } from "@/lib/utils";

interface SegmentedProps<T extends string> {
  options: { value: T; label: string; badge?: string | number }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Segmented control. Two or three views swap in place instead of being
 * stacked down the page, which is what keeps a screen to one scroll.
 */
export function Segmented<T extends string>({ options, value, onChange, className }: SegmentedProps<T>) {
  return (
    <div className={cn("segmented", className)} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            data-active={active}
            onClick={() => onChange(o.value)}
            className="segmented-item inline-flex items-center justify-center gap-1.5"
          >
            {o.label}
            {o.badge != null && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] font-bold leading-[17px]",
                  active ? "bg-gold text-gold-ink" : "bg-elevated text-muted-2",
                )}
              >
                {o.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
