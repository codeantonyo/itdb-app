import { cn } from "@/lib/utils";

interface LedgerLineProps {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  mark?: React.ReactNode;
  className?: string;
  valueClassName?: string;
  labelClassName?: string;
}

/** A key–value detail row: label left, figure right, hairline beneath. */
export function LedgerLine({ label, value, sub, mark, className, valueClassName, labelClassName }: LedgerLineProps) {
  return (
    <div className={cn("border-b border-hairline py-3 last:border-0", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn("min-w-0 text-[14.5px] text-muted", labelClassName)}>{label}</span>
        <span className="flex shrink-0 items-baseline gap-2">
          <span className={cn("tnum text-[15px] font-semibold text-primary", valueClassName)}>{value}</span>
          {mark}
        </span>
      </div>
      {sub && <p className="mt-0.5 text-[12.5px] text-muted-2">{sub}</p>}
    </div>
  );
}
