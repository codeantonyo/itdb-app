"use client";

import { ArrowDownLeft, ArrowUpRight, Coins, CreditCard, Gift, Medal, Sparkles, type LucideIcon } from "lucide-react";
import { shortAddress } from "@/lib/client/auth";
import { formatTokenAmount } from "@/lib/format";
import type { AccountPayment } from "@/lib/stellar/types";
import { cn } from "@/lib/utils";

const LEDGER_ICONS: Record<string, LucideIcon> = {
  ledger_itdbone: Coins,
  ledger_qrs: Medal,
  ledger_airdrop: Gift,
  ledger_transfer: CreditCard,
};

function relativeDate(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const diffDays = Math.floor((today.setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** A transaction row: icon, title, note, signed amount. */
export function PaymentRow({ payment }: { payment: AccountPayment }) {
  const received = payment.direction === "received";
  const isCreate = payment.kind === "create_account";
  const isLedger = payment.kind.startsWith("ledger_");
  const Icon = isCreate ? Sparkles : isLedger ? (LEDGER_ICONS[payment.kind] ?? CreditCard) : received ? ArrowDownLeft : ArrowUpRight;

  const title = isLedger
    ? received
      ? `From ${payment.counterparty}`
      : `To ${payment.counterparty}`
    : isCreate
      ? "Account activated"
      : received
        ? payment.counterparty
          ? `Received from ${shortAddress(payment.counterparty)}`
          : "Received"
        : payment.counterparty
          ? `Sent to ${shortAddress(payment.counterparty)}`
          : "Sent";

  return (
    <div className="flex items-center gap-3 py-3">
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full", received ? "bg-success-soft text-success" : "bg-elevated text-muted")}>
        <Icon className="size-[19px]" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-primary">{title}</p>
        <p className="truncate text-[13px] text-muted">
          {relativeDate(payment.at)} · {isLedger ? "ITDB" : "Stellar network"}
        </p>
      </div>
      <p className={cn("tnum shrink-0 text-[15px] font-semibold", received ? "text-success" : "text-primary")}>
        {received ? "+" : "−"}
        {formatTokenAmount(payment.amount)} {payment.code}
      </p>
    </div>
  );
}
