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
].map((c) => ({ ...c, wave: 1 }));

/** Wave 2, vaults #501-1000. "Florida" is placed at Orlando, mid-state. */
const WAVE_2 = [
  { city: "Perth", country: "Australia", lon: 115.8605, lat: -31.9505 },
  { city: "Brisbane", country: "Australia", lon: 153.0251, lat: -27.4698 },
  { city: "Auckland", country: "New Zealand", lon: 174.7633, lat: -36.8485 },
  { city: "Melbourne", country: "Australia", lon: 144.9631, lat: -37.8136 },
  { city: "Gold Coast", country: "Australia", lon: 153.4, lat: -28.0167 },
  { city: "Minneapolis", country: "USA", lon: -93.265, lat: 44.9778 },
  { city: "St. Paul", country: "USA", lon: -93.09, lat: 44.9537 },
  { city: "Nashville", country: "USA", lon: -86.7816, lat: 36.1627 },
  { city: "Florida", country: "USA", lon: -81.3792, lat: 28.5383 },
  { city: "Adelaide", country: "Australia", lon: 138.6007, lat: -34.9285 },
].map((c) => ({ ...c, wave: 2 }));
CITIES.push(...WAVE_2);

/** ITDB ATMS phase 1: 80 cities in 32 countries, 50 ATMs each. */
const ATM_CITIES = [
  { city: "New York", country: "USA", region: "North America", lon: -74.006, lat: 40.7128 },
  { city: "Los Angeles", country: "USA", region: "North America", lon: -118.2437, lat: 34.0522 },
  { city: "Chicago", country: "USA", region: "North America", lon: -87.6298, lat: 41.8781 },
  { city: "Miami", country: "USA", region: "North America", lon: -80.1918, lat: 25.7617 },
  { city: "San Francisco", country: "USA", region: "North America", lon: -122.4194, lat: 37.7749 },
  { city: "Boston", country: "USA", region: "North America", lon: -71.0589, lat: 42.3601 },
  { city: "Seattle", country: "USA", region: "North America", lon: -122.3321, lat: 47.6062 },
  { city: "Austin", country: "USA", region: "North America", lon: -97.7431, lat: 30.2672 },
  { city: "Dallas", country: "USA", region: "North America", lon: -96.797, lat: 32.7767 },
  { city: "Houston", country: "USA", region: "North America", lon: -95.3698, lat: 29.7604 },
  { city: "Atlanta", country: "USA", region: "North America", lon: -84.388, lat: 33.749 },
  { city: "Denver", country: "USA", region: "North America", lon: -104.9903, lat: 39.7392 },
  { city: "Las Vegas", country: "USA", region: "North America", lon: -115.1398, lat: 36.1699 },
  { city: "Philadelphia", country: "USA", region: "North America", lon: -75.1652, lat: 39.9526 },
  { city: "Phoenix", country: "USA", region: "North America", lon: -112.074, lat: 33.4484 },
  { city: "San Diego", country: "USA", region: "North America", lon: -117.1611, lat: 32.7157 },
  { city: "Portland", country: "USA", region: "North America", lon: -122.6784, lat: 45.5152 },
  { city: "Nashville", country: "USA", region: "North America", lon: -86.7816, lat: 36.1627 },
  { city: "Charlotte", country: "USA", region: "North America", lon: -80.8431, lat: 35.2271 },
  { city: "Detroit", country: "USA", region: "North America", lon: -83.0458, lat: 42.3314 },
  { city: "Minneapolis", country: "USA", region: "North America", lon: -93.265, lat: 44.9778 },
  { city: "New Orleans", country: "USA", region: "North America", lon: -90.0715, lat: 29.9511 },
  { city: "Orlando", country: "USA", region: "North America", lon: -81.3792, lat: 28.5383 },
  { city: "Tampa", country: "USA", region: "North America", lon: -82.4572, lat: 27.9506 },
  { city: "Washington D.C.", country: "USA", region: "North America", lon: -77.0369, lat: 38.9072 },
  { city: "Toronto", country: "Canada", region: "North America", lon: -79.3832, lat: 43.6532 },
  { city: "Vancouver", country: "Canada", region: "North America", lon: -123.1207, lat: 49.2827 },
  { city: "Montreal", country: "Canada", region: "North America", lon: -73.5674, lat: 45.5019 },
  { city: "Calgary", country: "Canada", region: "North America", lon: -114.0719, lat: 51.0447 },
  { city: "Ottawa", country: "Canada", region: "North America", lon: -75.6972, lat: 45.4215 },
  { city: "Edmonton", country: "Canada", region: "North America", lon: -113.4938, lat: 53.5461 },
  { city: "Sydney", country: "Australia", region: "Oceania", lon: 151.2093, lat: -33.8688 },
  { city: "Melbourne", country: "Australia", region: "Oceania", lon: 144.9631, lat: -37.8136 },
  { city: "Brisbane", country: "Australia", region: "Oceania", lon: 153.0251, lat: -27.4698 },
  { city: "Perth", country: "Australia", region: "Oceania", lon: 115.8605, lat: -31.9505 },
  { city: "Adelaide", country: "Australia", region: "Oceania", lon: 138.6007, lat: -34.9285 },
  { city: "Gold Coast", country: "Australia", region: "Oceania", lon: 153.4, lat: -28.0167 },
  { city: "Canberra", country: "Australia", region: "Oceania", lon: 149.13, lat: -35.2809 },
  { city: "Newcastle", country: "Australia", region: "Oceania", lon: 151.7817, lat: -32.9283 },
  { city: "Wollongong", country: "Australia", region: "Oceania", lon: 150.8931, lat: -34.4278 },
  { city: "Hobart", country: "Australia", region: "Oceania", lon: 147.3272, lat: -42.8821 },
  { city: "Auckland", country: "New Zealand", region: "Oceania", lon: 174.7633, lat: -36.8485 },
  { city: "Wellington", country: "New Zealand", region: "Oceania", lon: 174.7762, lat: -41.2865 },
  { city: "Christchurch", country: "New Zealand", region: "Oceania", lon: 172.6362, lat: -43.5321 },
  { city: "Queenstown", country: "New Zealand", region: "Oceania", lon: 168.6626, lat: -45.0312 },
  { city: "Mexico City", country: "Mexico", region: "Latin America", lon: -99.1332, lat: 19.4326 },
  { city: "São Paulo", country: "Brazil", region: "Latin America", lon: -46.6333, lat: -23.5505 },
  { city: "Buenos Aires", country: "Argentina", region: "Latin America", lon: -58.3816, lat: -34.6037 },
  { city: "Santiago", country: "Chile", region: "Latin America", lon: -70.6693, lat: -33.4489 },
  { city: "Bogotá", country: "Colombia", region: "Latin America", lon: -74.0721, lat: 4.711 },
  { city: "London", country: "UK", region: "Europe", lon: -0.1276, lat: 51.5072 },
  { city: "Paris", country: "France", region: "Europe", lon: 2.3522, lat: 48.8566 },
  { city: "Berlin", country: "Germany", region: "Europe", lon: 13.405, lat: 52.52 },
  { city: "Frankfurt", country: "Germany", region: "Europe", lon: 8.6821, lat: 50.1109 },
  { city: "Munich", country: "Germany", region: "Europe", lon: 11.582, lat: 48.1351 },
  { city: "Hamburg", country: "Germany", region: "Europe", lon: 9.9937, lat: 53.5511 },
  { city: "Madrid", country: "Spain", region: "Europe", lon: -3.7038, lat: 40.4168 },
  { city: "Barcelona", country: "Spain", region: "Europe", lon: 2.1686, lat: 41.3874 },
  { city: "Rome", country: "Italy", region: "Europe", lon: 12.4964, lat: 41.9028 },
  { city: "Milan", country: "Italy", region: "Europe", lon: 9.19, lat: 45.4642 },
  { city: "Amsterdam", country: "Netherlands", region: "Europe", lon: 4.9041, lat: 52.3676 },
  { city: "Zurich", country: "Switzerland", region: "Europe", lon: 8.5417, lat: 47.3769 },
  { city: "Geneva", country: "Switzerland", region: "Europe", lon: 6.1432, lat: 46.2044 },
  { city: "Brussels", country: "Belgium", region: "Europe", lon: 4.3517, lat: 50.8503 },
  { city: "Vienna", country: "Austria", region: "Europe", lon: 16.3738, lat: 48.2082 },
  { city: "Prague", country: "Czechia", region: "Europe", lon: 14.4378, lat: 50.0755 },
  { city: "Warsaw", country: "Poland", region: "Europe", lon: 21.0122, lat: 52.2297 },
  { city: "Lisbon", country: "Portugal", region: "Europe", lon: -9.1393, lat: 38.7223 },
  { city: "Dublin", country: "Ireland", region: "Europe", lon: -6.2603, lat: 53.3498 },
  { city: "Stockholm", country: "Sweden", region: "Europe", lon: 18.0686, lat: 59.3293 },
  { city: "Oslo", country: "Norway", region: "Europe", lon: 10.7522, lat: 59.9139 },
  { city: "Copenhagen", country: "Denmark", region: "Europe", lon: 12.5683, lat: 55.6761 },
  { city: "Helsinki", country: "Finland", region: "Europe", lon: 24.9384, lat: 60.1699 },
  { city: "Athens", country: "Greece", region: "Europe", lon: 23.7275, lat: 37.9838 },
  { city: "Budapest", country: "Hungary", region: "Europe", lon: 19.0402, lat: 47.4979 },
  { city: "Dubai", country: "UAE", region: "Middle East", lon: 55.2708, lat: 25.2048 },
  { city: "Abu Dhabi", country: "UAE", region: "Middle East", lon: 54.3773, lat: 24.4539 },
  { city: "Doha", country: "Qatar", region: "Middle East", lon: 51.531, lat: 25.2854 },
  { city: "Riyadh", country: "Saudi Arabia", region: "Middle East", lon: 46.6753, lat: 24.7136 },
  { city: "Kuwait City", country: "Kuwait", region: "Middle East", lon: 47.9774, lat: 29.3759 },
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

const atmPins = ATM_CITIES.map((c) => {
  const [x, y] = projection([c.lon, c.lat]);
  return { city: c.city, country: c.country, region: c.region, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
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
  /** 1: vaults #001-500, 2: vaults #501-1000 */
  wave: 1 | 2;
}

export const VAULT_PINS: VaultPin[] = ${JSON.stringify(
  pins.map(({ city, country, x, y, wave }) => ({ city, country, x, y, wave })),
  null,
  2,
)};

export interface AtmPin {
  city: string;
  country: string;
  region: "North America" | "Latin America" | "Europe" | "Middle East" | "Oceania";
  x: number;
  y: number;
}

/** ITDB ATMS cities, projected the same way. */
export const ATM_PINS: AtmPin[] = ${JSON.stringify(atmPins)};
`;

writeFileSync("src/lib/itdb/world-map.ts", out);
console.log(
  `world-map.ts written — ${shapes.length} countries, ${pins.length} pins, ` +
    `${(out.length / 1024).toFixed(0)} KB`,
);
