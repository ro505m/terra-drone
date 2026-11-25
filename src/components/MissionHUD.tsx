import { useEffect, useMemo, useRef } from "react";
import { gsap } from "gsap";
import {
  Rocket, Sparkles, AlertTriangle, Trees, Flame, Droplets, Activity,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { AnimatedNumber } from "./AnimatedNumber";
import { useMission } from "@/lib/missionContext";
import { IRAQI_TREES } from "@/lib/iraqiTrees";
import { IRAQI_DRONES } from "@/lib/iraqiDrones";
import { fmtUsd, fmtMin, activeDronesList } from "@/lib/iraqPricing";
import { useI18n } from "@/lib/i18n";

interface Props {
  className?: string;
}

/**
 * MissionHUD — unified Iraqi mission planner.
 * Binds tree species (from TreeCatalog) + drone fleet (from DroneFleet) +
 * quantity + iraq-mode into a single live cost & duration estimate.
 */
export const MissionHUD = ({ className }: Props) => {
  const { t, pick, lang, dir } = useI18n();
  const {
    treeId, quantity, iraqMode, includeMaintenance,
    droneCounts, areaHa, phase, treesPlanted,
    breakdown,
    setQuantity, setIraqMode, setIncludeMaintenance,
    launchMission,
  } = useMission();

  const tree = IRAQI_TREES[treeId];
  const activeDrones = useMemo(() => activeDronesList(droneCounts), [droneCounts]);
  const running = phase === "running";

  const seederSummary = activeDrones.filter((x) => x.d.role === "seeder" || x.d.role === "hybrid");
  const supportSummary = activeDrones.filter((x) => x.d.role === "sprayer" || x.d.role === "monitor");

  const canLaunch =
    quantity > 0 &&
    breakdown.droneSeederCount > 0 &&
    !running;

  const blockingReason: string | null = (() => {
    if (running) return lang === "ar" ? "المهمة قيد التنفيذ…" : "Mission running…";
    if (quantity <= 0) return lang === "ar" ? "حدد عدد الأشجار" : "Set tree quantity";
    if (breakdown.droneSeederCount === 0) return lang === "ar" ? "اختر طائرة بذّار أو هجينة" : "Add a Seeder or Hybrid drone";
    return null;
  })();

  const headerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!headerRef.current) return;
    gsap.fromTo(
      headerRef.current.querySelectorAll("[data-r]"),
      { y: 6, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: "expo.out", stagger: 0.05 }
    );
  }, [treeId, breakdown.grandTotal]);

  const grandTooHigh = quantity >= 500 && breakdown.grandTotal > 250;

  return (
    <aside
      className={`glass rounded-2xl p-6 w-full max-w-sm flex flex-col gap-5 animate-scale-in ${className ?? ""}`}
      aria-label="Mission Control"
      dir={dir}
    >
      <header className="flex items-start justify-between">
        <div>
          <p className="text-[10px] tracking-[0.25em] uppercase text-primary/80 font-mono">
            {lang === "ar" ? "مركز التحكم" : "Mission Control"}
          </p>
          <h2 className="font-display text-2xl mt-1">
            {lang === "ar" ? "خطة الزراعة" : "Plant the mission"}
          </h2>
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full glass-subtle text-[10px] uppercase tracking-wider">
          <span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-primary animate-glow-pulse" : "bg-muted-foreground"}`} />
          {running ? (lang === "ar" ? "نشط" : "Live") : (lang === "ar" ? "استعداد" : "Standby")}
        </div>
      </header>

      {/* Bound tree summary */}
      <section className="rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-primary/80 font-mono">
            {lang === "ar" ? "الشجرة المُختارة" : "Active species"}
          </p>
          <a href="#trees" className="text-[10px] text-primary/70 hover:text-primary underline-offset-2 hover:underline">
            {lang === "ar" ? "تغيير" : "Change"}
          </a>
        </div>
        <div className="flex items-center gap-3">
          {/* <span
            className="text-3xl leading-none"
            style={{ filter: `drop-shadow(0 0 12px ${tree.color})` }}
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
            <p className="font-display text-base leading-tight truncate">{pick(tree.name)}</p>
            <p className="text-[11px] text-muted-foreground italic truncate">{tree.scientific}</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5 text-[9px] uppercase tracking-wider">
              <Chip><Flame className="h-2.5 w-2.5" /> {tree.tempRange[1]}°C</Chip>
              <Chip><Droplets className="h-2.5 w-2.5" /> {tree.waterLitersPerWeek}L/w</Chip>
              <Chip><Sparkles className="h-2.5 w-2.5" /> {fmtUsd(breakdown.treeUnitCost)}</Chip>
            </div>
          </div>
        </div>
      </section>

      {/* Quantity slider */}
      <section>
        <div className="flex items-baseline justify-between">
          <Label>{lang === "ar" ? "عدد الأشجار" : "Tree quantity"}</Label>
          <span className="font-mono text-sm text-primary">
            <AnimatedNumber value={quantity} duration={0.4} /> <span className="text-muted-foreground">/ 5000</span>
          </span>
        </div>
        <Slider
          min={50}
          max={5000}
          step={50}
          value={[quantity]}
          disabled={running}
          onValueChange={(v) => setQuantity(v[0])}
          className="mt-3"
        />
        <div className="flex justify-between mt-1.5 text-[9px] font-mono text-muted-foreground/80">
          <span>50</span><span>500</span><span>1k</span><span>5k</span>
        </div>
      </section>

      {/* Bound fleet summary */}
      <section className="rounded-xl border border-border/60 bg-background-deep/60 px-3.5 py-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-mono inline-flex items-center gap-1.5">
            <Activity className="h-3 w-3" />
            {lang === "ar" ? "الأسطول النشط" : "Active fleet"}
          </p>
          <a href="#fleet" className="text-[10px] text-primary/70 hover:text-primary underline-offset-2 hover:underline">
            {lang === "ar" ? "تعديل" : "Configure"}
          </a>
        </div>

        {activeDrones.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            {lang === "ar" ? "لم يتم اختيار طائرات بعد." : "No drones selected yet."}
          </p>
        ) : (
          <div className="space-y-1.5">
            {seederSummary.map(({ d, n }) => (
              <DroneRow key={d.id} name={pick(d.name)} role={lang === "ar" ? "بذّار" : "Planter"} n={n} color={d.color} />
            ))}
            {supportSummary.map(({ d, n }) => (
              <DroneRow key={d.id} name={pick(d.name)} role={d.role === "monitor" ? (lang === "ar" ? "استطلاع" : "Survey") : (lang === "ar" ? "رش" : "Spray")} n={n} color={d.color} />
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 mt-3 text-[10px] font-mono">
          <Stat label={lang === "ar" ? "بذّار" : "Planters"} value={String(breakdown.droneSeederCount)} />
          <Stat label={lang === "ar" ? "تغطية" : "Coverage"} value={`${breakdown.coverageHa.toFixed(0)}ha`} />
          <Stat label={lang === "ar" ? "سعة" : "Capacity"} value={`${breakdown.totalCapacity}u`} />
        </div>
      </section>

      {/* Toggles */}
      <section className="grid grid-cols-2 gap-2">
        <Toggle
          checked={iraqMode}
          onChange={setIraqMode}
          icon={<Flame className="h-3 w-3" />}
          title={lang === "ar" ? "وضع العراق" : "Iraq mode"}
          hint={lang === "ar" ? "حر شديد · غبار" : "Heat & dust"}
          disabled={running}
        />
        <Toggle
          checked={includeMaintenance}
          onChange={setIncludeMaintenance}
          icon={<Droplets className="h-3 w-3" />}
          title={lang === "ar" ? "صيانة" : "Maintenance"}
          hint={lang === "ar" ? "ري السنة الأولى" : "1st-year care"}
          disabled={running}
        />
      </section>

      {/* Cost breakdown */}
      <section ref={headerRef}>
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
          {lang === "ar" ? "تفاصيل التكلفة" : "Cost breakdown"}
        </p>
        <div className="space-y-1.5">
          <Row
            dataR="trees"
            label={`${pick(tree.name)} × ${quantity}`}
            sub={breakdown.treeDiscountPct > 0
              ? `${fmtUsd(breakdown.treeUnitCost)} (−${(breakdown.treeDiscountPct * 100).toFixed(0)}%)`
              : `${fmtUsd(breakdown.treeUnitCost)}/tree`}
            value={breakdown.treeTotal}
          />
          <Row
            dataR="drones"
            label={lang === "ar" ? "تشغيل الطائرات" : "Drone operations"}
            sub={`${breakdown.droneActiveCount} drones · ${fmtMin(breakdown.durationMinutes)}`}
            value={breakdown.droneTotal}
          />
          {includeMaintenance && breakdown.maintenanceTotal > 0 && (
            <Row
              dataR="maint"
              label={lang === "ar" ? "صيانة وري" : "Water & maintenance"}
              sub={lang === "ar" ? "سنة أولى" : "First year"}
              value={breakdown.maintenanceTotal}
            />
          )}
        </div>

        <div className="hairline my-3" />

        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {lang === "ar" ? "الإجمالي" : "Total mission"}
            </p>
            <p className="font-display text-4xl mt-1 num-shimmer">
              <AnimatedNumber value={breakdown.grandTotal} prefix="$" decimals={breakdown.grandTotal < 100 ? 2 : 0} duration={0.7} />
            </p>
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
              {fmtUsd(breakdown.costPerTree)} / {lang === "ar" ? "شجرة" : "tree"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {lang === "ar" ? "المدة" : "Duration"}
            </p>
            <p className="font-mono text-lg text-primary">
              <AnimatedNumber value={breakdown.durationMinutes} decimals={1} suffix=" min" duration={0.6} />
            </p>
            {areaHa > 0 && (
              <p className="text-[9px] text-muted-foreground font-mono mt-0.5">
                {areaHa.toFixed(2)} ha
              </p>
            )}
          </div>
        </div>

        {grandTooHigh && (
          <div className="mt-3 rounded-md bg-destructive/10 border border-destructive/30 px-2.5 py-1.5 flex items-start gap-2">
            <AlertTriangle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
            <p className="text-[10px] text-destructive leading-snug">
              {lang === "ar" ? "تجاوز الميزانية المرجعية ($250 لـ 500 شجرة)." : "Above the $250-per-500-trees target."}
            </p>
          </div>
        )}

        {breakdown.warnings.map((w, i) => (
          <div key={i} className="mt-2 rounded-md bg-secondary/10 border border-secondary/30 px-2.5 py-1.5 flex items-start gap-2">
            <AlertTriangle className="h-3 w-3 text-secondary mt-0.5 shrink-0" />
            <p className="text-[10px] text-secondary/90 leading-snug">{w}</p>
          </div>
        ))}
      </section>

      {/* Live mission stats */}
      {(running || phase === "complete") && (
        <section className="rounded-xl bg-background-deep/70 border border-primary/30 px-3.5 py-3 animate-fade-in">
          <p className="text-[10px] uppercase tracking-[0.2em] text-primary/80 font-mono mb-2 inline-flex items-center gap-1.5">
            <Trees className="h-3 w-3" /> {lang === "ar" ? "بث المهمة" : "Live telemetry"}
          </p>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <Stat
              label={lang === "ar" ? "زُرعت" : "Planted"}
              value={`${treesPlanted} / ${quantity}`}
            />
            <Stat
              label={lang === "ar" ? "متبقي" : "Remaining"}
              value={String(Math.max(0, quantity - treesPlanted))}
            />
          </div>
        </section>
      )}

      {/* Launch */}
      <button
        onClick={launchMission}
        disabled={!canLaunch}
        className="relative px-5 py-3.5 rounded-xl bg-gradient-primary text-primary-foreground font-medium hover-lift disabled:opacity-40 disabled:cursor-not-allowed shadow-glow-soft inline-flex items-center justify-center gap-2"
      >
        <Rocket className="h-4 w-4" />
        {blockingReason ?? (lang === "ar" ? `إطلاق المهمة · ${fmtUsd(breakdown.grandTotal)}` : `Start Mission · ${fmtUsd(breakdown.grandTotal)}`)}
      </button>
    </aside>
  );
};

// --- Sub-components ---

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{children}</p>
);

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-background-deep/70 text-foreground/80 font-mono">
    {children}
  </span>
);

const Row = ({ dataR, label, sub, value }: { dataR: string; label: string; sub: string; value: number }) => (
  <div data-r={dataR} className="flex items-center justify-between py-0.5">
    <div className="min-w-0">
      <p className="text-sm text-foreground/90 truncate">{label}</p>
      <p className="text-[10px] text-muted-foreground font-mono truncate">{sub}</p>
    </div>
    <p className="font-mono text-sm shrink-0 ml-2">
      <AnimatedNumber value={value} prefix="$" decimals={value < 100 ? 2 : 0} duration={0.5} />
    </p>
  </div>
);

const DroneRow = ({ name, role, n, color }: { name: string; role: string; n: number; color: string }) => (
  <div className="flex items-center justify-between text-[11px]">
    <div className="flex items-center gap-2 min-w-0">
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      <span className="truncate text-foreground/85">{name}</span>
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground shrink-0">{role}</span>
    </div>
    <span className="font-mono text-primary shrink-0">×{n}</span>
  </div>
);

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md bg-background-deep/40 px-2 py-1.5 border border-border/50">
    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="font-mono text-sm text-foreground/90 mt-0.5 truncate">{value}</p>
  </div>
);

const Toggle = ({
  checked, onChange, icon, title, hint, disabled,
}: {
  checked: boolean; onChange: (v: boolean) => void;
  icon: React.ReactNode; title: string; hint: string; disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={() => !disabled && onChange(!checked)}
    disabled={disabled}
    className={[
      "rounded-xl border px-3 py-2.5 text-start transition-all",
      checked
        ? "border-primary/50 bg-primary/10 shadow-glow-soft"
        : "border-border bg-card/40 hover:border-primary/30",
      disabled && "opacity-50 cursor-not-allowed",
    ].join(" ")}
    aria-pressed={checked}
  >
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
      <span className={checked ? "text-primary" : "text-muted-foreground"}>{icon}</span>
      <span className={checked ? "text-foreground" : "text-muted-foreground"}>{title}</span>
    </div>
    <p className="text-[10px] text-muted-foreground/80 mt-0.5">{hint}</p>
  </button>
);
