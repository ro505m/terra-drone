import { useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { TREE_PROFILES, estimate, formatCurrency, formatNumber, type MissionConfig, type TreeSpecies } from "@/lib/pricing";
import { AnimatedNumber } from "./AnimatedNumber";

interface Props {
  config: MissionConfig;
  onChange: (next: MissionConfig) => void;
  running: boolean;
  className?: string;
}

/**
 * MissionHUD — floating glass control panel
 * - Drone count, density, tree species
 * - Live cost estimator with animated counters
 */
export const MissionHUD = ({ config, onChange, running, className }: Props) => {
  const result = useMemo(() => estimate(config), [config]);

  const set = <K extends keyof MissionConfig>(k: K, v: MissionConfig[K]) =>
    onChange({ ...config, [k]: v });

  const profile = TREE_PROFILES[config.species];

  return (
    <aside
      className={`glass rounded-2xl p-6 w-full max-w-sm flex flex-col gap-6 animate-scale-in ${className ?? ""}`}
      aria-label="Mission Control"
    >
      <header className="flex items-start justify-between">
        <div>
          <p className="text-[10px] tracking-[0.25em] uppercase text-primary/80 font-mono">Mission Control</p>
          <h2 className="font-display text-2xl mt-1">Configure Fleet</h2>
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full glass-subtle text-[10px] uppercase tracking-wider">
          <span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-primary animate-glow-pulse" : "bg-muted-foreground"}`} />
          {running ? "Live" : "Standby"}
        </div>
      </header>

      {/* Tree species */}
      <section>
        <Label>Tree species</Label>
        <div className="grid grid-cols-5 gap-1.5 mt-2">
          {(Object.keys(TREE_PROFILES) as TreeSpecies[]).map((s) => {
            const p = TREE_PROFILES[s];
            const active = config.species === s;
            return (
              <button
                key={s}
                onClick={() => set("species", s)}
                disabled={running}
                className={[
                  "relative rounded-lg px-1.5 py-2 text-center transition-all duration-300 hover-lift",
                  "border",
                  active
                    ? "border-primary/60 bg-primary/10 shadow-glow-soft"
                    : "border-border bg-card/40 hover:border-primary/30",
                  running && "opacity-60 cursor-not-allowed",
                ].join(" ")}
                aria-pressed={active}
                title={`${p.label} · $${p.costPerTree}/tree`}
              >
                <div className="text-xl leading-none">{p.emoji}</div>
                <div className="text-[10px] font-medium mt-1 truncate">{p.label}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Drones */}
      <section>
        <div className="flex items-baseline justify-between">
          <Label>Drone fleet size</Label>
          <span className="font-mono text-sm text-primary">
            <AnimatedNumber value={config.drones} duration={0.4} /> <span className="text-muted-foreground">/ 20</span>
          </span>
        </div>
        <Slider
          min={1}
          max={20}
          step={1}
          value={[config.drones]}
          disabled={running}
          onValueChange={(v) => set("drones", v[0])}
          className="mt-3"
        />
      </section>

      {/* Density */}
      <section>
        <div className="flex items-baseline justify-between">
          <Label>Planting density</Label>
          <span className="font-mono text-sm text-primary">
            <AnimatedNumber value={config.density} duration={0.4} /> <span className="text-muted-foreground">trees/ha</span>
          </span>
        </div>
        <Slider
          min={100}
          max={2000}
          step={50}
          value={[config.density]}
          disabled={running}
          onValueChange={(v) => set("density", v[0])}
          className="mt-3"
        />
      </section>

      {/* Area readout */}
      <section className="rounded-xl bg-background-deep/60 border border-border/60 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Selected area</p>
          <p className="font-mono text-lg mt-0.5">
            <AnimatedNumber value={config.areaHa} decimals={1} suffix=" ha" duration={0.5} />
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Mission ETA</p>
          <p className="font-mono text-lg mt-0.5">
            <AnimatedNumber value={result.durationMin} decimals={1} suffix=" min" duration={0.5} />
          </p>
        </div>
      </section>

      {/* Pricing breakdown */}
      <section>
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">Donation Breakdown</p>
        <div className="space-y-2">
          <Row
            label={`${profile.label} saplings`}
            sub={`${formatNumber(result.trees)} × ${formatCurrency(profile.costPerTree)}`}
            value={result.treesCost}
          />
          <Row
            label="Drone operations"
            sub={`${config.drones} drones · ${result.durationMin.toFixed(1)} min`}
            value={result.droneCost}
          />
        </div>

        <div className="hairline my-4" />

        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Total donation</p>
            <p className="font-display text-4xl mt-1 num-shimmer">
              <AnimatedNumber value={result.total} prefix="$" decimals={0} duration={0.9} />
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">CO₂ /yr</p>
            <p className="font-mono text-lg text-primary">
              <AnimatedNumber value={result.co2Tons} decimals={1} suffix=" t" duration={0.7} />
            </p>
          </div>
        </div>
      </section>

      <button
        disabled={config.areaHa <= 0 || running}
        className="relative px-5 py-3.5 rounded-xl bg-gradient-primary text-primary-foreground font-medium hover-lift disabled:opacity-40 disabled:cursor-not-allowed shadow-glow-soft"
      >
        {config.areaHa <= 0 ? "Draw an area to begin" : `Donate ${formatCurrency(result.total)}`}
      </button>
    </aside>
  );
};

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{children}</p>
);

const Row = ({ label, sub, value }: { label: string; sub: string; value: number }) => (
  <div className="flex items-center justify-between py-1">
    <div>
      <p className="text-sm text-foreground/90">{label}</p>
      <p className="text-[11px] text-muted-foreground font-mono">{sub}</p>
    </div>
    <p className="font-mono text-sm">
      <AnimatedNumber value={value} prefix="$" decimals={0} duration={0.6} />
    </p>
  </div>
);
