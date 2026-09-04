"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, Snowflake } from "lucide-react";
import { ItdbMark } from "@/components/brand/logo";
import { NetworkLogo } from "@/components/card/network-logos";
import { formatPan, type CardStyle, type StoredCard } from "@/lib/client/cards";
import { cn } from "@/lib/utils";

interface StyleConfig {
  card: string;
  bg: React.CSSProperties;
  text: string;
  subtext: string;
  gold: string;
  sheen: boolean;
}

const styleConfigs: Record<CardStyle, StyleConfig> = {
  "sovereign-navy": {
    card: "border border-[rgba(212,160,23,0.45)]",
    bg: {
      background:
        "radial-gradient(120% 90% at 100% 0%, rgba(212,160,23,0.18) 0%, transparent 55%), linear-gradient(160deg, #0d2e66 0%, #06162f 70%)",
    },
    text: "text-[#f4efe4]",
    subtext: "text-[rgba(244,239,228,0.6)]",
    gold: "#d4a017",
    sheen: true,
  },
  "gold-leaf": {
    card: "border border-[rgba(255,233,163,0.7)]",
    bg: {
      background:
        "linear-gradient(160deg, #e2b93a 0%, #c48f12 45%, #8f6608 100%)",
    },
    text: "text-[#06162f]",
    subtext: "text-[rgba(6,22,47,0.6)]",
    gold: "#06162f",
    sheen: true,
  },
  parchment: {
    card: "border border-[rgba(11,29,58,0.2)]",
    bg: {
      background:
        "linear-gradient(160deg, #f8f3e8 0%, #ebe3d0 60%, #e2d7bf 100%)",
    },
    text: "text-[#0b1d3a]",
    subtext: "text-[rgba(11,29,58,0.55)]",
    gold: "#9a7210",
    sheen: false,
  },
  graphite: {
    card: "border border-[rgba(255,255,255,0.12)]",
    bg: {
      background: "linear-gradient(160deg, #2a2f38 0%, #16191f 60%, #0d0f13 100%)",
    },
    text: "text-[#f4efe4]",
    subtext: "text-[rgba(244,239,228,0.55)]",
    gold: "#d4a017",
    sheen: true,
  },
};

interface VirtualCardProps {
  card: StoredCard;
  holder: string;
  interactive?: boolean;
  defaultFlipped?: boolean;
  activating?: boolean;
  className?: string;
}

/**
 * The ITDB card with a slow 3D flip. Front: mark, holder, network and
 * the last 4 digits. Back: number, expiry and CVV — masked until the
 * eye is tapped.
 */
export function VirtualCardVisual({
  card,
  holder,
  interactive = true,
  defaultFlipped = false,
  activating = false,
  className,
}: VirtualCardProps) {
  const [flipped, setFlipped] = useState(defaultFlipped);
  const [revealed, setRevealed] = useState(false);
  const config = styleConfigs[card.style];

  const flip = () => {
    setFlipped((f) => {
      if (f) setRevealed(false);
      return !f;
    });
  };

  const face =
    "absolute inset-0 overflow-hidden rounded-[10px] p-5 [backface-visibility:hidden] shadow-[0_18px_44px_rgba(2,6,15,0.4)]";

  return (
    <div
      className={cn("relative select-none [perspective:1200px]", className)}
      onClick={interactive ? flip : undefined}
      role={interactive ? "button" : undefined}
      aria-label={interactive ? "Flip card" : undefined}
    >
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
        className="relative aspect-[1.586] w-full [transform-style:preserve-3d]"
      >
        {/* FRONT */}
        <div
          className={cn(face, config.card, config.sheen && "card-sheen", "guilloche flex flex-col")}
          style={config.bg}
        >
          <div className="relative flex items-start justify-between">
            <span className={cn("flex items-center gap-2", config.text)}>
              <ItdbMark className="size-9" gold={config.gold} />
              <span className="font-display text-[15px] font-semibold tracking-[0.14em]">ITDB</span>
            </span>
            {interactive && (
              <span className={cn("text-[10px] uppercase tracking-[0.18em] opacity-60", config.subtext)}>
                Tap to flip
              </span>
            )}
          </div>

          <p className={cn("tnum relative mt-auto text-[20px] font-semibold tracking-[0.22em]", config.text)}>
            ••&nbsp;{card.number.slice(-4)}
          </p>

          <div className="relative mt-3 flex items-end justify-between">
            <p className={cn("text-[13px] font-semibold uppercase tracking-wider", config.text)}>{holder}</p>
            <NetworkLogo network={card.network} className={config.text} />
          </div>
        </div>

        {/* BACK */}
        <div
          className={cn(face, config.card, "flex flex-col [transform:rotateY(180deg)]")}
          style={config.bg}
        >
          <div className="flex items-start justify-between">
            <ItdbMark className={cn("size-7 opacity-70", config.text)} gold={config.gold} />
            <NetworkLogo network={card.network} className={cn("opacity-70", config.text)} />
          </div>

          <div className="mt-auto">
            <p className={cn("text-[10px] uppercase tracking-[0.18em]", config.subtext)}>Card number</p>
            <p className={cn("tnum mt-1 text-[17px] font-semibold tracking-[0.14em]", config.text)}>
              {revealed ? formatPan(card.number) : `••••  ••••  ••••  ${card.number.slice(-4)}`}
            </p>
          </div>

          <div className="mt-4 flex items-end justify-between">
            <div className="flex gap-6">
              <div>
                <p className={cn("text-[10px] uppercase tracking-[0.18em]", config.subtext)}>Expires</p>
                <p className={cn("tnum text-[14px] font-semibold", config.text)}>
                  {revealed ? card.expiry : "••/••"}
                </p>
              </div>
              <div>
                <p className={cn("text-[10px] uppercase tracking-[0.18em]", config.subtext)}>CVV</p>
                <p className={cn("tnum text-[14px] font-semibold", config.text)}>
                  {revealed ? card.cvv : "•••"}
                </p>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setRevealed((r) => !r);
              }}
              aria-label={revealed ? "Hide card details" : "Show card details"}
              className={cn(
                "tap flex items-center justify-center rounded-full border border-current/25 opacity-85 transition-opacity active:opacity-100",
                config.text,
              )}
            >
              {revealed ? <EyeOff className="size-[18px]" strokeWidth={2} /> : <Eye className="size-[18px]" strokeWidth={2} />}
            </button>
          </div>
        </div>
      </motion.div>

      {activating && (
        <div className="absolute right-3 top-3 z-10">
          <span className="flex items-center gap-1.5 rounded-full bg-[#06162f]/70 px-2.5 py-1 text-[11px] font-semibold text-[#ffe9a3] backdrop-blur">
            <Loader2 className="size-3 animate-spin" />
            Activating…
          </span>
        </div>
      )}
      {card.frozen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[10px] bg-[#06162f]/60 backdrop-blur-[3px]"
        >
          <div className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-white backdrop-blur">
            <Snowflake className="size-4" />
            <span className="text-[14px] font-semibold">Card frozen</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
