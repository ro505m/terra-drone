// Iraq-context drone fleet catalog.
// Inspired by DJI Agras + locally-deployable seeders/monitors.
// Drives the DroneFleet UI and the swarm simulation.

export type DroneRole = "seeder" | "sprayer" | "monitor" | "hybrid";

export interface IraqiDrone {
  id: string;
  name: { en: string; ar: string };
  role: DroneRole;
  /** One-line tagline. */
  tagline: { en: string; ar: string };
  icon: string;
  /** Tailwind/CSS HSL color used for marker tint and propeller glow. */
  color: string;

  /** Cruise speed in m/s. */
  speedMps: number;
  /** Payload capacity (seeds in kg, water in liters, depending on role). */
  capacity: number;
  capacityUnit: "kg" | "L";
  /** Flight duration on a full battery in minutes. */
  flightMinutes: number;
  /** Effective coverage area per flight in hectares. */
  coverageHa: number;

  /** Number of propellers — drives the visual SVG. */
  propellers: 4 | 6 | 8;

  /** USD operating cost per minute (battery, maintenance, pilot share). */
  costPerMinuteUsd: number;
  /** Whether the drone can run in "local mode" (limited resources). */
  supportsLocalMode: boolean;

  notes: { en: string; ar: string };
}

export const IRAQI_DRONES: Record<string, IraqiDrone> = {
  agras_t40_seed: {
    id: "agras_t40_seed",
    name: { en: "Agras T40 — Seeder", ar: "أغراس T40 — بذار" },
    role: "seeder",
    tagline: {
      en: "Heavy-lift octocopter for broadcast seeding.",
      ar: "ثماني المراوح لرش البذور على نطاق واسع.",
    },
    icon: "/icons/drones/agras-t40.svg",
    color: "hsl(142 92% 55%)",
    speedMps: 7,
    capacity: 50,
    capacityUnit: "kg",
    flightMinutes: 18,
    coverageHa: 12,
    propellers: 8,
    costPerMinuteUsd: 1.4,
    supportsLocalMode: true,
    notes: {
      en: "Used by Iraqi agriculture coops in Diyala for rapid reseeding.",
      ar: "تستخدمها التعاونيات الزراعية في ديالى لإعادة البذر السريع.",
    },
  },
  agras_t30_spray: {
    id: "agras_t30_spray",
    name: { en: "Agras T30 — Sprayer", ar: "أغراس T30 — رشاش" },
    role: "sprayer",
    tagline: {
      en: "Precision water & nutrient spraying for saplings.",
      ar: "رش دقيق للماء والمغذيات للشتلات الصغيرة.",
    },
    icon: "/icons/drones/agras-t30.svg",
    color: "hsl(180 80% 60%)",
    speedMps: 6,
    capacity: 30,
    capacityUnit: "L",
    flightMinutes: 22,
    coverageHa: 8,
    propellers: 8,
    costPerMinuteUsd: 1.1,
    supportsLocalMode: true,
    notes: {
      en: "Cuts irrigation water use by ~60% vs surface irrigation.",
      ar: "يوفر نحو ٦٠٪ من مياه الري مقارنة بالري السطحي.",
    },
  },
  hexa_seeder: {
    id: "hexa_seeder",
    name: { en: "Hexa Seeder Pro", ar: "هيكسا للبذار" },
    role: "seeder",
    tagline: {
      en: "Mid-size hex for native seed pods.",
      ar: "سداسي متوسط الحجم لكبسولات البذور المحلية.",
    },
    icon: "/icons/drones/hexa-seeder.svg",
    color: "hsl(95 70% 55%)",
    speedMps: 8,
    capacity: 18,
    capacityUnit: "kg",
    flightMinutes: 28,
    coverageHa: 9,
    propellers: 6,
    costPerMinuteUsd: 0.85,
    supportsLocalMode: true,
    notes: {
      en: "Optimized for Sidr & Acacia seed-pod broadcasting.",
      ar: "محسّن لبث كبسولات بذور السدر والأكاسيا.",
    },
  },
  scout_quad: {
    id: "scout_quad",
    name: { en: "Tigris Scout", ar: "كشّاف دجلة" },
    role: "monitor",
    tagline: {
      en: "Lightweight survey & multispectral mapping.",
      ar: "مسح جوي خفيف وتصوير متعدد الأطياف.",
    },
    icon: "/icons/drones/scout.svg",
    color: "hsl(45 95% 60%)",
    speedMps: 14,
    capacity: 0,
    capacityUnit: "kg",
    flightMinutes: 45,
    coverageHa: 60,
    propellers: 4,
    costPerMinuteUsd: 0.45,
    supportsLocalMode: true,
    notes: {
      en: "Maps soil moisture & seedling survival weekly.",
      ar: "يرسم خرائط رطوبة التربة وبقاء الشتلات أسبوعياً.",
    },
  },
  local_hybrid: {
    id: "local_hybrid",
    name: { en: "Najaf Hybrid", ar: "هجين النجف" },
    role: "hybrid",
    tagline: {
      en: "Local-built quad: seed + light spray.",
      ar: "رباعي محلي الصنع: بذار ورش خفيف.",
    },
    icon: "/icons/drones/hybrid.svg",
    color: "hsl(28 90% 60%)",
    speedMps: 5,
    capacity: 8,
    capacityUnit: "kg",
    flightMinutes: 16,
    coverageHa: 3,
    propellers: 4,
    costPerMinuteUsd: 0.30,
    supportsLocalMode: true,
    notes: {
      en: "Affordable local platform for community-led planting projects.",
      ar: "منصة محلية بأسعار معقولة لمشاريع التشجير المجتمعية.",
    },
  },
};

export const DRONE_ORDER: string[] = [
  "agras_t40_seed",
  "agras_t30_spray",
  "hexa_seeder",
  "scout_quad",
  "local_hybrid",
];

export interface FleetEstimate {
  totalCoverageHa: number;
  totalFlightMinutes: number;
  totalCostUsd: number;
  totalCapacity: number;
}

/** Compute aggregate fleet capability from a count map. */
export function estimateFleet(counts: Record<string, number>): FleetEstimate {
  let coverage = 0;
  let minutes = 0;
  let cost = 0;
  let capacity = 0;
  for (const [id, n] of Object.entries(counts)) {
    const d = IRAQI_DRONES[id];
    if (!d || n <= 0) continue;
    coverage += d.coverageHa * n;
    minutes += d.flightMinutes * n;
    cost += d.flightMinutes * d.costPerMinuteUsd * n;
    capacity += d.capacity * n;
  }
  return {
    totalCoverageHa: coverage,
    totalFlightMinutes: minutes,
    totalCostUsd: cost,
    totalCapacity: capacity,
  };
}

export const ROLE_LABEL: Record<DroneRole, { en: string; ar: string }> = {
  seeder: { en: "Seeder", ar: "بذّار" },
  sprayer: { en: "Sprayer", ar: "رشاش" },
  monitor: { en: "Survey", ar: "استطلاع" },
  hybrid: { en: "Hybrid", ar: "هجين" },
};
