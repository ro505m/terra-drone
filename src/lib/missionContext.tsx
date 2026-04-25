// Unified state for the Mission Control workflow.
// Connects: Iraqi tree selection · Drone fleet composition · Mission parameters
// (quantity, iraq mode, maintenance) · Mission lifecycle (idle/preview/running).
//
// Exposed via <MissionProvider> + useMission().

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { calculateMission, type MissionBreakdown } from "./iraqPricing";
import { IRAQI_TREES, type IraqiTreeId } from "./iraqiTrees";

export type MissionPhase = "idle" | "preview" | "running" | "complete";

export interface MissionState {
  // Selections
  treeId: IraqiTreeId;
  droneCounts: Record<string, number>;
  quantity: number;
  iraqMode: boolean;
  includeMaintenance: boolean;

  // Map context (filled by MapExperience callbacks)
  areaHa: number;
  provinceName: string | null;

  // Lifecycle
  phase: MissionPhase;
  /** Monotonically increasing trigger so the map can react to "Start Mission". */
  launchToken: number;

  // Live stats updated by the simulation
  treesPlanted: number;
  activeDronesOnMap: number;
}

interface MissionCtx extends MissionState {
  breakdown: MissionBreakdown;
  setTreeId: (id: IraqiTreeId) => void;
  setDroneCount: (id: string, n: number) => void;
  setDroneCounts: (next: Record<string, number>) => void;
  setQuantity: (q: number) => void;
  setIraqMode: (v: boolean) => void;
  setIncludeMaintenance: (v: boolean) => void;
  setAreaHa: (ha: number) => void;
  setProvinceName: (n: string | null) => void;
  launchMission: () => void;
  setPhase: (p: MissionPhase) => void;
  setTreesPlanted: (n: number) => void;
  setActiveDronesOnMap: (n: number) => void;
  reset: () => void;
}

const Ctx = createContext<MissionCtx | null>(null);

const DEFAULT_DRONES: Record<string, number> = {
  agras_t40_seed: 2,
  hexa_seeder: 1,
  scout_quad: 1,
};

export function MissionProvider({ children }: { children: ReactNode }) {
  const [treeId, setTreeId] = useState<IraqiTreeId>("conocarpus");
  const [droneCounts, setDroneCountsState] = useState<Record<string, number>>(DEFAULT_DRONES);
  const [quantity, setQuantity] = useState<number>(500);
  const [iraqMode, setIraqMode] = useState<boolean>(true);
  const [includeMaintenance, setIncludeMaintenance] = useState<boolean>(true);

  const [areaHa, setAreaHa] = useState<number>(0);
  const [provinceName, setProvinceName] = useState<string | null>(null);

  const [phase, setPhase] = useState<MissionPhase>("idle");
  const [launchToken, setLaunchToken] = useState<number>(0);
  const [treesPlanted, setTreesPlanted] = useState<number>(0);
  const [activeDronesOnMap, setActiveDronesOnMap] = useState<number>(0);

  const setDroneCount = useCallback((id: string, n: number) => {
    setDroneCountsState((c) => ({ ...c, [id]: Math.max(0, Math.min(20, Math.round(n))) }));
  }, []);

  const setDroneCounts = useCallback((next: Record<string, number>) => {
    setDroneCountsState(next);
  }, []);

  const reset = useCallback(() => {
    setPhase("idle");
    setTreesPlanted(0);
    setActiveDronesOnMap(0);
  }, []);

  const launchMission = useCallback(() => {
    setPhase("running");
    setTreesPlanted(0);
    setLaunchToken((t) => t + 1);
  }, []);

  const breakdown = useMemo(
    () =>
      calculateMission({
        treeId,
        quantity,
        droneCounts,
        iraqMode,
        includeMaintenance,
        areaHa,
      }),
    [treeId, quantity, droneCounts, iraqMode, includeMaintenance, areaHa]
  );

  // Ensure tree exists (defensive)
  const safeTreeId: IraqiTreeId = IRAQI_TREES[treeId] ? treeId : "conocarpus";

  const value: MissionCtx = useMemo(
    () => ({
      treeId: safeTreeId,
      droneCounts,
      quantity,
      iraqMode,
      includeMaintenance,
      areaHa,
      provinceName,
      phase,
      launchToken,
      treesPlanted,
      activeDronesOnMap,
      breakdown,
      setTreeId,
      setDroneCount,
      setDroneCounts,
      setQuantity,
      setIraqMode,
      setIncludeMaintenance,
      setAreaHa,
      setProvinceName,
      launchMission,
      setPhase,
      setTreesPlanted,
      setActiveDronesOnMap,
      reset,
    }),
    [
      safeTreeId,
      droneCounts,
      quantity,
      iraqMode,
      includeMaintenance,
      areaHa,
      provinceName,
      phase,
      launchToken,
      treesPlanted,
      activeDronesOnMap,
      breakdown,
      setDroneCount,
      setDroneCounts,
      launchMission,
      reset,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMission(): MissionCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMission must be used inside <MissionProvider>");
  return v;
}
