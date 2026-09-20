#!/usr/bin/env node
/**
 * Generate the vault map's geometry, once, at build time.
 *
 *   node scripts/build-world-map.mjs
 *
 * Projecting on the client would mean shipping d3-geo, topojson-client
 * and a 105 KB TopoJSON to every phone to draw a picture that never
 * changes. This writes the finished SVG paths instead, so the app
 * carries no map dependency at all — d3-geo and topojson-client stay
 * devDependencies and never reach the bundle.
 *
 * Source: world-atlas (Natural Earth, public domain).
 */

import { writeFileSync } from "node:fs";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";

const SRC = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const WIDTH = 800;
/** Coordinates are rounded to this many decimals — ~0.1px at this size. */
const PRECISION = 1;

/** The cities holding a vault, with their real coordinates. */
const CITIES = [
  { city: "New York", country: "USA", lon: -74.006, lat: 40.7128 },
  { city: "Los Angeles", country: "USA", lon: -118.2437, lat: 34.0522 },
  { city: "Chicago", country: "USA", lon: -87.6298, lat: 41.8781 },
  { city: "Miami", country: "USA", lon: -80.1918, lat: 25.7617 },
  { city: "San Francisco", country: "USA", lon: -122.4194, lat: 37.7749 },
  { city: "Toronto", country: "Canada", lon: -79.3832, lat: 43.6532 },
  { city: "London", country: "UK", lon: -0.1276, lat: 51.5072 },
  { city: "Dubai", country: "UAE", lon: 55.2708, lat: 25.2048 },
  { city: "Frankfurt", country: "Germany", lon: 8.6821, lat: 50.1109 },
  { city: "Sydney", country: "Australia", lon: 151.2093, lat: -33.8688 },
];

const res = await fetch(SRC);
if (!res.ok) throw new Error(`Could not fetch the map: ${res.status}`);
const topology = await res.json();

const all = feature(topology, topology.objects.countries);

// Antarctica is a projection artefact more than a place at this size.
// It is dropped BEFORE fitting, not after — fitting with it in reserves
// the bottom fifth of the frame for something that is never drawn, and
// shrinks every country and label to pay for it.
const countries = {
  type: "FeatureCollection",
  features: all.features.filter((f) => f.id !== "010"),
};

const projection = geoNaturalEarth1().fitWidth(WIDTH, countries);
let path = geoPath(projection);

// Crop the frame to the land rather than to a guessed height: any band
// of empty ocean kept above or below costs scale everywhere, and the
// city labels are the first thing that becomes unreadable for it.
const [[, y0], [, y1]] = path.bounds(countries);
const PAD = 6;
const HEIGHT = Math.ceil(y1 - y0 + PAD * 2);
const [tx, ty] = projection.translate();
projection.translate([tx, ty - y0 + PAD]);
path = geoPath(projection);

const shapes = countries.features
  .map((f) => path(f))
  .filter(Boolean)
  .map((d) => d.replace(/(\d+\.\d+)/g, (m) => String(Math.round(+m * 10 ** PRECISION) / 10 ** PRECISION)));

const pins = CITIES.map((c) => {
  const [x, y] = projection([c.lon, c.lat]);
  return { ...c, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
});

const out = `/**
 * GENERATED — do not edit. Run: node scripts/build-world-map.mjs
 *
 * Country outlines projected (Natural Earth 1) into a ${WIDTH}x${HEIGHT}
 * viewBox, and the vault cities projected the same way so a pin lands
 * exactly where its city is.
 *
 * Map data: world-atlas / Natural Earth, public domain.
 */

export const MAP_WIDTH = ${WIDTH};
export const MAP_HEIGHT = ${HEIGHT};

/** One SVG path per country. */
export const COUNTRY_PATHS: string[] = ${JSON.stringify(shapes, null, 0).replace(/","/g, '",\n  "').replace(/^\["/, '[\n  "').replace(/"\]$/, '",\n]')};

export interface VaultPin {
  city: string;
  country: string;
  /** Position inside the ${WIDTH}x${HEIGHT} viewBox */
  x: number;
  y: number;
}

export const VAULT_PINS: VaultPin[] = ${JSON.stringify(
  pins.map(({ city, country, x, y }) => ({ city, country, x, y })),
  null,
  2,
)};
`;

writeFileSync("src/lib/itdb/world-map.ts", out);
console.log(
  `world-map.ts written — ${shapes.length} countries, ${pins.length} pins, ` +
    `${(out.length / 1024).toFixed(0)} KB`,
);
