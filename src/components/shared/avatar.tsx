import { cn } from "@/lib/utils";

/** Up to two initials from a display name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full border border-hairline-gold text-[14px] font-semibold text-gold",
        className,
      )}
      style={{ background: "var(--m-gold-soft)" }}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}
