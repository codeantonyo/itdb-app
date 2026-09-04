"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  note?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

export function SectionHeader({ title, note, actionLabel, actionHref, onAction, className }: SectionHeaderProps) {
  const cls = "tap flex items-center gap-0.5 text-[14px] font-semibold text-gold";
  const action =
    actionLabel &&
    (actionHref ? (
      <Link href={actionHref} className={cls}>
        {actionLabel}
        <ChevronRight className="size-4" />
      </Link>
    ) : (
      <button onClick={onAction} className={cls}>
        {actionLabel}
        <ChevronRight className="size-4" />
      </button>
    ));
  return (
    <div className={cn("flex items-center justify-between px-1", className)}>
      <h2 className="text-[17px] font-semibold text-primary">{title}</h2>
      {note && !action && <span className="text-[13px] text-muted-2">{note}</span>}
      {action}
    </div>
  );
}
