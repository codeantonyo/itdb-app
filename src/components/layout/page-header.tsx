import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, subtitle, trailing, className }: PageHeaderProps) {
  return (
    <header className={cn("flex items-center justify-between gap-4 pb-5 pt-[calc(20px+var(--safe-top))]", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="font-display text-[26px] font-semibold leading-tight text-primary">{title}</h1>
        {subtitle && <p className="mt-1 text-[14.5px] leading-snug text-muted">{subtitle}</p>}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </header>
  );
}
