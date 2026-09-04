"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PanelProps {
  open: boolean;
  title: string;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * Bottom sheet — the standard mobile action surface. CSS transitions
 * only, with timer-driven show/unmount, so it can never be stranded on
 * screen by a stalled animation.
 */
export function Panel({ open, title, onClose, children, className }: PanelProps) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  // Render-phase adjustment: mount the moment it opens.
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    // Slide in on the next tick after mount; slide out then unmount.
    const t = setTimeout(() => setShown(open), open ? 20 : 0);
    const u = open ? null : setTimeout(() => setMounted(false), 350);
    return () => {
      clearTimeout(t);
      if (u) clearTimeout(u);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" aria-hidden={!open}>
      <div
        onClick={onClose}
        className={cn("absolute inset-0 bg-[#06162f]/65 transition-opacity duration-300", shown ? "opacity-100" : "opacity-0")}
      />
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className={cn(
          "sheet-surface relative w-full max-w-[460px] rounded-t-[26px] pb-[max(20px,var(--safe-bottom))] transition-transform duration-350 ease-[cubic-bezier(0.4,0,0.2,1)]",
          shown ? "translate-y-0" : "translate-y-full",
          className,
        )}
      >
        <div className="flex justify-center pt-3">
          <div className="h-1 w-10 rounded-full bg-muted-2/40" />
        </div>
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <h2 className="font-display text-[21px] font-semibold text-primary">{title}</h2>
          {onClose && (
            <button onClick={onClose} aria-label="Close" className="tap -mr-2 flex items-center justify-center rounded-full text-muted">
              <X className="size-5" />
            </button>
          )}
        </div>
        <div className="max-h-[78vh] overflow-y-auto overscroll-contain px-5 pb-2">{children}</div>
      </div>
    </div>
  );
}
