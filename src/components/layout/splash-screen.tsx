"use client";

import { ItdbMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/**
 * App-open splash: the mark and wordmark on a navy ground. `leaving`
 * fades it with a CSS transition; the shell unmounts it on a timer.
 */
export function SplashScreen({ leaving = false }: { leaving?: boolean }) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center text-[#f4efe4] transition-opacity duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]",
        leaving && "pointer-events-none opacity-0",
      )}
      style={{ background: "radial-gradient(120% 80% at 50% 0%, #123a7a 0%, #06162f 65%)" }}
      aria-hidden={leaving}
    >
      <div className="flex size-24 items-center justify-center rounded-[28px] border border-[rgba(212,160,23,0.5)] bg-white/5">
        <ItdbMark className="size-14" />
      </div>
      <p className="font-display mt-6 text-[24px] font-semibold tracking-[0.22em]">ITDB</p>
      <p className="mt-1.5 text-[12px] text-[rgba(244,239,228,0.55)]">Banking on Stellar</p>
    </div>
  );
}
