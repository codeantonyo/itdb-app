import type { CardNetwork } from "@/lib/client/cards";
import { cn } from "@/lib/utils";

/** Visa wordmark. */
export function VisaLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn("text-[18px] font-extrabold italic leading-none tracking-tight", className)}
      aria-label="Visa"
    >
      VISA
    </span>
  );
}

/** Mastercard interlocking circles. */
export function MastercardLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 38 24" className={cn("h-6", className)} aria-label="Mastercard">
      <circle cx="14" cy="12" r="10" fill="#EB001B" />
      <circle cx="24" cy="12" r="10" fill="#F79E1B" />
      <path d="M19 4.46a10 10 0 0 1 0 15.08 10 10 0 0 1 0-15.08z" fill="#FF5F00" />
    </svg>
  );
}

export function NetworkLogo({ network, className }: { network: CardNetwork; className?: string }) {
  if (network === "mastercard") return <MastercardLogo className={className} />;
  return <VisaLogo className={className} />;
}
