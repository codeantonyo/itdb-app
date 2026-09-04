"use client";

import { useState } from "react";
import { MastercardLogo, VisaLogo } from "@/components/card/network-logos";
import { LedgerLine } from "@/components/shared/ledger-line";
import { Button } from "@/components/ui/button";
import { ChoiceRow } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { CARD_STYLES, type CardNetwork, type CardStyle, type StoredCard } from "@/lib/client/cards";
import { CURRENCIES, DEFAULT_CURRENCY } from "@/lib/wallet/currencies";
import { VirtualCardVisual } from "./virtual-card";

interface OpenCardPanelProps {
  open: boolean;
  holder: string;
  onClose: () => void;
  onIssue: (
    style: CardStyle,
    name: string,
    network: CardNetwork,
    currency: string,
  ) => Promise<{ card: StoredCard | null; error?: string }>;
}

type Phase = "form" | "issuing" | "done";

const SWATCH: Record<CardStyle, string> = {
  "sovereign-navy": "linear-gradient(160deg,#0d2e66,#06162f)",
  "gold-leaf": "linear-gradient(160deg,#e2b93a,#8f6608)",
  parchment: "linear-gradient(160deg,#f8f3e8,#e2d7bf)",
  graphite: "linear-gradient(160deg,#2a2f38,#0d0f13)",
};

const previewCard = (style: CardStyle, name: string, network: CardNetwork): StoredCard => ({
  id: "preview",
  style,
  network,
  name,
  number: network === "mastercard" ? "5318200000000000" : "4527100000000000",
  expiry: "··/··",
  cvv: "···",
  frozen: false,
  frozenUntil: null,
  activatesAt: 0,
  readyNotified: true,
  createdAt: 0,
});

/** The card application form: network, finish, currency; then the strike; then the receipt. */
export function OpenCardPanel({ open, holder, onClose, onIssue }: OpenCardPanelProps) {
  const [phase, setPhase] = useState<Phase>("form");
  const [style, setStyle] = useState<CardStyle>("sovereign-navy");
  const [network, setNetwork] = useState<CardNetwork>("visa");
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [issued, setIssued] = useState<StoredCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const label = CARD_STYLES.find((s) => s.style === style)?.label ?? "ITDB Card";

  const issue = async () => {
    setPhase("issuing");
    setError(null);
    const [result] = await Promise.all([
      onIssue(style, label, network, currency),
      new Promise((r) => setTimeout(r, 1600)),
    ]);
    if (!result.card) {
      setError(result.error ?? "ITDB issues one card per account.");
      setPhase("form");
      return;
    }
    setIssued(result.card);
    setPhase("done");
  };

  const close = () => {
    onClose();
    setTimeout(() => {
      setPhase("form");
      setIssued(null);
      setError(null);
    }, 300);
  };

  return (
    <Panel
      open={open}
      title={phase === "done" ? "Receipt" : phase === "issuing" ? "Striking" : "Card application"}
      onClose={phase === "issuing" ? undefined : close}
    >
      {phase === "form" && (
        <div>
          <VirtualCardVisual card={previewCard(style, label, network)} holder={holder} interactive={false} />

          <p className="mb-2 mt-5 text-[13.5px] font-medium text-muted">Network</p>
          <div role="radiogroup" className="flex flex-col gap-2">
            <ChoiceRow selected={network === "visa"} onSelect={() => setNetwork("visa")} label="Visa" trailing={<VisaLogo className="text-primary" />} />
            <ChoiceRow selected={network === "mastercard"} onSelect={() => setNetwork("mastercard")} label="Mastercard" trailing={<MastercardLogo className="h-6" />} />
          </div>

          <p className="mb-2 mt-5 text-[13.5px] font-medium text-muted">Finish</p>
          <div role="radiogroup" className="flex flex-col gap-2">
            {CARD_STYLES.map((s) => (
              <ChoiceRow
                key={s.style}
                selected={style === s.style}
                onSelect={() => setStyle(s.style)}
                label={s.label}
                trailing={<span className="size-6 border border-hairline-gold" style={{ background: SWATCH[s.style] }} />}
              />
            ))}
          </div>

          <label className="mt-5 block">
            <span className="mb-1.5 block text-[13.5px] font-medium text-muted">Card currency</span>
            <div className="rounded-xl border border-hairline bg-elevated px-4 focus-within:border-gold">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="h-[54px] w-full bg-transparent text-[16px] text-primary outline-none"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
          </label>

          {error && <p className="mt-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[14px] text-danger">{error}</p>}

          <Button size="lg" className="mt-5" onClick={issue}>
            Issue {label} · {currency}
          </Button>
        </div>
      )}

      {phase === "issuing" && (
        <div className="py-10 text-center">
          <p className="font-display text-[20px] font-semibold text-primary">Striking your card</p>
          <p className="mt-1 text-[14px] text-muted">Registering it against your account…</p>
          <div className="mx-auto mt-6 h-1 w-24 overflow-hidden rounded-full bg-elevated"><div className="shimmer h-full w-full" /></div>
        </div>
      )}

      {phase === "done" && issued && (
        <div>
          <VirtualCardVisual card={issued} holder={holder} />
          <div className="mt-4 rounded-xl bg-elevated px-3.5">
            <LedgerLine label="Card" value={`${issued.name} ·· ${issued.number.slice(-4)}`} valueClassName="font-medium" />
            <LedgerLine label="Network" value={issued.network === "visa" ? "Visa" : "Mastercard"} valueClassName="font-medium" />
            <LedgerLine label="Held in" value={currency} valueClassName="font-medium" />
            <LedgerLine label="Status" value="Activating · 1–3 min" valueClassName="font-medium text-gold" />
          </div>
          <p className="mt-3 text-[13.5px] text-muted">Tap the card any time to flip it. Number, expiry and CVV are on the back.</p>
          <Button size="lg" className="mt-4" onClick={close}>
            Done
          </Button>
        </div>
      )}
    </Panel>
  );
}
