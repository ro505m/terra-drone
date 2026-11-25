import { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { Sparkles, Droplets, Mountain, Sprout, Thermometer, Coins } from "lucide-react";
import {
  IRAQI_TREES,
  IRAQI_TREE_ORDER,
  recommendForProvince,
  WATER_LABEL,
  GROWTH_LABEL,
  SOIL_LABEL,
  type IraqiTreeId,
} from "@/lib/iraqiTrees";
import { useI18n } from "@/lib/i18n";

interface Props {
  /** Currently locked province name, or null. */
  provinceName: string | null;
  /** Latitude of the locked region centroid (for fallback recommendation). */
  centroidLat?: number;
  /** Currently active tree id. */
  activeId: IraqiTreeId | null;
  onSelect: (id: IraqiTreeId) => void;
  className?: string;
}

/**
 * TreeCatalog — bilingual, climate-aware tree picker.
 * - Highlights region-recommended trees first.
 * - Shows water/soil/growth/cost in localized units.
 */
export const TreeCatalog = ({ provinceName, centroidLat, activeId, onSelect, className }: Props) => {
  const { t, pick, dir, lang } = useI18n();
  const [filter, setFilter] = useState<"recommended" | "all">(provinceName ? "recommended" : "all");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFilter(provinceName ? "recommended" : "all");
  }, [provinceName]);

  const recommended = useMemo(
    () => recommendForProvince(provinceName, centroidLat),
    [provinceName, centroidLat]
  );

  const ids: IraqiTreeId[] = useMemo(() => {
    if (filter === "recommended") return recommended;
    // Sort recommended first when showing all
    const seen = new Set<IraqiTreeId>();
    return [...recommended.filter((i) => (seen.add(i), true)),
            ...IRAQI_TREE_ORDER.filter((i) => !seen.has(i))];
  }, [filter, recommended]);

  // Animate cards in on filter change
  useEffect(() => {
    if (!listRef.current) return;
    gsap.fromTo(
      listRef.current.children,
      { y: 8, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.45, ease: "expo.out", stagger: 0.04 }
    );
  }, [filter, ids.length]);

  return (
    <section
      className={`glass rounded-2xl p-5 w-full max-w-sm flex flex-col gap-4 ${className ?? ""}`}
      aria-label={t("tree_catalog")}
      dir={dir}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] tracking-[0.25em] uppercase text-primary/80 font-mono inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            {t("tree_catalog")}
          </p>
          <h3 className="font-display text-lg mt-1 leading-tight">
            {provinceName
              ? `${t("recommended_for")} ${provinceName}`
              : t("all_trees")}
          </h3>
        </div>
        <div className="flex items-center gap-1 glass-subtle rounded-full p-0.5 text-[10px] uppercase tracking-wider">
          <button
            onClick={() => setFilter("recommended")}
            disabled={!provinceName}
            className={[
              "px-2.5 py-1 rounded-full transition-colors",
              filter === "recommended" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground",
              !provinceName && "opacity-40 cursor-not-allowed",
            ].join(" ")}
          >
            ★
          </button>
          <button
            onClick={() => setFilter("all")}
            className={[
              "px-2.5 py-1 rounded-full transition-colors",
              filter === "all" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {t("all_trees")}
          </button>
        </div>
      </header>

      <div ref={listRef} className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1 -mr-1">
        {ids.map((id) => {
          const tree = IRAQI_TREES[id];
          const isRec = recommended.includes(id);
          const isActive = activeId === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={[
                "group relative text-start rounded-xl p-3 border transition-all hover-lift",
                isActive
                  ? "border-primary/60 bg-primary/10 shadow-glow-soft"
                  : "border-border bg-card/40 hover:border-primary/30",
              ].join(" ")}
              aria-pressed={isActive}
            >
              <div className="flex items-start gap-3">
                {/* <span
                  className="text-2xl leading-none mt-0.5 shrink-0"
                  style={{ filter: `drop-shadow(0 0 8px ${tree.color})` }}
                >
                  {tree.emoji}
                </span> */}
                <img
                  src={tree.icon}
                  alt={pick(tree.name)}
                  className="text-2xl leading-none mt-0.5 shrink-0"
                  style={{ filter: `drop-shadow(0 0 8px ${tree.color})` }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-display text-base leading-tight">
                      {pick(tree.name)}
                    </p>
                    {isRec && (
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-mono">
                        ★
                      </span>
                    )}
                    {isActive && (
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-mono">
                        {t("active")}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground italic mt-0.5 truncate">
                    {tree.scientific}
                  </p>
                  <p className="text-[11px] text-foreground/75 mt-1.5 leading-snug">
                    {pick(tree.notes)}
                  </p>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2.5 text-[10px] font-mono">
                    <Stat
                      icon={<Thermometer className="h-3 w-3" />}
                      label={t("drought")}
                      value={"●".repeat(tree.droughtResistance) + "○".repeat(5 - tree.droughtResistance)}
                    />
                    <Stat
                      icon={<Droplets className="h-3 w-3" />}
                      label={t("water")}
                      value={pick(WATER_LABEL[tree.waterNeed])}
                    />
                    <Stat
                      icon={<Sprout className="h-3 w-3" />}
                      label={t("growth")}
                      value={pick(GROWTH_LABEL[tree.growthRate])}
                    />
                    <Stat
                      icon={<Mountain className="h-3 w-3" />}
                      label={t("soil")}
                      value={tree.soils.slice(0, 2).map((s) => pick(SOIL_LABEL[s])).join(" · ")}
                    />
                    <Stat
                      icon={<Coins className="h-3 w-3" />}
                      label={t("cost")}
                      value={`$${tree.costUsd.toFixed(1)}${t("per_tree")}`}
                    />
                    <Stat
                      label={t("height")}
                      value={`${tree.matureHeightM[0]}–${tree.matureHeightM[1]} m`}
                    />
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground/80 leading-snug mt-1">
        {lang === "ar"
          ? "بيانات الأشجار مُجمَّعة من إرشادات وزارة الزراعة العراقية ومصادر مفتوحة."
          : "Tree data compiled from Iraqi Ministry of Agriculture guidelines and open sources."}
      </p>
    </section>
  );
};

const Stat = ({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) => (
  <div className="flex items-center gap-1.5 min-w-0">
    <span className="text-muted-foreground inline-flex items-center gap-1 shrink-0">
      {icon}
      <span className="text-[9px] uppercase tracking-wider">{label}</span>
    </span>
    <span className="text-foreground/85 truncate">{value}</span>
  </div>
);
