"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

interface AreaChartProps {
  /** Raw series, oldest first. Fewer than two points renders nothing. */
  points: number[];
  className?: string;
  height?: number;
  /** Stroke and gradient colour; defaults to the gold accent */
  color?: string;
}

/**
 * A compact filled area chart for the balance panel.
 *
 * Pure SVG on a 0–100 viewBox with `preserveAspectRatio="none"`, so it
 * stretches to any width without layout maths or a charting library.
 */
export function AreaChart({ points, className, height = 64, color = "var(--m-gold)" }: AreaChartProps) {
  const gradientId = useId();
  if (points.length < 2) return <div style={{ height }} className={className} aria-hidden />;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = 100 / (points.length - 1);

  // Flat series sit mid-height rather than pinned to an edge.
  const y = (v: number) => (max === min ? 50 : 100 - ((v - min) / span) * 92 - 4);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${y(p).toFixed(2)}`).join(" ");
  const area = `${line} L100,100 L0,100 Z`;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ height }}
      className={cn("w-full", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
