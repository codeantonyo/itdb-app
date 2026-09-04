import { cn } from "@/lib/utils";

/**
 * The ITDB mark: a gold pillar standing before a wireframe globe.
 * Stroke-based so it engraves cleanly at any size; the pillar takes
 * `gold` and the globe takes `currentColor`.
 */
export function ItdbMark({
  className,
  gold = "#d4a017",
}: {
  className?: string;
  gold?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      {/* Wireframe globe */}
      <g stroke="currentColor" strokeWidth="1.1" opacity="0.85">
        <circle cx="32" cy="32" r="24" />
        <ellipse cx="32" cy="32" rx="10" ry="24" />
        <ellipse cx="32" cy="32" rx="18.5" ry="24" />
        <line x1="8" y1="32" x2="56" y2="32" />
        <path d="M11.5 20.5 Q32 14 52.5 20.5" />
        <path d="M11.5 43.5 Q32 50 52.5 43.5" />
      </g>
      {/* Pillar */}
      <g fill={gold}>
        <rect x="24" y="14" width="16" height="3" rx="0.6" />
        <rect x="26" y="17" width="12" height="2" rx="0.5" />
        <rect x="27.5" y="19" width="9" height="26" rx="0.5" />
        <rect x="26" y="45" width="12" height="2" rx="0.5" />
        <rect x="24" y="47" width="16" height="3.5" rx="0.6" />
      </g>
      {/* Fluting */}
      <g stroke="#06162f" strokeWidth="0.7" opacity="0.35">
        <line x1="30" y1="20" x2="30" y2="44" />
        <line x1="32" y1="20" x2="32" y2="44" />
        <line x1="34" y1="20" x2="34" y2="44" />
      </g>
    </svg>
  );
}

export function ItdbWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <ItdbMark className="size-8" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[17px] font-semibold tracking-[0.14em]">ITDB</span>
        <span className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-muted-2">
          Tokenized Development Bank
        </span>
      </span>
    </span>
  );
}
