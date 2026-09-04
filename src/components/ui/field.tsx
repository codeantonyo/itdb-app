"use client";

import { useState } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  trailing?: React.ReactNode;
  className?: string;
}

/** A boxed form field with its label above. */
export function Field({ label, hint, trailing, className, ...props }: FieldProps) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[13.5px] font-medium text-muted">{label}</span>
      <div className="flex h-[54px] items-center gap-2 rounded-xl border border-hairline bg-elevated px-4 transition-colors focus-within:border-gold">
        <input {...props} className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-primary outline-none placeholder:text-muted-2" />
        {trailing}
      </div>
      {hint && <span className="mt-1.5 block text-[13px] leading-snug text-muted-2">{hint}</span>}
    </label>
  );
}

export function PasswordField({
  label,
  value,
  onChange,
  hint,
  autoComplete = "current-password",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field
      label={label}
      type={visible ? "text" : "password"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete={autoComplete}
      hint={hint}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="tap -mr-2 flex items-center justify-center text-muted-2"
        >
          {visible ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
        </button>
      }
    />
  );
}

/** A selectable option row: radio circle, label, note. */
export function ChoiceRow({
  selected,
  onSelect,
  label,
  note,
  disabled,
  trailing,
}: {
  selected: boolean;
  onSelect: () => void;
  label: React.ReactNode;
  note?: React.ReactNode;
  disabled?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      role="radio"
      aria-checked={selected}
      className={cn(
        "tap flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors duration-300",
        selected ? "border-gold bg-gold-soft" : "border-hairline bg-elevated/50",
        disabled && "opacity-45",
      )}
    >
      <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", selected ? "border-gold bg-gold" : "border-muted-2")}>
        {selected && <Check className="size-3 text-gold-ink" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-primary">{label}</span>
        {note && <span className="block text-[13px] text-muted">{note}</span>}
      </span>
      {trailing}
    </button>
  );
}
