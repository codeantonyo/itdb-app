"use client";

import { COUNTRY_PATHS, MAP_HEIGHT, MAP_WIDTH, VAULT_PINS } from "@/lib/itdb/world-map";

/**
 * The global vault map.
 *
 * All of it is SVG + CSS. The country outlines are pre-projected at build
 * time (scripts/build-world-map.mjs), and the pulse, the travelling light
 * and the dust are CSS animations — so nothing here runs a frame loop or
 * ships a map library.
 *
 * Labels are HTML, not SVG text. Inside the SVG they would scale with the
 * map and land at about 5px on a phone; as HTML they stay a fixed, legible
 * size however wide the map is drawn.
 */

/** Routes drawn between vaults, chosen to look like a network. */
const ROUTES: [string, string][] = [
  ["San Francisco", "Chicago"],
  ["Los Angeles", "Chicago"],
  ["Chicago", "New York"],
  ["New York", "Miami"],
  ["New York", "Toronto"],
  ["New York", "London"],
  ["London", "Frankfurt"],
  ["Frankfurt", "Dubai"],
  ["Dubai", "Sydney"],
];

/**
 * Where each label sits, in map units, and which side its text runs.
 *
 * Toronto, Chicago and New York project within 16px of each other at
 * phone width, so labels cannot simply sit beside their pin — these fan
 * them out and a hairline leader ties each back to the right city.
 */
const LABELS: Record<string, { x: number; y: number; side: "left" | "right" }> = {
  "San Francisco": { x: 52, y: 66, side: "right" },
  "Los Angeles": { x: 36, y: 178, side: "right" },
  Chicago: { x: 190, y: 28, side: "left" },
  Toronto: { x: 214, y: 114, side: "left" },
  "New York": { x: 306, y: 94, side: "right" },
  Miami: { x: 296, y: 168, side: "right" },
  London: { x: 352, y: 38, side: "left" },
  Frankfurt: { x: 470, y: 60, side: "right" },
  Dubai: { x: 568, y: 156, side: "right" },
  Sydney: { x: 672, y: 316, side: "left" },
};

const at = (city: string) => VAULT_PINS.find((p) => p.city === city)!;

/** A shallow arc, so routes read as great circles rather than string. */
function arc(from: string, to: string): string {
  const a = at(from);
  const b = at(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const lift = Math.min(len * 0.18, 34);
  return `M${a.x},${a.y} Q${(a.x + b.x) / 2 - (dy / len) * lift},${
    (a.y + b.y) / 2 + (dx / len) * lift
  } ${b.x},${b.y}`;
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

interface VaultMapProps {
  className?: string;
  /** Vaults left per city; omit while loading and every pin reads ACTIVE */
  remaining?: Record<string, number>;
  selected?: string | null;
  onSelect?: (city: string) => void;
}

export function VaultMap({ className, remaining, selected, onSelect }: VaultMapProps) {
  const left = (city: string) => remaining?.[city];
  const full = (city: string) => left(city) === 0;
  const pick = (city: string) => {
    if (onSelect && !full(city)) onSelect(city);
  };

  return (
    <div className={`relative ${className ?? ""}`}>
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="vault-map block w-full"
        role="img"
        aria-label={`World map showing ITDB vaults in ${VAULT_PINS.map((p) => p.city).join(", ")}`}
      >
        <defs>
          <radialGradient id="vault-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--m-gold-light)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--m-gold)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="vault-route" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--m-gold)" stopOpacity="0.05" />
            <stop offset="50%" stopColor="var(--m-gold-light)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--m-gold)" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        <g className="vault-land">
          {COUNTRY_PATHS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>

        <g className="vault-routes">
          {ROUTES.map(([from, to], i) => {
            const d = arc(from, to);
            return (
              <g key={`${from}-${to}`}>
                <path d={d} />
                <circle r="1.9" className="vault-spark">
                  {/* SMIL — the browser runs this without the main thread */}
                  <animateMotion
                    dur={`${5 + (i % 4) * 1.4}s`}
                    begin={`${i * 0.7}s`}
                    repeatCount="indefinite"
                    path={d}
                  />
                </circle>
              </g>
            );
          })}
        </g>

        <g className="vault-leaders">
          {VAULT_PINS.map((p) => {
            const l = LABELS[p.city];
            return <line key={p.city} x1={p.x} y1={p.y} x2={l.x} y2={l.y} />;
          })}
        </g>

        <g className="vault-pins">
          {VAULT_PINS.map((p, i) => (
            <g
              key={p.city}
              data-selected={selected === p.city || undefined}
              data-full={full(p.city) || undefined}
              style={{ ["--d" as string]: `${i * 0.38}s` }}
            >
              <circle cx={p.x} cy={p.y} r="17" fill="url(#vault-glow)" className="vault-halo" />
              <circle cx={p.x} cy={p.y} r="6.5" className="vault-ring" />
              <circle cx={p.x} cy={p.y} r="2.6" className="vault-core" />
              {/* Tapping the pin itself works as well as tapping its name.
                  The name carries the accessible label, so this is hidden. */}
              {onSelect && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="15"
                  className="vault-hit"
                  onClick={() => pick(p.city)}
                  aria-hidden="true"
                />
              )}
            </g>
          ))}
        </g>
      </svg>

      {/* Labels ride above the map so their text size never scales down.
          Each is the city's button — the name is its accessible label. */}
      <div className="vault-labels">
        {VAULT_PINS.map((p) => {
          const l = LABELS[p.city];
          const n = left(p.city);
          const isFull = n === 0;
          const label = n === undefined ? "ACTIVE" : isFull ? "FULL" : `${n} LEFT`;
          const Tag = onSelect ? "button" : "span";
          return (
            <Tag
              key={p.city}
              type={onSelect ? "button" : undefined}
              className="vault-label"
              data-side={l.side}
              data-selected={selected === p.city || undefined}
              data-full={isFull || undefined}
              disabled={onSelect ? isFull : undefined}
              aria-pressed={onSelect ? selected === p.city : undefined}
              onClick={onSelect ? () => pick(p.city) : undefined}
              style={{ left: pct(l.x, MAP_WIDTH), top: pct(l.y, MAP_HEIGHT) }}
            >
              <b>{p.city}</b>
              <i>
                <s /> {label}
              </i>
            </Tag>
          );
        })}
      </div>
    </div>
  );
}

/** Slow gold motes drifting over the map. Decorative, hidden from AT. */
export function GoldDust({ count = 18 }: { count?: number }) {
  return (
    <div className="gold-dust" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            // Deterministic, so server and client agree on the first paint.
            ["--dur" as string]: `${11 + (i % 7) * 2.5}s`,
            ["--delay" as string]: `${-(i * 1.9)}s`,
            ["--size" as string]: `${1 + (i % 3) * 0.7}px`,
            ["--drift" as string]: `${((i % 5) - 2) * 14}px`,
          }}
        />
      ))}
    </div>
  );
}
