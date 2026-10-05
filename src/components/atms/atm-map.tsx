"use client";

import { ATM_CITIES } from "@/lib/itdb/atms";
import { COUNTRY_PATHS, MAP_HEIGHT, MAP_WIDTH, type AtmPin } from "@/lib/itdb/world-map";

/**
 * The ATM network map: 80 gold pins, grey with "FULL" once a city has no
 * ATMs left. "All" shows the world; a region zooms the same SVG by its
 * viewBox, so nothing is re-projected and the pins stay exact.
 *
 * Names only appear zoomed in, and only where they fit — a label that
 * would overlap one already placed is skipped (the selected city and
 * full cities go first). The Cities tab lists every one by name.
 */

export type Region = "All" | AtmPin["region"];

/** Screen width the label size is tuned for; the map is phone-first. */
const DESIGN_PX = 360;

function frame(region: Region) {
  if (region === "All") return { x: 0, y: 0, w: MAP_WIDTH, h: MAP_HEIGHT };
  const pins = ATM_CITIES.filter((p) => p.region === region);
  const xs = pins.map((p) => p.x);
  const ys = pins.map((p) => p.y);
  let w = Math.max(Math.max(...xs) - Math.min(...xs), 30) * 1.35;
  let h = Math.max(Math.max(...ys) - Math.min(...ys), 20) * 1.5;
  // Keep the map's own aspect, so nothing letterboxes.
  const aspect = MAP_WIDTH / MAP_HEIGHT;
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  return {
    x: Math.min(Math.max(cx - w / 2, 0), MAP_WIDTH - w),
    y: Math.min(Math.max(cy - h / 2, 0), MAP_HEIGHT - h),
    w,
    h,
  };
}

interface Props {
  region: Region;
  remaining?: Record<string, number>;
  selected?: string | null;
  onSelect?: (city: string) => void;
}

export function AtmMap({ region, remaining, selected, onSelect }: Props) {
  const f = frame(region);
  const u = f.w / MAP_WIDTH; // map units per world-view unit
  const font = (8.5 * f.w) / DESIGN_PX;
  const full = (c: string) => remaining?.[c] === 0;

  const pins = region === "All" ? ATM_CITIES : ATM_CITIES.filter((p) => p.region === region);

  // Greedy label placement: priority first, skip anything that collides.
  const labels: { p: AtmPin; x: number; y: number; w: number; text: string }[] = [];
  if (region !== "All") {
    const order = [...pins].sort(
      (a, b) => Number(b.city === selected) - Number(a.city === selected) || Number(full(b.city)) - Number(full(a.city)),
    );
    for (const p of order) {
      const text = full(p.city) ? `${p.city} · FULL` : p.city;
      const must = p.city === selected || full(p.city);
      const w = text.length * font * 0.55;
      // Right of the pin, else left of it.
      const spots = [p.x + font * 0.6, p.x - font * 0.6 - w].map((x) => ({ x, y: p.y - font * 0.5, w }));
      const fits = (b: { x: number; y: number; w: number }) =>
        b.x > f.x &&
        b.x + b.w < f.x + f.w &&
        !labels.some((l) => b.x < l.x + l.w && l.x < b.x + b.w && b.y < l.y + font * 1.1 && l.y < b.y + font * 1.1) &&
        (must || !pins.some((q) => q !== p && q.x > b.x && q.x < b.x + b.w && Math.abs(q.y - p.y) < font * 0.6));
      const spot = spots.find(fits) ?? (must ? spots[0] : undefined);
      if (spot) labels.push({ p, ...spot, text });
    }
  }

  return (
    <svg
      viewBox={`${f.x} ${f.y} ${f.w} ${f.h}`}
      // Zoomed in, the rest of the world must stay outside the frame.
      className="vault-map block w-full"
      style={{ overflow: "hidden" }}
      role="img"
      aria-label={`Map of ITDB ATM cities${region === "All" ? "" : ` in ${region}`}`}
    >
      <g className="vault-land" style={{ strokeWidth: 0.6 * u }}>
        {COUNTRY_PATHS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>

      {pins.map((p) => {
        const isFull = full(p.city);
        const on = selected === p.city;
        return (
          <g key={p.city} onClick={onSelect && !isFull ? () => onSelect(p.city) : undefined} className={onSelect && !isFull ? "cursor-pointer" : undefined}>
            {!isFull && (
              <circle cx={p.x} cy={p.y} r={7 * u * 2} fill="var(--m-gold)" opacity={on ? 0.35 : 0.12} />
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r={(on ? 3.4 : 2.4) * u * 2}
              fill={isFull ? "var(--m-muted-2, #7a879c)" : "var(--m-gold-light)"}
              stroke={on ? "#fff" : "none"}
              strokeWidth={0.6 * u * 2}
            />
            {/* a finger-sized target */}
            <circle cx={p.x} cy={p.y} r={10 * u * 2} fill="transparent" />
          </g>
        );
      })}

      {labels.map((l) => (
        <text
          key={l.p.city}
          x={l.x}
          y={l.p.y + font * 0.35}
          fontSize={font}
          fontWeight={700}
          fill={full(l.p.city) ? "#c3cad6" : "var(--m-gold-light)"}
          style={{ pointerEvents: "none" }}
        >
          {l.text}
        </text>
      ))}
    </svg>
  );
}
