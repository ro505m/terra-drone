// Climate-aware plant catalog for procedural seed-spread planting.
// Decoupled from pricing: this drives *how* plants are distributed and
// rendered on the map. Pricing still uses TreeSpecies in pricing.ts.

import type { TreeSpecies } from "./pricing";

export type PlantId = TreeSpecies; // we reuse the same identifiers

export interface PlantProfile {
  id: PlantId;
  label: string;
  icon: string;
  /** Heat / drought resistance, 0..1 */
  heatResistance: number;
  /** Suggested trees per hectare */
  baseDensity: number;
  /** Cluster radius in meters (seed spread) */
  clusterRadius: number;
  /** How tightly seeds cluster around an emitter, 0..1 (1 = very clustered) */
  clusterStrength: number;
  /** Distribution noise: jitter scale in meters */
  jitterMeters: number;
  /** Visual marker color (HSL) */
  color: string;
  /** Growth animation profile */
  growth: {
    duration: number;
    ease: string;
    rotationJitter: number;   // degrees
    scaleFrom: number;
  };
  /** Short blurb describing climate fit */
  climateFit: string;
}

export const PLANT_PROFILES: Record<PlantId, PlantProfile> = {
  palm: {
    id: "palm",
    label: "Palm",
    icon: "/icons/trees/date-palm.png",
    heatResistance: 0.95,
    baseDensity: 180,
    clusterRadius: 60,
    clusterStrength: 0.35,
    jitterMeters: 18,
    color: "hsl(75 85% 55%)",
    growth: { duration: 1.1, ease: "elastic.out(1, 0.55)", rotationJitter: 14, scaleFrom: 0 },
    climateFit: "Thrives in extreme heat & arid soil",
  },
  shrub: {
    id: "shrub",
    label: "Desert shrub",
    icon: "/icons/trees/tamarisk.png",
    heatResistance: 1.0,
    baseDensity: 1400,
    clusterRadius: 35,
    clusterStrength: 0.25,
    jitterMeters: 9,
    color: "hsl(100 60% 45%)",
    growth: { duration: 0.7, ease: "back.out(2)", rotationJitter: 25, scaleFrom: 0.1 },
    climateFit: "Extreme drought tolerance, fast cover",
  },
  olive: {
    id: "olive",
    label: "Olive",
    icon: "/icons/trees/olive.png",
    heatResistance: 0.75,
    baseDensity: 280,
    clusterRadius: 80,
    clusterStrength: 0.55,
    jitterMeters: 22,
    color: "hsl(85 55% 50%)",
    growth: { duration: 1.0, ease: "expo.out", rotationJitter: 8, scaleFrom: 0 },
    climateFit: "Moderate heat, prefers structured rows",
  },
  oak: {
    id: "oak",
    label: "Oak",
    icon: "/icons/trees/albizia.png",
    heatResistance: 0.45,
    baseDensity: 420,
    clusterRadius: 95,
    clusterStrength: 0.45,
    jitterMeters: 26,
    color: "hsl(142 92% 55%)",
    growth: { duration: 1.3, ease: "elastic.out(1, 0.6)", rotationJitter: 10, scaleFrom: 0 },
    climateFit: "Cooler, well-watered northern zones",
  },
  acacia: {
    id: "acacia",
    label: "acacia",
    icon: "/icons/trees/acacia.png",
    heatResistance: 0.5,
    baseDensity: 600,
    clusterRadius: 70,
    clusterStrength: 0.5,
    jitterMeters: 18,
    color: "hsl(160 80% 50%)",
    growth: { duration: 1.0, ease: "expo.out", rotationJitter: 6, scaleFrom: 0 },
    climateFit: "Highland & northern slopes",
  },
};

export const PLANT_ORDER: PlantId[] = ["palm", "shrub", "olive", "acacia"]
  .filter((v, i, a) => a.indexOf(v) === i) as PlantId[];

/**
 * Suggest the best plant for a given centroid latitude (Iraq context).
 * Lower latitudes (south) → more heat-resistant species.
 * Crude but believable: matches Iraqi geography (Basra ↔ palms, Mosul ↔ oak).
 */
export function suggestPlantByLatitude(lat: number): PlantId {
  if (lat < 31.5) return "palm";   // south (Basra, marshes)
  if (lat < 33.5) return "shrub";  // central arid
  if (lat < 35.0) return "olive";  // mid-north Mesopotamian basin
  if (lat < 36.2) return "oak";    // northern foothills
  return "acacia";                    // mountainous Kurdistan
}

/**
 * Adapt density based on area: large areas reduce density to keep
 * the simulation responsive and the map readable.
 */
export function recommendDensity(plant: PlantId, areaHa: number): number {
  const base = PLANT_PROFILES[plant].baseDensity;
  if (areaHa <= 0) return base;
  // Smooth taper: 1 ha → 1.0×, 50 ha → ~0.55×, 500 ha → ~0.30×
  const factor = 1 / (1 + Math.log10(Math.max(1, areaHa)) * 0.45);
  return Math.round(base * factor);
}

/**
 * Mock soil suitability score 0..1 derived from lat/lng.
 * Pure deterministic noise so the UI feels grounded without a real model.
 */
export function soilSuitability(lat: number, lng: number, plant: PlantId): number {
  const h = Math.sin(lat * 12.9898 + lng * 78.233) * 43758.5453;
  const noise = h - Math.floor(h); // 0..1
  const heat = PLANT_PROFILES[plant].heatResistance;
  // Hotter/drier south favors heat-tolerant species
  const southness = Math.max(0, Math.min(1, (34 - lat) / 4)); // 0 north → 1 south
  const fit = heat * southness + (1 - heat) * (1 - southness);
  return Math.max(0.2, Math.min(1, 0.55 + fit * 0.35 + (noise - 0.5) * 0.15));
}
