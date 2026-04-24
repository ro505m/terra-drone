// Procedural seed spread for the planting simulation.
// Treats polygon vertices as seed emitters and spreads plants outward
// using radial falloff + value noise for organic clustering.

import * as turf from "@turf/turf";
import type { PlantProfile } from "./plants";

type LngLat = [number, number];

// Deterministic 2D value noise (mulberry32-ish hash).
function hash(x: number, y: number, seed: number): number {
  let h = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const tl = hash(xi, yi, seed);
  const tr = hash(xi + 1, yi, seed);
  const bl = hash(xi, yi + 1, seed);
  const br = hash(xi + 1, yi + 1, seed);
  const u = smooth(xf);
  const v = smooth(yf);
  return tl * (1 - u) * (1 - v) + tr * u * (1 - v) + bl * (1 - u) * v + br * u * v;
}

interface SpreadOptions {
  polygon: GeoJSON.Feature<GeoJSON.Polygon>;
  emitters: LngLat[];                // polygon vertices act as seed emitters
  count: number;                      // total trees to plant
  profile: PlantProfile;
  seed?: number;
}

/**
 * Generate plant positions inside a polygon, spreading from emitters.
 * Combines:
 *   - radial falloff from each emitter (clusterRadius/clusterStrength)
 *   - value-noise field for organic patchiness
 *   - jitter for natural randomness
 */
export function spreadSeeds({
  polygon,
  emitters,
  count,
  profile,
  seed = 1337,
}: SpreadOptions): LngLat[] {
  if (!emitters.length || count <= 0) return [];

  const bbox = turf.bbox(polygon);
  const [minX, minY, maxX, maxY] = bbox;

  // Convert "meters" to ~degrees at the polygon's centroid latitude.
  const centerLat = (minY + maxY) / 2;
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos((centerLat * Math.PI) / 180);
  const mToDegLng = (m: number) => m / metersPerDegLng;
  const mToDegLat = (m: number) => m / metersPerDegLat;

  const radDegLng = mToDegLng(profile.clusterRadius);
  const radDegLat = mToDegLat(profile.clusterRadius);
  const jitterDegLng = mToDegLng(profile.jitterMeters);
  const jitterDegLat = mToDegLat(profile.jitterMeters);
  const noiseScale = 1 / Math.max(radDegLng, 1e-6) * 0.6;

  const out: LngLat[] = [];
  const maxAttempts = count * 18;
  let attempts = 0;

  while (out.length < count && attempts < maxAttempts) {
    attempts++;
    // Pick an emitter weighted uniformly
    const e = emitters[Math.floor(hash(attempts, 7, seed) * emitters.length) % emitters.length];

    // Radial sample: r in [0, 1] biased by clusterStrength
    const r1 = hash(attempts, 1, seed);
    const r2 = hash(attempts, 2, seed);
    const radius = Math.pow(r1, 1 + profile.clusterStrength * 3); // bias toward emitter
    const angle = r2 * Math.PI * 2;

    // Stretch radius so larger areas still fill (cap by polygon bbox span)
    const spanX = (maxX - minX) * 0.55;
    const spanY = (maxY - minY) * 0.55;
    const dx = Math.cos(angle) * radius * Math.max(radDegLng, spanX) +
               (hash(attempts, 3, seed) - 0.5) * jitterDegLng * 2;
    const dy = Math.sin(angle) * radius * Math.max(radDegLat, spanY) +
               (hash(attempts, 4, seed) - 0.5) * jitterDegLat * 2;

    const candidate: LngLat = [e[0] + dx, e[1] + dy];

    // Noise mask — accept points where noise > threshold for patchiness
    const n = valueNoise(candidate[0] * noiseScale * 50, candidate[1] * noiseScale * 50, seed);
    const accept = n > 0.32 || hash(attempts, 9, seed) > 0.55;
    if (!accept) continue;

    // Inside polygon?
    if (!turf.booleanPointInPolygon(turf.point(candidate), polygon)) continue;

    out.push(candidate);
  }

  return out;
}
