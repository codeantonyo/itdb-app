"use client";

import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-semibold tracking-tight transition-[opacity,background-color] duration-300 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary: "cta-primary",
        outline: "border border-hairline-gold bg-transparent text-gold",
        secondary: "bg-elevated text-primary",
        ghost: "bg-transparent text-primary",
        danger: "bg-danger-soft text-danger",
      },
      size: {
        sm: "h-11 rounded-xl px-4 text-[14px]",
        md: "h-12 rounded-xl px-5 text-[15px]",
        lg: "h-[54px] w-full rounded-2xl px-6 text-[16px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
