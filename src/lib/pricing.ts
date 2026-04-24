// Tree species & pricing model for the donation engine
export type TreeSpecies = "oak" | "pine" | "palm" | "olive" | "shrub";

export interface TreeProfile {
  id: TreeSpecies;
  label: string;
  emoji: string;
  costPerTree: number;     // USD donation per sapling
  co2KgPerYear: number;    // CO₂ absorbed per year, kg
  color: string;           // semantic color (HSL string for canvas)
  growthYears: number;
}

export const TREE_PROFILES: Record<TreeSpecies, TreeProfile> = {
  oak:   { id: "oak",   label: "Oak",   emoji: "🌳", costPerTree: 4.5, co2KgPerYear: 21, color: "hsl(142 92% 55%)", growthYears: 40 },
  pine:  { id: "pine",  label: "Pine",  emoji: "🌲", costPerTree: 2.8, co2KgPerYear: 14, color: "hsl(160 80% 50%)", growthYears: 25 },
  palm:  { id: "palm",  label: "Palm",  emoji: "🌴", costPerTree: 6.2, co2KgPerYear: 11, color: "hsl(75 85% 55%)",  growthYears: 30 },
  olive: { id: "olive", label: "Olive", emoji: "🫒", costPerTree: 5.4, co2KgPerYear: 13, color: "hsl(85 55% 50%)",  growthYears: 50 },
  shrub: { id: "shrub", label: "Shrub", emoji: "🌿", costPerTree: 1.6, co2KgPerYear: 5,  color: "hsl(100 60% 45%)", growthYears: 12 },
};

export interface MissionConfig {
  drones: number;          // 1–20
  density: number;         // trees per hectare (e.g. 200–2000)
  areaHa: number;          // hectares
  species: TreeSpecies;
}

export interface MissionEstimate {
  trees: number;
  treesCost: number;
  droneCost: number;       // operations cost
  total: number;
  durationMin: number;
  co2Tons: number;         // tons / year
}

const DRONE_COST_PER_MINUTE = 0.85;     // USD per drone per minute of flight
const DRONE_TREES_PER_MIN  = 12;        // trees a single drone plants per minute

export function estimate(cfg: MissionConfig): MissionEstimate {
  const trees = Math.max(0, Math.round(cfg.density * cfg.areaHa));
  const profile = TREE_PROFILES[cfg.species];

  // Mission duration with parallel drones, with mild diminishing returns
  const efficiency = 0.78 + 0.22 / Math.max(1, cfg.drones); // 1 → 1.0, 20 → ~0.79
  const durationMin = trees / (cfg.drones * DRONE_TREES_PER_MIN * efficiency);

  const treesCost = trees * profile.costPerTree;
  const droneCost = cfg.drones * durationMin * DRONE_COST_PER_MINUTE;
  const total = treesCost + droneCost;
  const co2Tons = (trees * profile.co2KgPerYear) / 1000;

  return {
    trees,
    treesCost,
    droneCost,
    total,
    durationMin: Math.max(0.1, durationMin),
    co2Tons,
  };
}

export const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export const formatNumber = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
