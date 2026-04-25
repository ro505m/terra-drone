import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { CinematicHero } from "@/components/CinematicHero";
import { MapExperience } from "@/components/MapExperience";
import { MissionHUD } from "@/components/MissionHUD";
import { TreeCatalog } from "@/components/TreeCatalog";
import { DroneFleet } from "@/components/DroneFleet";
import { LangToggle } from "@/components/LangToggle";
import { ProvinceSelector } from "@/components/ProvinceSelector";
import { IRAQI_TREES, recommendForProvince, type IraqiTreeId } from "@/lib/iraqiTrees";
import { PROVINCE_META } from "@/lib/provincesMeta";
import { useI18n } from "@/lib/i18n";
import { useMission } from "@/lib/missionContext";

const Index = () => {
  const { t, dir, lang } = useI18n();
  const {
    treeId, provinceName, areaHa,
    setTreeId, setProvinceName, setAreaHa,
  } = useMission();

  const mapSectionRef = useRef<HTMLElement>(null);
  const sectionLabelRef = useRef<HTMLDivElement>(null);

  const scrollToMap = () => {
    mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // When province locks, refresh tree recommendation
  const handleProvinceLock = (info: { name: string; centroid: [number, number] } | null) => {
    if (!info) {
      setProvinceName(null);
      return;
    }
    setProvinceName(info.name);
    const recs = recommendForProvince(info.name, info.centroid[1]);
    if (recs[0]) setTreeId(recs[0] as IraqiTreeId);
  };

  // Reveal animations on scroll
  useEffect(() => {
    if (!sectionLabelRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            gsap.from(e.target.children, {
              y: 24,
              opacity: 0,
              duration: 0.9,
              ease: "expo.out",
              stagger: 0.08,
            });
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.25 }
    );
    obs.observe(sectionLabelRef.current);
    return () => obs.disconnect();
  }, []);

  const provinceCentroidLat = (() => {
    if (!provinceName) return undefined;
    const meta = PROVINCE_META.find((p) => p.name === provinceName);
    return meta?.centroid?.[1];
  })();

  return (
    <main className="relative" dir={dir}>
      {/* Top nav */}
      <header className="fixed top-0 inset-x-0 z-50 px-6 py-4">
        <div className="container mx-auto flex items-center justify-between gap-3">
          <a href="/" className="flex items-center gap-2.5 group" aria-label="ARBOR home">
            <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary shadow-glow-soft">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                <path d="M12 2L4 14h5l-3 8 9-12h-5l3-8z" fill="hsl(220 50% 4%)" />
              </svg>
            </span>
            <span className="font-display text-lg tracking-wide">ARBOR</span>
          </a>
          <nav className="hidden md:flex items-center gap-1 glass-subtle rounded-full px-2 py-1.5 text-sm">
            <a href="#map" className="px-3 py-1.5 rounded-full hover:bg-primary/10 transition-colors">{t("nav_mission")}</a>
            <a href="#trees" className="px-3 py-1.5 rounded-full hover:bg-primary/10 transition-colors">{lang === "ar" ? "الأشجار" : "Trees"}</a>
            <a href="#fleet" className="px-3 py-1.5 rounded-full hover:bg-primary/10 transition-colors">{t("nav_fleet")}</a>
            <a href="#impact" className="px-3 py-1.5 rounded-full hover:bg-primary/10 transition-colors">{t("nav_impact")}</a>
          </nav>
          <div className="flex items-center gap-2">
            <ProvinceSelector
              options={PROVINCE_META}
              value={provinceName}
              onSelect={(n) => setProvinceName(n)}
              className="hidden sm:block"
            />
            <LangToggle />
            <button
              onClick={scrollToMap}
              className="px-4 py-2 rounded-full bg-gradient-primary text-primary-foreground text-sm font-medium hover-lift"
            >
              {t("cta_launch")}
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <CinematicHero onStart={scrollToMap} />

      {/* Mission section */}
      <section
        id="map"
        ref={mapSectionRef}
        className="relative py-20 lg:py-28"
        aria-label="Mission planner"
      >
        <div className="container mx-auto">
          <div ref={sectionLabelRef} className="max-w-2xl mb-10">
            <p className="text-[11px] tracking-[0.3em] uppercase text-primary/80 font-mono">02 — {t("nav_mission")}</p>
            <h2 className="font-display text-display-lg mt-3 text-balance">
              {lang === "ar"
                ? "اختر محافظتك. ارسم منطقتك. أطلق السرب."
                : "Pick a province. Draw your area. Deploy the swarm."}
            </h2>
            <p className="mt-4 text-muted-foreground text-pretty">
              {lang === "ar"
                ? "اختر محافظة عراقية لقفل منطقة التشجير، ثم ارسم حدود الأرض وراقب المهمة تنطلق في الوقت الفعلي."
                : "Lock an Iraqi province, outline the parcel you want reforested, then watch your drone fleet deploy in real time."}
            </p>
          </div>

          <div className="grid lg:grid-cols-[1fr_auto] gap-6 items-start">
            <div className="relative h-[640px] rounded-2xl glass overflow-hidden vignette">
              <MapExperience
                onAreaChange={setAreaHa}
                externalProvinceName={provinceName}
                onProvinceLock={handleProvinceLock}
              />
            </div>
            <MissionHUD />
          </div>
        </div>
      </section>

      {/* Iraqi Tree Catalog */}
      <section id="trees" className="relative py-20 border-t border-border/50">
        <div className="container mx-auto">
          <div className="max-w-2xl mb-10">
            <p className="text-[11px] tracking-[0.3em] uppercase text-primary/80 font-mono">
              03 — {lang === "ar" ? "الأشجار العراقية" : "Iraqi flora"}
            </p>
            <h2 className="font-display text-display-lg mt-3 text-balance">
              {lang === "ar"
                ? "أشجار محلية تتحمل مناخ العراق."
                : "Local trees, tuned to Iraq's climate."}
            </h2>
            <p className="mt-4 text-muted-foreground text-pretty">
              {lang === "ar"
                ? "نخيل التمر، السدر، الكونوكاربس، النيم، الأكاسيا — كل شجرة تأتي مع بيانات الجفاف والتربة والمياه."
                : "Date palms, Sidr, Conocarpus, Neem, Acacia — each species ships with drought, soil and water data drawn from real Iraqi planting programs."}
            </p>
          </div>

          <div className="grid lg:grid-cols-[1fr_1fr] gap-6 items-start">
            <TreeCatalog
              provinceName={provinceName}
              centroidLat={provinceCentroidLat}
              activeId={treeId}
              onSelect={(id) => setTreeId(id)}
            />

            {/* Live preview of the active tree */}
            <article className="glass rounded-2xl p-6 min-h-[520px] flex flex-col gap-4">
              <ActiveTreePreview id={treeId} />
            </article>
          </div>
        </div>
      </section>

      {/* Drone Fleet */}
      <section id="fleet" className="relative py-20 border-t border-border/50">
        <div className="container mx-auto">
          <div className="max-w-2xl mb-10">
            <p className="text-[11px] tracking-[0.3em] uppercase text-primary/80 font-mono">
              04 — {t("nav_fleet")}
            </p>
            <h2 className="font-display text-display-lg mt-3 text-balance">
              {lang === "ar"
                ? "أسطول طائرات مُهيَّأ للعراق."
                : "A drone swarm built for Iraq."}
            </h2>
            <p className="mt-4 text-muted-foreground text-pretty">
              {lang === "ar"
                ? "من سلسلة DJI Agras للبذار والرش، إلى منصات محلية الصنع. اختر مزيج الطائرات لمهمتك."
                : "From DJI Agras heavy-lift seeders to locally-built hybrids. Compose the right mix for your mission."}
            </p>
          </div>

          <div className="grid lg:grid-cols-[1fr_1fr] gap-6 items-start">
            <DroneFleet />
            <FleetIllustration />
          </div>
        </div>
      </section>

      {/* Impact strip */}
      <section id="impact" className="relative py-20 border-t border-border/50">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-3 gap-6">
            {(lang === "ar"
              ? [
                  { k: "إعادة التشجير", t: "أنواع محلية أولاً", d: "تزرع الطائرات أنواعاً تتلاءم مع البيئة العراقية: نخيل، سدر، أكاسيا، كونوكاربس." },
                  { k: "احتجاز الكربون", t: "كميات قابلة للقياس", d: "تسجل كل مهمة كمية ثاني أكسيد الكربون المحتجزة بناءً على نوع الشجرة وكثافتها ومعدل بقائها." },
                  { k: "الشفافية", t: "تبرع لكل شجرة", d: "ترى بالضبط ما يشتريه كل دولار من شتلات وزمن طيران وإحداثيات تشجير موثقة." },
                ]
              : [
                  { k: "Reforestation", t: "Native species first", d: "Drones plant species matched to Iraq's regions — date palms, sidr, conocarpus, acacia — with seed pods designed for arid soil." },
                  { k: "Carbon capture", t: "Measurable CO₂ /yr", d: "Each mission logs predicted CO₂ sequestration based on tree species, density, and survival rates." },
                  { k: "Transparent", t: "Donation by the tree", d: "You see exactly what each dollar buys — saplings, drone time, and verified planting coordinates." },
                ]
            ).map((c, i) => (
              <article key={i} className="glass rounded-2xl p-6 hover-lift">
                <p className="text-[10px] tracking-[0.25em] uppercase text-primary/80 font-mono">{c.k}</p>
                <h3 className="font-display text-2xl mt-2">{c.t}</h3>
                <p className="text-muted-foreground mt-3 text-sm leading-relaxed">{c.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-10">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} ARBOR — {t("app_tagline")}</p>
          <p className="font-mono">v1.2 · build·iraq·unified</p>
        </div>
      </footer>
    </main>
  );
};

// --- Active tree detail preview ---
const ActiveTreePreview = ({ id }: { id: IraqiTreeId }) => {
  const { pick, lang } = useI18n();
  const tree = IRAQI_TREES[id];
  return (
    <>
      <div className="flex items-start gap-4">
        <span className="text-6xl leading-none" style={{ filter: `drop-shadow(0 0 24px ${tree.color})` }}>
          {tree.emoji}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-3xl leading-tight">{pick(tree.name)}</h3>
          <p className="text-sm text-muted-foreground italic mt-0.5">{tree.scientific}</p>
          <p className="text-sm mt-3 leading-relaxed">{pick(tree.notes)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
        <Cell label={lang === "ar" ? "الحرارة" : "Temp"} value={`${tree.tempRange[0]}°→${tree.tempRange[1]}°C`} />
        <Cell label={lang === "ar" ? "الجفاف" : "Drought"} value={`${tree.droughtResistance}/5`} />
        <Cell label={lang === "ar" ? "ري" : "Water"} value={`${tree.waterLitersPerWeek} L/w`} />
        <Cell label={lang === "ar" ? "الارتفاع" : "Height"} value={`${tree.matureHeightM[0]}–${tree.matureHeightM[1]} m`} />
        <Cell label={lang === "ar" ? "حتى المظلة" : "To canopy"} value={`${tree.yearsToCanopy} y`} />
        <Cell label="CO₂/yr" value={`${tree.co2KgPerYear} kg`} />
      </div>

      <div className="mt-auto rounded-xl bg-background-deep/60 border border-border/60 p-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {lang === "ar" ? "تكلفة الشتلة" : "Sapling cost"}
          </p>
          <p className="font-display text-3xl mt-0.5 num-shimmer">${tree.costUsd.toFixed(2)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {lang === "ar" ? "النمو" : "Growth"}
          </p>
          <p className="font-mono text-sm mt-0.5 capitalize">{tree.growthRate.replace("_", " ")}</p>
        </div>
      </div>
    </>
  );
};

const Cell = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg bg-background-deep/40 border border-border/50 px-3 py-2">
    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="font-mono text-sm mt-0.5 text-foreground/90 truncate">{value}</p>
  </div>
);

const FleetIllustration = () => {
  const { lang } = useI18n();
  return (
    <article className="glass rounded-2xl p-6 min-h-[480px] flex flex-col gap-4">
      <p className="text-[10px] tracking-[0.25em] uppercase text-primary/80 font-mono">
        {lang === "ar" ? "كيف تعمل المهمة" : "Mission anatomy"}
      </p>
      <h3 className="font-display text-2xl">
        {lang === "ar" ? "إقلاع · بذار · مراقبة" : "Take off · seed · monitor"}
      </h3>

      <ol className="mt-2 space-y-3 text-sm">
        {(lang === "ar"
          ? [
              "تنطلق الطائرات الكبيرة من قاعدة محمولة قرب المنطقة المختارة.",
              "تتدفق طائرات السرب بأنماط متعرجة لتغطية كاملة للحدود.",
              "تُسقط كبسولات بذور مكيّفة لمحاصيل بيئية محددة.",
              "تتابع طائرات المراقبة معدّل الإنبات أسبوعياً.",
            ]
          : [
              "Heavy seeders take off from a mobile base near the target zone.",
              "Swarm drones sweep in lawn-mower patterns for full perimeter coverage.",
              "Seed pods conditioned for the chosen species are released at ~3 m altitude.",
              "Survey drones return weekly to monitor germination & soil moisture.",
            ]
        ).map((line, i) => (
          <li key={i} className="flex gap-3">
            <span className="h-6 w-6 rounded-full bg-primary/15 text-primary text-xs font-mono grid place-items-center shrink-0">
              {i + 1}
            </span>
            <span className="text-foreground/85 leading-relaxed">{line}</span>
          </li>
        ))}
      </ol>

      <div className="mt-auto hairline" />
      <p className="text-[11px] text-muted-foreground leading-snug">
        {lang === "ar"
          ? "يمكن للأسطول العمل في الوضع المحلي بموارد محدودة، وهو وضع مصمم للمشاريع المجتمعية."
          : "The fleet can run in local mode with limited battery, water and seed reserves — designed for community-led projects."}
      </p>
    </article>
  );
};

export default Index;
