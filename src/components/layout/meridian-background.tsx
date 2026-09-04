/** A still navy/parchment ground with a faint globe low in the corner. */
export function MeridianBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 60% at 50% -10%, var(--m-canvas-2) 0%, var(--m-canvas) 60%)" }}
      />
      <svg
        viewBox="0 0 400 400"
        className="globe-turn absolute -bottom-[220px] -right-[180px] size-[520px]"
        style={{ color: "var(--m-globe-ink)" }}
        fill="none"
        stroke="currentColor"
        strokeWidth="0.8"
      >
        <circle cx="200" cy="200" r="180" />
        <ellipse cx="200" cy="200" rx="60" ry="180" />
        <ellipse cx="200" cy="200" rx="120" ry="180" />
        <line x1="20" y1="200" x2="380" y2="200" />
        <path d="M32 120 Q200 80 368 120" />
        <path d="M32 280 Q200 320 368 280" />
      </svg>
    </div>
  );
}
