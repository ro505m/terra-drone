// Bilingual metadata for Iraqi provinces.
// Names match those in src/data/iraq-provinces.json (the `name` property).

import provincesData from "@/data/iraq-provinces.json";

export interface ProvinceMeta {
  name: string;        // English / canonical (matches GeoJSON)
  ar: string;          // Arabic display name
  centroid: [number, number];
}

const AR_NAMES: Record<string, string> = {
  "Al-Anbar": "الأنبار",
  "Babil": "بابل",
  "Baghdad": "بغداد",
  "Karbala": "كربلاء",
  "An-Najaf": "النجف",
  "Al-Qadisiyah": "القادسية",
  "Al-Muthanna": "المثنى",
  "Dhi Qar": "ذي قار",
  "Al-Basrah": "البصرة",
  "Maysan": "ميسان",
  "Wasit": "واسط",
  "Diyala": "ديالى",
  "Salah ad-Din": "صلاح الدين",
  "Kirkuk": "كركوك",
  "Nineveh": "نينوى",
  "Erbil": "أربيل",
  "Sulaymaniyah": "السليمانية",
  "Duhok": "دهوك",
  "Halabja": "حلبجة",
};

function centroidOf(coords: number[][][]): [number, number] {
  // Average of first ring vertices — fine for a dropdown helper.
  const ring = coords[0];
  let sx = 0, sy = 0;
  for (const [x, y] of ring) { sx += x; sy += y; }
  return [sx / ring.length, sy / ring.length];
}

export const PROVINCE_META: ProvinceMeta[] = (
  provincesData as GeoJSON.FeatureCollection
).features
  .map((f) => {
    const name = (f.properties as { name: string }).name;
    const geom = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
    const coords = geom.type === "Polygon"
      ? geom.coordinates
      : geom.coordinates[0];
    return {
      name,
      ar: AR_NAMES[name] ?? name,
      centroid: centroidOf(coords as number[][][]),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

export function getProvinceAr(name: string | null): string | null {
  if (!name) return null;
  return AR_NAMES[name] ?? name;
}
