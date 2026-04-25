// Iraq-realistic pricing engine for the unified Mission Control workflow.
// Computes:
//   - tree cost (with bulk discount tuned so 500 trees ≤ $250)
//   - drone operating cost (per active drone × time, role-aware)
//   - optional water/maintenance cost
//   - total mission duration based on drone capacity & coverage
// All numbers are USD, deliberately tuned for Iraqi field conditions.

import { IRAQI_DRONES, type IraqiDrone, type DroneRole } from "./iraqiDrones";
import { IRAQI_TREES, type IraqiTree, type IraqiTreeId } from "./iraqiTrees";

export interface MissionInputs {
  treeId: IraqiTreeId;
  quantity: number;
  /** Map of droneId → count (0 = not used). */
  droneCounts: Record<string, number>;
  /** When true, applies Iraq-mode efficiency penalties. */
  iraqMode: boolean;
  /** When true, adds first-year water/maintenance cost. */
  includeMaintenance: boolean;
  /** Polygon area in hectares — informational, not required for cost. */
  areaHa?: number;
}

export interface MissionBreakdown {
  // Tree economics
  treeUnitCost: number;          // USD per sapling AFTER discount
  treeBaseCost: number;          // USD without discount
  treeDiscountPct: number;       // 0..1
  treeTotal: number;             // USD
  // Drone economics
  droneTotal: number;            // USD
  droneActiveCount: number;      // sum of all drone counts
  droneSeederCount: number;      // drones that actually plant
  droneMonitorCount: number;
  // Water / maintenance (optional)
  maintenanceTotal: number;
  // Mission stats
  durationMinutes: number;
  coverageHa: number;
  totalCapacity: number;
  // Final
  grandTotal: number;
  costPerTree: number;           // grandTotal / quantity
  // Validation
  warnings: string[];
}

// ---------- Tunable constants ----------

/** Bulk discount tiers (quantity → discount). Tuned so 500 saplings stay cheap. */
const BULK_TIERS: Array<{ min: number; pct: number }> = [
  { min: 0, pct: 0 },
  { min: 50, pct: 0.10 },
  { min: 200, pct: 0.25 },
  { min: 500, pct: 0.40 },
  { min: 1000, pct: 0.50 },
  { min: 5000, pct: 0.60 },
];

/** Iraq-realistic local sapling pricing override per species (USD).
 * Even species with imported costUsd of $4–6 get reset to the local nursery range
 * the spec asked for ($0.20 – $0.50 base before discounts).
 */
const LOCAL_TREE_PRICE: Partial<Record<IraqiTreeId, number>> = {
  acacia: 0.20,
  tamarisk: 0.22,
  sidr: 0.30,
  conocarpus: 0.28,
  neem: 0.32,
  eucalyptus: 0.25,
  albizia: 0.35,
  olive: 0.45,
  pomegranate: 0.40,
  date_palm: 0.50,
};

/** Drone operating cost per *active* minute (USD). Lower than international rates
 * because crews and electricity in Iraq are cheaper. Role-aware. */
const DRONE_RATE_USD_PER_MIN: Record<DroneRole, number> = {
  seeder: 0.18,
  sprayer: 0.14,
  monitor: 0.08,
  hybrid: 0.10,
};

/** How many trees a single drone of each role plants per minute (Iraq baseline). */
const ROLE_TREES_PER_MIN: Record<DroneRole, number> = {
  seeder: 18,
  sprayer: 0,
  monitor: 0,
  hybrid: 6,
};

/** Iraq-mode efficiency: heat & dust penalties. */
const IRAQ_MODE_SPEED_PENALTY = 0.78; // drones get 78% of nominal throughput
const IRAQ_MODE_COST_BONUS = 1.12;    // 12% extra battery / wear cost

/** Optional first-year maintenance cost per tree (USD). Sprayer drones reduce it. */
const MAINTENANCE_BASE_PER_TREE = 0.06;

// ---------- Helpers ----------

export function localTreePrice(tree: IraqiTree): number {
  return LOCAL_TREE_PRICE[tree.id] ?? Math.min(tree.costUsd, 0.5);
}

export function discountForQuantity(qty: number): number {
  let pct = 0;
  for (const tier of BULK_TIERS) if (qty >= tier.min) pct = tier.pct;
  return pct;
}

export function activeDronesList(counts: Record<string, number>): Array<{ d: IraqiDrone; n: number }> {
  return Object.entries(counts)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([id, n]) => ({ d: IRAQI_DRONES[id], n }))
    .filter((x) => !!x.d);
}

// ---------- Main calculator ----------

export function calculateMission(input: MissionInputs): MissionBreakdown {
  const tree = IRAQI_TREES[input.treeId];
  const qty = Math.max(0, Math.round(input.quantity));
  const warnings: string[] = [];

  // ----- Tree cost with bulk discount -----
  const unitBase = localTreePrice(tree);
  const discountPct = discountForQuantity(qty);
  const unitDiscounted = unitBase * (1 - discountPct);
  const treeBaseCost = unitBase * qty;
  const treeTotal = unitDiscounted * qty;

  // ----- Drone aggregate -----
  const drones = activeDronesList(input.droneCounts);
  let totalCapacity = 0;
  let coverageHa = 0;
  let seederTreesPerMin = 0;
  let droneSeederCount = 0;
  let droneMonitorCount = 0;
  let droneActiveCount = 0;

  for (const { d, n } of drones) {
    droneActiveCount += n;
    totalCapacity += d.capacity * n;
    coverageHa += d.coverageHa * n;
    seederTreesPerMin += ROLE_TREES_PER_MIN[d.role] * n;
    if (ROLE_TREES_PER_MIN[d.role] > 0) droneSeederCount += n;
    if (d.role === "monitor") droneMonitorCount += n;
  }

  // Apply Iraq-mode penalty
  const speedFactor = input.iraqMode ? IRAQ_MODE_SPEED_PENALTY : 1;
  const effectiveTreesPerMin = seederTreesPerMin * speedFactor;

  // ----- Mission duration -----
  let durationMinutes = 0;
  if (qty > 0 && effectiveTreesPerMin > 0) {
    durationMinutes = qty / effectiveTreesPerMin;
  } else if (qty > 0) {
    // No planter drones at all — surface a warning
    durationMinutes = 0;
    warnings.push("No planting-capable drones selected (need a Seeder or Hybrid).");
  }

  // ----- Drone operating cost -----
  let droneTotal = 0;
  for (const { d, n } of drones) {
    const ratePerMin = DRONE_RATE_USD_PER_MIN[d.role] * (input.iraqMode ? IRAQ_MODE_COST_BONUS : 1);
    droneTotal += ratePerMin * n * durationMinutes;
  }
  // Monitor drones still bill a small fixed survey fee even if mission length is 0
  if (qty === 0 && droneMonitorCount > 0) {
    droneTotal += droneMonitorCount * 4; // $4 survey baseline
  }

  // ----- Optional maintenance -----
  let maintenanceTotal = 0;
  if (input.includeMaintenance && qty > 0) {
    // Sprayers reduce per-tree maintenance burden
    const sprayerCount = drones.filter((x) => x.d.role === "sprayer" || x.d.role === "hybrid")
      .reduce((s, x) => s + x.n, 0);
    const sprayerDiscount = Math.min(0.6, sprayerCount * 0.12);
    maintenanceTotal = MAINTENANCE_BASE_PER_TREE * qty * (1 - sprayerDiscount);
  }

  // ----- Validation -----
  if (qty > 0 && coverageHa > 0 && input.areaHa && input.areaHa > coverageHa) {
    warnings.push(`Fleet coverage (${coverageHa.toFixed(1)} ha) below target area (${input.areaHa.toFixed(1)} ha).`);
  }
  if (qty === 0) warnings.push("Set a planting quantity above zero.");

  const grandTotal = treeTotal + droneTotal + maintenanceTotal;

  return {
    treeUnitCost: unitDiscounted,
    treeBaseCost,
    treeDiscountPct: discountPct,
    treeTotal,
    droneTotal,
    droneActiveCount,
    droneSeederCount,
    droneMonitorCount,
    maintenanceTotal,
    durationMinutes,
    coverageHa,
    totalCapacity,
    grandTotal,
    costPerTree: qty > 0 ? grandTotal / qty : 0,
    warnings,
  };
}

// ---------- Formatters ----------

export const fmtUsd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 100 ? 2 : 0 }).format(n);

export const fmtNum = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

export const fmtMin = (m: number) => {
  if (m < 1) return `${(m * 60).toFixed(0)}s`;
  if (m < 60) return `${m.toFixed(1)}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${Math.round(m - h * 60)}m`;
};
