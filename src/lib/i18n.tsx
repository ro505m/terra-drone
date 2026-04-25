// Minimal i18n with RTL support for English ↔ Arabic.
// Stays in-repo (no extra deps). Exposes a hook + provider.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "en" | "ar";
export type Dir = "ltr" | "rtl";

type Dict = Record<string, { en: string; ar: string }>;

/**
 * Strings used across the app. Keep keys stable — components reference them.
 * Add new keys here; never hardcode user-facing copy elsewhere when avoidable.
 */
export const STRINGS: Dict = {
  app_tagline: {
    en: "Reforesting Iraq — drone by drone.",
    ar: "إعادة تشجير العراق — طائرة تلو الأخرى.",
  },

  // Nav
  nav_mission: { en: "Mission", ar: "المهمة" },
  nav_impact: { en: "Impact", ar: "الأثر" },
  nav_fleet: { en: "Fleet", ar: "الأسطول" },
  cta_launch: { en: "Launch", ar: "إطلاق" },

  // Province
  pick_province: { en: "Pick a province", ar: "اختر محافظة" },
  province_locked: { en: "Locked", ar: "مُثبَّت" },

  // Tree catalog
  tree_catalog: { en: "Iraqi Tree Catalog", ar: "دليل الأشجار العراقية" },
  recommended_for: { en: "Recommended for", ar: "موصى به لـ" },
  all_trees: { en: "All trees", ar: "كل الأشجار" },
  drought: { en: "Drought", ar: "الجفاف" },
  water: { en: "Water", ar: "المياه" },
  soil: { en: "Soil", ar: "التربة" },
  growth: { en: "Growth", ar: "النمو" },
  cost: { en: "Cost", ar: "التكلفة" },
  per_tree: { en: "/tree", ar: "/شجرة" },
  liters_per_week: { en: "L/week", ar: "لتر/أسبوع" },
  height: { en: "Mature height", ar: "الارتفاع" },
  use_this_tree: { en: "Use this tree", ar: "استخدم هذه الشجرة" },
  active: { en: "Active", ar: "مُختار" },

  // Drone fleet
  drone_fleet: { en: "Drone Fleet", ar: "أسطول الطائرات" },
  add_drone: { en: "Add", ar: "إضافة" },
  remove_drone: { en: "Remove", ar: "إزالة" },
  speed: { en: "Speed", ar: "السرعة" },
  capacity: { en: "Capacity", ar: "السعة" },
  flight_time: { en: "Flight", ar: "زمن الطيران" },
  coverage: { en: "Coverage", ar: "التغطية" },
  fleet_total: { en: "Fleet total", ar: "إجمالي الأسطول" },
  local_mode: { en: "Local mode", ar: "الوضع المحلي" },
  local_mode_hint: {
    en: "Operate with limited battery, water and seed reserves.",
    ar: "العمل بموارد بطارية ومياه وبذور محدودة.",
  },

  // Misc
  language: { en: "Language", ar: "اللغة" },
  english: { en: "English", ar: "الإنجليزية" },
  arabic: { en: "Arabic", ar: "العربية" },
};

interface I18nCtx {
  lang: Lang;
  dir: Dir;
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (key: keyof typeof STRINGS) => string;
  /** Helper for bilingual { en, ar } objects. */
  pick: (obj: { en: string; ar: string }) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

const STORAGE_KEY = "arbor.lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === "undefined") return "en";
    const saved = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
    return saved === "ar" || saved === "en" ? saved : "en";
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const toggle = useCallback(() => setLang(lang === "en" ? "ar" : "en"), [lang, setLang]);

  // Apply <html dir> + lang for global RTL flow
  useEffect(() => {
    const dir: Dir = lang === "ar" ? "rtl" : "ltr";
    const html = document.documentElement;
    html.setAttribute("dir", dir);
    html.setAttribute("lang", lang);
  }, [lang]);

  const value = useMemo<I18nCtx>(() => {
    const dir: Dir = lang === "ar" ? "rtl" : "ltr";
    return {
      lang,
      dir,
      setLang,
      toggle,
      t: (key) => (STRINGS[key]?.[lang] ?? String(key)),
      pick: (obj) => obj[lang] ?? obj.en,
    };
  }, [lang, setLang, toggle]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n must be used inside <I18nProvider>");
  return v;
}
