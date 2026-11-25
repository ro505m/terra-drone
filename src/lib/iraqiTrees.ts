// Comprehensive catalog of trees commonly planted in Iraq.
// Bilingual (English / Arabic), with climate, water, soil, and growth data.
// Used to drive region-based recommendations and the tree catalog UI.
//
// Sources: Iraqi Ministry of Agriculture afforestation guides + FAO arid-land
// tree species references. Costs are USD per sapling estimates for local nurseries.

import type { PlantId } from "./plants";

export type IraqiTreeId =
  | "date_palm"
  | "sidr"
  | "eucalyptus"
  | "conocarpus"
  | "albizia"
  | "neem"
  | "acacia"
  | "olive"
  | "tamarisk"
  | "pomegranate";

export type ClimateZone = "south_arid" | "central_semi_arid" | "north_temperate" | "marshlands";
export type SoilType = "sandy" | "clay" | "loam" | "saline" | "rocky";
export type WaterNeed = "very_low" | "low" | "moderate" | "high";
export type GrowthRate = "slow" | "moderate" | "fast" | "very_fast";

export interface IraqiTree {
  id: IraqiTreeId;
  /** Maps to existing donation/plant engine for visuals + pricing. */
  plantId: PlantId;
  name: { en: string; ar: string };
  scientific: string;
  icon: string;
  /** Tailwind/CSS HSL color used for catalog chips & marker tint. */
  color: string;

  /** Min / max tolerated temperature (°C). Iraq summers reach 50°C. */
  tempRange: [number, number];
  droughtResistance: 1 | 2 | 3 | 4 | 5; // 5 = extreme
  waterNeed: WaterNeed;
  /** Approx. liters per tree per week once established. */
  waterLitersPerWeek: number;

  growthRate: GrowthRate;
  matureHeightM: [number, number];
  /** Average years to first usable canopy. */
  yearsToCanopy: number;

  soils: SoilType[];
  climates: ClimateZone[];

  /** USD estimate per sapling at Iraqi nurseries. */
  costUsd: number;
  /** Annual CO₂ sequestration estimate in kg. */
  co2KgPerYear: number;

  /** Short reason a planner would pick this tree. */
  notes: { en: string; ar: string };
}

export const IRAQI_TREES: Record<IraqiTreeId, IraqiTree> = {
  date_palm: {
    id: "date_palm",
    plantId: "palm",
    name: { en: "Date Palm", ar: "نخيل التمر" },
    scientific: "Phoenix dactylifera",
    icon: "/icons/trees/date-palm.png",
    color: "hsl(75 85% 55%)",
    tempRange: [-5, 55],
    droughtResistance: 5,
    waterNeed: "low",
    waterLitersPerWeek: 90,
    growthRate: "moderate",
    matureHeightM: [15, 25],
    yearsToCanopy: 6,
    soils: ["sandy", "loam", "saline"],
    climates: ["south_arid", "central_semi_arid", "marshlands"],
    costUsd: 6.5,
    co2KgPerYear: 11,
    notes: {
      en: "Iconic Iraqi tree — thrives in extreme heat, tolerates saline soil, produces fruit.",
      ar: "الشجرة الرمزية للعراق — تتحمل الحرارة الشديدة والتربة المالحة وتنتج ثماراً.",
    },
  },
  sidr: {
    id: "sidr",
    plantId: "olive",
    name: { en: "Sidr (Christ's Thorn)", ar: "السدر" },
    scientific: "Ziziphus spina-christi",
    icon: "/icons/trees/sidr.png",
    color: "hsl(95 55% 45%)",
    tempRange: [-2, 50],
    droughtResistance: 5,
    waterNeed: "very_low",
    waterLitersPerWeek: 25,
    growthRate: "moderate",
    matureHeightM: [8, 15],
    yearsToCanopy: 5,
    soils: ["sandy", "loam", "rocky", "saline"],
    climates: ["south_arid", "central_semi_arid"],
    costUsd: 4.0,
    co2KgPerYear: 14,
    notes: {
      en: "Native sacred tree, deep roots, drought-proof, supports pollinators.",
      ar: "شجرة محلية مقدسة، جذورها عميقة ومقاومة للجفاف وتدعم الملقحات.",
    },
  },
  eucalyptus: {
    id: "eucalyptus",
    plantId: "olive",
    name: { en: "Eucalyptus", ar: "الكينا" },
    scientific: "Eucalyptus camaldulensis",
    icon: "/icons/trees/eucalyptus.png",
    color: "hsl(160 55% 50%)",
    tempRange: [-3, 48],
    droughtResistance: 4,
    waterNeed: "moderate",
    waterLitersPerWeek: 70,
    growthRate: "very_fast",
    matureHeightM: [20, 35],
    yearsToCanopy: 3,
    soils: ["loam", "clay", "sandy"],
    climates: ["central_semi_arid", "north_temperate", "marshlands"],
    costUsd: 2.2,
    co2KgPerYear: 22,
    notes: {
      en: "Fast windbreak species, common along Tigris & Euphrates banks.",
      ar: "شجرة سريعة النمو تستخدم كمصدات رياح على ضفاف دجلة والفرات.",
    },
  },
  conocarpus: {
    id: "conocarpus",
    plantId: "olive",
    name: { en: "Conocarpus", ar: "الكونوكاربس" },
    scientific: "Conocarpus erectus",
    icon: "/icons/trees/conocarpus.png",
    color: "hsl(140 50% 45%)",
    tempRange: [0, 52],
    droughtResistance: 5,
    waterNeed: "low",
    waterLitersPerWeek: 35,
    growthRate: "fast",
    matureHeightM: [8, 12],
    yearsToCanopy: 2,
    soils: ["sandy", "saline", "loam"],
    climates: ["south_arid", "central_semi_arid"],
    costUsd: 2.8,
    co2KgPerYear: 16,
    notes: {
      en: "Heavily used in Baghdad & Basra street greening — heat & dust tolerant.",
      ar: "تُزرع بكثرة في شوارع بغداد والبصرة، تتحمل الحرارة والغبار.",
    },
  },
  albizia: {
    id: "albizia",
    plantId: "oak",
    name: { en: "Albizia (Lebbeck)", ar: "الألبيزيا (الدِّفلة الحريرية)" },
    scientific: "Albizia lebbeck",
    icon: "/icons/trees/albizia.png",
    color: "hsl(110 60% 55%)",
    tempRange: [-2, 47],
    droughtResistance: 4,
    waterNeed: "moderate",
    waterLitersPerWeek: 55,
    growthRate: "fast",
    matureHeightM: [15, 25],
    yearsToCanopy: 4,
    soils: ["loam", "clay", "sandy"],
    climates: ["central_semi_arid", "north_temperate"],
    costUsd: 3.6,
    co2KgPerYear: 19,
    notes: {
      en: "Wide shade canopy, nitrogen-fixing, ideal for parks and avenues.",
      ar: "ظل واسع ومثبتة للنيتروجين، مثالية للحدائق والشوارع.",
    },
  },
  neem: {
    id: "neem",
    plantId: "olive",
    name: { en: "Neem", ar: "النيم" },
    scientific: "Azadirachta indica",
    icon: "/icons/trees/neem.png",
    color: "hsl(130 65% 50%)",
    tempRange: [4, 50],
    droughtResistance: 5,
    waterNeed: "low",
    waterLitersPerWeek: 30,
    growthRate: "fast",
    matureHeightM: [12, 20],
    yearsToCanopy: 3,
    soils: ["sandy", "loam", "rocky"],
    climates: ["south_arid", "central_semi_arid"],
    costUsd: 3.2,
    co2KgPerYear: 17,
    notes: {
      en: "Natural pest repellent, evergreen, well-suited to hot Iraqi summers.",
      ar: "طارد طبيعي للحشرات ودائمة الخضرة وتلائم صيف العراق الحار.",
    },
  },
  acacia: {
    id: "acacia",
    plantId: "acacia",
    name: { en: "Acacia", ar: "السنط (الأكاسيا)" },
    scientific: "Acacia tortilis / nilotica",
    icon: "/icons/trees/acacia.png",
    color: "hsl(85 60% 50%)",
    tempRange: [-2, 50],
    droughtResistance: 5,
    waterNeed: "very_low",
    waterLitersPerWeek: 15,
    growthRate: "moderate",
    matureHeightM: [4, 10],
    yearsToCanopy: 4,
    soils: ["sandy", "rocky", "saline"],
    climates: ["south_arid", "central_semi_arid"],
    costUsd: 1.8,
    co2KgPerYear: 9,
    notes: {
      en: "Anti-desertification staple, fixes nitrogen, feeds livestock.",
      ar: "ركيزة مكافحة التصحر، تثبت النيتروجين وتُستخدم علفاً.",
    },
  },
  olive: {
    id: "olive",
    plantId: "olive",
    name: { en: "Olive", ar: "الزيتون" },
    scientific: "Olea europaea",
    icon: "/icons/trees/olive.png",
    color: "hsl(85 55% 50%)",
    tempRange: [-5, 45],
    droughtResistance: 4,
    waterNeed: "low",
    waterLitersPerWeek: 40,
    growthRate: "slow",
    matureHeightM: [6, 12],
    yearsToCanopy: 7,
    soils: ["loam", "rocky", "clay"],
    climates: ["central_semi_arid", "north_temperate"],
    costUsd: 5.4,
    co2KgPerYear: 13,
    notes: {
      en: "Long-lived, valuable for oil, thrives in northern Mesopotamian basin.",
      ar: "طويلة العمر وقيمة لإنتاج الزيت وتزدهر في شمال بلاد ما بين النهرين.",
    },
  },
  tamarisk: {
    id: "tamarisk",
    plantId: "shrub",
    name: { en: "Tamarisk (Athl)", ar: "الأثل (الطرفاء)" },
    scientific: "Tamarix aphylla",
    icon: "/icons/trees/tamarisk.png",
    color: "hsl(105 50% 45%)",
    tempRange: [-5, 50],
    droughtResistance: 5,
    waterNeed: "very_low",
    waterLitersPerWeek: 12,
    growthRate: "fast",
    matureHeightM: [6, 15],
    yearsToCanopy: 3,
    soils: ["saline", "sandy", "clay"],
    climates: ["south_arid", "marshlands", "central_semi_arid"],
    costUsd: 1.5,
    co2KgPerYear: 10,
    notes: {
      en: "Salt-tolerant — restores degraded saline land in southern Iraq.",
      ar: "تتحمل الملوحة وتُستخدم لاستصلاح الأراضي المالحة جنوب العراق.",
    },
  },
  pomegranate: {
    id: "pomegranate",
    plantId: "olive",
    name: { en: "Pomegranate", ar: "الرمان" },
    scientific: "Punica granatum",
    icon: "/icons/trees/pomegranate.png",
    color: "hsl(0 60% 55%)",
    tempRange: [-10, 45],
    droughtResistance: 4,
    waterNeed: "moderate",
    waterLitersPerWeek: 50,
    growthRate: "moderate",
    matureHeightM: [3, 6],
    yearsToCanopy: 4,
    soils: ["loam", "clay", "sandy"],
    climates: ["central_semi_arid", "north_temperate"],
    costUsd: 4.5,
    co2KgPerYear: 8,
    notes: {
      en: "Iconic fruit tree, drought-tolerant, popular in northern Iraq.",
      ar: "شجرة فاكهة رمزية، تتحمل الجفاف ومنتشرة في شمال العراق.",
    },
  },
};

export const IRAQI_TREE_ORDER: IraqiTreeId[] = [
  "date_palm",
  "sidr",
  "conocarpus",
  "eucalyptus",
  "albizia",
  "neem",
  "acacia",
  "olive",
  "tamarisk",
  "pomegranate",
];

// ----------- Region recommendations -----------

/** Province → ranked list of best-suited Iraqi tree IDs. */
export const PROVINCE_RECOMMENDATIONS: Record<string, IraqiTreeId[]> = {
  // South — extreme heat, salinity, marshes
  "Al-Basrah": ["date_palm", "tamarisk", "conocarpus", "sidr", "neem"],
  "Maysan": ["date_palm", "tamarisk", "eucalyptus", "sidr", "acacia"],
  "Dhi Qar": ["date_palm", "tamarisk", "sidr", "acacia", "conocarpus"],
  "Al-Muthanna": ["acacia", "sidr", "tamarisk", "date_palm", "conocarpus"],

  // Central — semi-arid, Baghdad belt
  "Baghdad": ["conocarpus", "albizia", "eucalyptus", "neem", "date_palm"],
  "Babil": ["date_palm", "conocarpus", "eucalyptus", "albizia", "sidr"],
  "Karbala": ["date_palm", "conocarpus", "albizia", "neem", "sidr"],
  "An-Najaf": ["sidr", "acacia", "date_palm", "tamarisk", "conocarpus"],
  "Al-Qadisiyah": ["date_palm", "conocarpus", "sidr", "albizia", "eucalyptus"],
  "Wasit": ["date_palm", "eucalyptus", "conocarpus", "albizia", "sidr"],
  "Al-Anbar": ["sidr", "acacia", "tamarisk", "date_palm", "conocarpus"],
  "Diyala": ["pomegranate", "olive", "date_palm", "albizia", "eucalyptus"],
  "Salah ad-Din": ["olive", "pomegranate", "albizia", "eucalyptus", "date_palm"],

  // North — temperate, mountain foothills
  "Kirkuk": ["olive", "pomegranate", "albizia", "eucalyptus", "neem"],
  "Nineveh": ["olive", "pomegranate", "albizia", "eucalyptus", "sidr"],
  "Erbil": ["olive", "pomegranate", "albizia", "eucalyptus"],
  "Sulaymaniyah": ["olive", "pomegranate", "albizia"],
  "Duhok": ["olive", "pomegranate", "albizia"],
  "Halabja": ["olive", "pomegranate", "albizia"],
};

/** Heuristic fallback when a province isn't in the map. */
export function recommendByLatitude(lat: number): IraqiTreeId[] {
  if (lat < 31.0) return ["date_palm", "tamarisk", "sidr", "acacia"];
  if (lat < 33.0) return ["date_palm", "conocarpus", "sidr", "neem"];
  if (lat < 35.0) return ["conocarpus", "albizia", "eucalyptus", "neem"];
  return ["olive", "pomegranate", "albizia", "eucalyptus"];
}

export function recommendForProvince(provinceName: string | null, fallbackLat?: number): IraqiTreeId[] {
  if (provinceName && PROVINCE_RECOMMENDATIONS[provinceName]) {
    return PROVINCE_RECOMMENDATIONS[provinceName];
  }
  if (typeof fallbackLat === "number") return recommendByLatitude(fallbackLat);
  return ["date_palm", "conocarpus", "sidr"];
}

/**
 * Auto-pick the best tree for a polygon location based on coordinates.
 * Combines latitude heuristic + simple inland/marshland detection.
 */
export function autoRecommendForLocation(lat: number, lng: number): IraqiTreeId {
  // Marshlands (Hawizeh / Hammar): roughly lng 46.5–47.6, lat 30.5–31.6
  if (lat > 30.4 && lat < 31.7 && lng > 46.5 && lng < 47.7) return "tamarisk";
  if (lat < 30.5) return "date_palm";
  if (lat < 32.5) return "date_palm";
  if (lat < 34.5) return "conocarpus";
  if (lat < 36.0) return "albizia";
  return "olive";
}

// ----------- i18n labels for enums -----------

export const WATER_LABEL: Record<WaterNeed, { en: string; ar: string }> = {
  very_low: { en: "Very low", ar: "منخفض جداً" },
  low: { en: "Low", ar: "منخفض" },
  moderate: { en: "Moderate", ar: "متوسط" },
  high: { en: "High", ar: "مرتفع" },
};

export const GROWTH_LABEL: Record<GrowthRate, { en: string; ar: string }> = {
  slow: { en: "Slow", ar: "بطيء" },
  moderate: { en: "Moderate", ar: "متوسط" },
  fast: { en: "Fast", ar: "سريع" },
  very_fast: { en: "Very fast", ar: "سريع جداً" },
};

export const SOIL_LABEL: Record<SoilType, { en: string; ar: string }> = {
  sandy: { en: "Sandy", ar: "رملية" },
  clay: { en: "Clay", ar: "طينية" },
  loam: { en: "Loam", ar: "طميية" },
  saline: { en: "Saline", ar: "مالحة" },
  rocky: { en: "Rocky", ar: "صخرية" },
};

export const CLIMATE_LABEL: Record<ClimateZone, { en: string; ar: string }> = {
  south_arid: { en: "Southern arid", ar: "الجنوب الجاف" },
  central_semi_arid: { en: "Central semi-arid", ar: "الوسط شبه الجاف" },
  north_temperate: { en: "Northern temperate", ar: "الشمال المعتدل" },
  marshlands: { en: "Marshlands", ar: "الأهوار" },
};
