import { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { Plus, Minus, Battery, Wind, Package, Clock, MapPin } from "lucide-react";
import {
  IRAQI_DRONES,
  DRONE_ORDER,
  ROLE_LABEL,
  estimateFleet,
} from "@/lib/iraqiDrones";
import { useI18n } from "@/lib/i18n";
import { useMission } from "@/lib/missionContext";

interface Props {
  className?: string;
}

/**
 * DroneFleet — pick & configure a swarm of Iraq-context drones.
 * Bound to MissionContext so Mission Control sees every change live.
 */
export const DroneFleet = ({ className }: Props) => {
  const { t, pick, dir } = useI18n();
  const { droneCounts: counts, setDroneCount, iraqMode, setIraqMode } = useMission();
  const localMode = iraqMode;
  const setLocalMode = setIraqMode;

  const totals = useMemo(() => estimateFleet(counts), [counts]);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!headerRef.current) return;
    gsap.fromTo(
      headerRef.current.querySelectorAll("[data-stat]"),
      { y: 6, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.45, ease: "expo.out", stagger: 0.05 }
    );
  }, [totals.totalCoverageHa, totals.totalFlightMinutes, totals.totalCostUsd]);

  const inc = (id: string) => setDroneCount(id, (counts[id] ?? 0) + 1);
  const dec = (id: string) => setDroneCount(id, (counts[id] ?? 0) - 1);

  return (
    <section
      className={`glass rounded-2xl p-5 w-full max-w-sm flex flex-col gap-4 ${className ?? ""}`}
      aria-label={t("drone_fleet")}
      dir={dir}
    >
      <header>
        <p className="text-[10px] tracking-[0.25em] uppercase text-primary/80 font-mono">
          {t("drone_fleet")}
        </p>
        <h3 className="font-display text-lg mt-1">
          {dir === "rtl" ? "أسطول مُخصَّص للعراق" : "Iraq-tuned swarm"}
        </h3>
      </header>

      {/* Fleet totals */}
      <div ref={headerRef} className="grid grid-cols-3 gap-2">
        <Total
          dataAttr="cov"
          icon={<MapPin className="h-3 w-3" />}
          label={t("coverage")}
          value={`${totals.totalCoverageHa.toFixed(0)} ha`}
        />
        <Total
          dataAttr="time"
          icon={<Clock className="h-3 w-3" />}
          label={t("flight_time")}
          value={`${totals.totalFlightMinutes.toFixed(0)} min`}
        />
        <Total
          dataAttr="cost"
          icon={<Battery className="h-3 w-3" />}
          label={t("cost")}
          value={`$${totals.totalCostUsd.toFixed(0)}`}
        />
      </div>

      {/* Drone list */}
      <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1 -mr-1">
        {DRONE_ORDER.map((id) => {
          const d = IRAQI_DRONES[id];
          const n = counts[id] ?? 0;
          const active = n > 0;
          return (
            <div
              key={id}
              className={[
                "rounded-xl border p-3 transition-all",
                active
                  ? "border-primary/40 bg-primary/5 shadow-glow-soft"
                  : "border-border bg-card/40",
              ].join(" ")}
            >
              <div className="flex items-center gap-3">
                <DroneSvg propellers={d.propellers} color={d.color} active={active} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-display text-sm leading-tight truncate">
                      {pick(d.name)}
                    </p>
                    <span
                      className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-mono"
                      style={{
                        background: `${d.color.replace(")", " / 0.15)")}`,
                        color: d.color,
                      }}
                    >
                      {pick(ROLE_LABEL[d.role])}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug truncate">
                    {pick(d.tagline)}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => dec(id)}
                    disabled={n === 0}
                    className="h-7 w-7 rounded-md grid place-items-center bg-card hover:bg-primary/10 disabled:opacity-30 transition-colors"
                    aria-label={t("remove_drone")}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="font-mono text-sm w-5 text-center tabular-nums">{n}</span>
                  <button
                    onClick={() => inc(id)}
                    className="h-7 w-7 rounded-md grid place-items-center bg-card hover:bg-primary/10 transition-colors"
                    aria-label={t("add_drone")}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Spec strip */}
              <div className="grid grid-cols-4 gap-2 mt-2.5 text-[10px] font-mono text-muted-foreground">
                <Spec icon={<Wind className="h-3 w-3" />} value={`${d.speedMps} m/s`} />
                <Spec icon={<Package className="h-3 w-3" />} value={`${d.capacity}${d.capacityUnit}`} />
                <Spec icon={<Clock className="h-3 w-3" />} value={`${d.flightMinutes}m`} />
                <Spec icon={<MapPin className="h-3 w-3" />} value={`${d.coverageHa}ha`} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Local mode */}
      <label className="flex items-start gap-3 rounded-xl border border-border bg-card/40 p-3 cursor-pointer hover:border-primary/30 transition-colors">
        <input
          type="checkbox"
          checked={localMode}
          onChange={(e) => setLocalMode(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-primary"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{t("local_mode")}</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {t("local_mode_hint")}
          </p>
          {localMode && (
            <p className="text-[10px] text-primary mt-1.5 font-mono">
              {dir === "rtl"
                ? "− ٤٠٪ سرعة · − ٣٠٪ سعة · + ٢٠٪ زمن طيران"
                : "−40% speed · −30% capacity · +20% flight time"}
            </p>
          )}
        </div>
      </label>
    </section>
  );
};

// --- Sub-components ---

const Total = ({
  dataAttr,
  icon,
  label,
  value,
}: {
  dataAttr: string;
  icon: React.ReactNode;
  label: string;
  value: string;
}) => (
  <div data-stat={dataAttr} className="rounded-lg bg-background-deep/60 border border-border/60 px-2.5 py-2">
    <div className="flex items-center gap-1 text-muted-foreground">
      {icon}
      <p className="text-[9px] uppercase tracking-wider">{label}</p>
    </div>
    <p className="font-mono text-sm mt-0.5 text-primary truncate">{value}</p>
  </div>
);

const Spec = ({ icon, value }: { icon: React.ReactNode; value: string }) => (
  <div className="flex items-center gap-1 min-w-0">
    {icon}
    <span className="truncate">{value}</span>
  </div>
);

/** Inline SVG drone with rotating propellers. */
const DroneSvg = ({
  propellers,
  color,
  active,
}: {
  propellers: 4 | 6 | 8;
  color: string;
  active: boolean;
}) => {
  // Layout positions for 4/6/8 props on a circle of r=14
  const angles =
    propellers === 4
      ? [0, 90, 180, 270]
      : propellers === 6
        ? [0, 60, 120, 180, 240, 300]
        : [0, 45, 90, 135, 180, 225, 270, 315];

  const r = 14;

  return (
    <svg width="44" height="44" viewBox="-22 -22 44 44" className="shrink-0">
      {/* Arms */}
      {angles.map((a, i) => {
        const x = Math.cos((a * Math.PI) / 180) * r;
        const y = Math.sin((a * Math.PI) / 180) * r;
        return (
          <line
            key={i}
            x1={0}
            y1={0}
            x2={x}
            y2={y}
            stroke="hsl(220 15% 35%)"
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        );
      })}
      {/* Propellers */}
      {angles.map((a, i) => {
        const x = Math.cos((a * Math.PI) / 180) * r;
        const y = Math.sin((a * Math.PI) / 180) * r;
        return (
          <g key={`p${i}`} transform={`translate(${x} ${y})`}>
            <circle r={5} fill={color} opacity={0.18} />
            <g style={{ transformOrigin: "0 0", animation: active ? `arbor-prop ${0.18 + (i % 2) * 0.05}s linear infinite` : "none" }}>
              <ellipse rx={5} ry={1} fill={color} opacity={active ? 0.9 : 0.4} />
              <ellipse rx={5} ry={1} fill={color} opacity={active ? 0.9 : 0.4} transform="rotate(60)" />
            </g>
          </g>
        );
      })}
      {/* Body */}
      <circle r={4.5} fill="hsl(220 15% 12%)" stroke={color} strokeWidth={1} />
      <circle r={1.5} fill={color}>
        {active && (
          <animate attributeName="opacity" values="0.4;1;0.4" dur="1.4s" repeatCount="indefinite" />
        )}
      </circle>
      <style>{`
        @keyframes arbor-prop { to { transform: rotate(360deg); } }
      `}</style>
    </svg>
  );
};
