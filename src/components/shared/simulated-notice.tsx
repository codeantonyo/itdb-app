import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** The plain-language disclosure under every reserve figure (brief §8.3). */
export function SimulatedNotice({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl bg-elevated px-3.5 py-3", className)}>
      <Info className="mt-0.5 size-4 shrink-0 text-data" strokeWidth={2} />
      <p className="text-[13px] leading-relaxed text-muted">
        {children ?? (
          <>
            <span className="font-semibold text-primary">Simulated reference position.</span> These figures are held against
            your account and priced at live rates. No metal, currency or securities are allocated off-chain on your behalf.
          </>
        )}
      </p>
    </div>
  );
}

export function SourceBadge({ source }: { source: "live" | "reference" }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide",
        source === "live" ? "bg-success-soft text-success" : "bg-elevated text-muted-2",
      )}
    >
      {source === "live" ? "Live" : "Ref."}
    </span>
  );
}
