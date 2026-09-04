"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  className?: string;
}

/** Six boxes, auto-advance, paste-friendly, numeric keyboard on mobile. */
export function OtpInput({ value, onChange, length = 6, className }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const setDigit = (index: number, digit: string) => {
    const chars = value.padEnd(length, " ").split("");
    chars[index] = digit || " ";
    onChange(chars.join("").trimEnd().replace(/\s/g, ""));
  };

  return (
    <div className={cn("flex justify-between gap-2", className)}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={length}
          value={value[i] ?? ""}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "");
            if (digits.length > 1) {
              onChange(digits.slice(0, length));
              refs.current[Math.min(digits.length, length) - 1]?.focus();
              return;
            }
            setDigit(i, digits);
            if (digits && i < length - 1) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !value[i] && i > 0) refs.current[i - 1]?.focus();
          }}
          onFocus={(e) => e.target.select()}
          className="tnum h-[58px] w-full rounded-xl border border-hairline bg-elevated text-center text-[22px] font-bold text-primary outline-none transition-colors focus:border-gold"
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
}
