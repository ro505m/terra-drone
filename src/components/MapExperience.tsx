import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as turf from "@turf/turf";
import { gsap } from "gsap";
import { RotateCcw, Check, AlertTriangle, Lock, Flag, Sparkles, Pencil } from "lucide-react";
import {
  PLANT_PROFILES,
  suggestPlantByLatitude,
  recommendDensity,
  soilSuitability,
  type PlantId,
} from "@/lib/plants";
import { spreadSeeds } from "@/lib/seedSpread";
import provincesData from "@/data/iraq-provinces.json";
import { MapSearch, type GeocodeResult } from "./MapSearch";
import { useMission } from "@/lib/missionContext";
import { IRAQI_TREES } from "@/lib/iraqiTrees";
import { IRAQI_DRONES } from "@/lib/iraqiDrones";
import { activeDronesList } from "@/lib/iraqPricing";

interface Props {
  onAreaChange: (areaHa: number) => void;
  /** Externally-controlled province lock (e.g. from a dropdown). */
  externalProvinceName?: string | null;
  /** Fires when a province gets locked (by click or external trigger). */
  onProvinceLock?: (info: { name: string; centroid: [number, number] } | null) => void;
}

type LngLat = [number, number];

// ---- UX constraints ----
const MIN_AREA_M2 = 5_000;          // 0.5 ha minimum
const MAX_AREA_KM2 = 5;             // hard cap
const SOFT_AREA_KM2 = 2;            // suggested zone
const SNAP_PIXEL_RADIUS = 14;       // snap-to-start in screen pixels
const MIN_POINTS_TO_CLOSE = 3;
const MAX_TREE_MARKERS = 600;       // perf cap on DOM markers

const IRAQ_BOUNDS: maplibregl.LngLatBoundsLike = [
  [38.0, 28.5],
  [49.2, 37.9],
];

const PROVINCES = provincesData as GeoJSON.FeatureCollection;

const DARK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
  sources: {
    "carto-dark": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap · © CARTO",
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#06090a" } },
    { id: "carto", type: "raster", source: "carto-dark", paint: { "raster-opacity": 0.85, "raster-contrast": 0.05 } },
  ],
};

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  name: string;
  capital: string;
  popM: number;
  areaKm2: number;
}

interface SearchPin {
  marker: maplibregl.Marker;
  name: string;
}

interface LockedProvince {
  id: string;
  geom: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  bbox: [number, number, number, number]; // [w,s,e,n]
  centroid: LngLat;
}

type Phase = "idle" | "drawing" | "closed" | "planted";

export const MapExperience = ({ onAreaChange, externalProvinceName, onProvinceLock }: Props) => {
  const mission = useMission();
  // Derive PlantId & density from the unified mission state
  const activeTree = IRAQI_TREES[mission.treeId];
  const activePlantId = (activeTree?.plantId ?? "olive") as PlantId;
  const droneFleet = activeDronesList(mission.droneCounts);
  const droneRafsRef = useRef<number[]>([]);
  const droneMarkersRef = useRef<maplibregl.Marker[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Drone cleanup helper (closure over refs)
  const cleanupDrones = useCallback(() => {
    droneRafsRef.current.forEach((id) => cancelAnimationFrame(id));
    droneRafsRef.current = [];
    droneMarkersRef.current.forEach((m) => m.remove());
    droneMarkersRef.current = [];
  }, []);

  // Spawn trees instantly with stagger (fallback when no planters)
  const spawnTrees = useCallback((map: maplibregl.Map, positions: LngLat[], profile: typeof PLANT_PROFILES[PlantId], color: string, emoji: string) => {
    positions.forEach((pos, i) => {
      const el = makeTreeEl(color, emoji);
      const m = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(pos).addTo(map);
      treeMarkersRef.current.push(m);
      gsap.fromTo(
        el,
        { scale: profile.growth.scaleFrom, opacity: 0 },
        {
          scale: 1, opacity: 1,
          duration: profile.growth.duration,
          delay: (i / positions.length) * 1.6 + Math.random() * 0.15,
          ease: profile.growth.ease,
        }
      );
    });
    mission.setTreesPlanted(positions.length);
  }, [mission]);

  const dropTreeAt = useCallback((map: maplibregl.Map, pos: LngLat, profile: typeof PLANT_PROFILES[PlantId], color: string, emoji: string) => {
    const el = makeTreeEl(color, emoji);
    const m = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(pos).addTo(map);
    treeMarkersRef.current.push(m);
    gsap.fromTo(
      el,
      { scale: profile.growth.scaleFrom, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(2)" }
    );
  }, []);


  const verticesRef = useRef<LngLat[]>([]);
  const treeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const hoveredProvinceRef = useRef<string | null>(null);
  const lockedRef = useRef<LockedProvince | null>(null);
  const searchPinRef = useRef<SearchPin | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const shimmerRafRef = useRef<number | null>(null);
  const cursorLngLatRef = useRef<LngLat | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [pointCount, setPointCount] = useState(0);
  const [areaKm2, setAreaKm2] = useState(0);
  const [areaError, setAreaError] = useState<string | null>(null);
  const [lockedProvince, setLockedProvince] = useState<LockedProvince | null>(null);
  const [snapHover, setSnapHover] = useState(false);
  const [suggested, setSuggested] = useState<PlantId | null>(null);
  const [suitability, setSuitability] = useState<number>(0);
  const [hint, setHint] = useState<string>("Click a province to lock your planting region");
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false, x: 0, y: 0, name: "", capital: "", popM: 0, areaKm2: 0,
  });

  // ---------- Map init ----------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      center: [43.7, 33.2],
      zoom: 5.4,
      pitch: 0,
      bearing: 0,
      maxPitch: 0,
      minPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchZoomRotate: true,
      maxBounds: IRAQ_BOUNDS,
      minZoom: 5,
      maxZoom: 16,
      attributionControl: { compact: true },
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), "bottom-right");
    mapRef.current = map;

    map.on("load", () => {
      // ---------- Province sources & layers ----------
      map.addSource("provinces", { type: "geojson", data: PROVINCES, promoteId: "name" });

      map.addLayer({
        id: "atmosphere-glow",
        type: "fill",
        source: "provinces",
        paint: { "fill-color": "hsl(180, 70%, 50%)", "fill-opacity": 0.04 },
      });

      map.addLayer({
        id: "province-fill",
        type: "fill",
        source: "provinces",
        paint: {
          "fill-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false], "hsl(142, 100%, 60%)",
            ["boolean", ["feature-state", "hover"], false], "hsl(142, 92%, 55%)",
            "hsl(160, 50%, 25%)",
          ],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false], 0.18,
            ["boolean", ["feature-state", "hover"], false], 0.12,
            0.04,
          ],
          "fill-opacity-transition": { duration: 350 },
          "fill-color-transition": { duration: 350 },
        },
      });

      map.addLayer({
        id: "province-border-soft",
        type: "line",
        source: "provinces",
        paint: {
          "line-color": "hsl(142, 60%, 45%)",
          "line-width": 1,
          "line-opacity": 0.35,
          "line-blur": 0.5,
        },
      });

      map.addLayer({
        id: "province-border-hover",
        type: "line",
        source: "provinces",
        paint: {
          "line-color": "hsl(142, 100%, 70%)",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false], 2.8,
            ["boolean", ["feature-state", "hover"], false], 2.2,
            0,
          ],
          "line-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false], 1,
            ["boolean", ["feature-state", "hover"], false], 0.9,
            0,
          ],
          "line-blur": 1.2,
          "line-width-transition": { duration: 300 },
          "line-opacity-transition": { duration: 300 },
        },
      });

      // ---------- Drawing sources ----------
      map.addSource("vertices", { type: "geojson", data: turf.featureCollection([]) });
      map.addSource("path", { type: "geojson", data: turf.featureCollection([]) });
      map.addSource("ghost", { type: "geojson", data: turf.featureCollection([]) }); // cursor preview line
      map.addSource("polygon", { type: "geojson", data: turf.featureCollection([]) });

      // Polygon fills (organic, layered for depth)
      map.addLayer({
        id: "polygon-glow-outer",
        type: "fill",
        source: "polygon",
        paint: { "fill-color": "hsl(142, 92%, 55%)", "fill-opacity": 0.10 },
      });
      map.addLayer({
        id: "polygon-glow-inner",
        type: "fill",
        source: "polygon",
        paint: { "fill-color": "hsl(142, 100%, 70%)", "fill-opacity": 0.18 },
      });
      // Shimmer pattern uses a tweened opacity layer to fake breathing texture.
      map.addLayer({
        id: "polygon-shimmer",
        type: "fill",
        source: "polygon",
        paint: { "fill-color": "hsl(160, 100%, 75%)", "fill-opacity": 0.0 },
      });
      map.addLayer({
        id: "polygon-outline",
        type: "line",
        source: "polygon",
        paint: {
          "line-color": "hsl(142, 100%, 70%)",
          "line-width": 2.4,
          "line-blur": 1.4,
          "line-opacity": 1,
        },
      });

      // Drawing path (committed segments)
      map.addLayer({
        id: "path-line",
        type: "line",
        source: "path",
        paint: {
          "line-color": "hsl(142, 92%, 65%)",
          "line-width": 2.2,
          "line-opacity": 0.9,
        },
      });

      // Ghost line from last vertex → cursor (preview)
      map.addLayer({
        id: "ghost-line",
        type: "line",
        source: "ghost",
        paint: {
          "line-color": "hsl(142, 92%, 65%)",
          "line-width": 1.6,
          "line-opacity": 0.55,
          "line-dasharray": [2, 2],
        },
      });

      // Vertex pulse + core
      map.addLayer({
        id: "vertex-pulse",
        type: "circle",
        source: "vertices",
        paint: {
          "circle-radius": 18,
          "circle-color": "hsl(142, 92%, 55%)",
          "circle-opacity": 0.18,
          "circle-blur": 1,
        },
      });
      map.addLayer({
        id: "vertex-core",
        type: "circle",
        source: "vertices",
        paint: {
          "circle-radius": [
            "case",
            ["boolean", ["feature-state", "first"], false], 7,
            5,
          ],
          "circle-color": [
            "case",
            ["boolean", ["feature-state", "first"], false], "hsl(160, 100%, 80%)",
            "hsl(142, 100%, 70%)",
          ],
          "circle-stroke-color": "hsl(220, 50%, 4%)",
          "circle-stroke-width": 2,
        },
      });
    });

    // ---------- Province hover ----------
    map.on("mousemove", "province-fill", (e) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      const name = f.properties?.name as string;

      if (hoveredProvinceRef.current && hoveredProvinceRef.current !== name) {
        map.setFeatureState({ source: "provinces", id: hoveredProvinceRef.current }, { hover: false });
      }
      hoveredProvinceRef.current = name;
      map.setFeatureState({ source: "provinces", id: name }, { hover: true });

      const km2 = turf.area(f as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>) / 1_000_000;

      setTooltip({
        visible: true,
        x: e.point.x,
        y: e.point.y,
        name,
        capital: (f.properties?.capital as string) ?? "—",
        popM: (f.properties?.popM as number) ?? 0,
        areaKm2: km2,
      });
      // Cursor depends on phase
      const ph = phaseRef.current;
      map.getCanvas().style.cursor = ph === "drawing" ? "crosshair" : ph === "idle" ? "pointer" : "";
    });

    map.on("mouseleave", "province-fill", () => {
      if (hoveredProvinceRef.current) {
        map.setFeatureState({ source: "provinces", id: hoveredProvinceRef.current }, { hover: false });
        hoveredProvinceRef.current = null;
      }
      setTooltip((t) => ({ ...t, visible: false }));
      map.getCanvas().style.cursor = "";
    });

    // ---------- Province click → smooth zoom + lock ----------
    map.on("click", "province-fill", (e) => {
      if (lockedRef.current) return;
      if (verticesRef.current.length > 0) return;
      const f = e.features?.[0];
      if (!f) return;
      lockProvinceByFeature(f as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>);
      e.preventDefault();
    });

    // ---------- Cursor tracking for ghost line + snap detection ----------
    map.on("mousemove", (e) => {
      cursorLngLatRef.current = [e.lngLat.lng, e.lngLat.lat];
      if (phaseRef.current !== "drawing") {
        if (snapHover) setSnapHover(false);
        return;
      }
      const verts = verticesRef.current;
      // Snap detection: distance to first vertex in screen pixels
      let nowSnap = false;
      if (verts.length >= MIN_POINTS_TO_CLOSE) {
        const first = map.project({ lng: verts[0][0], lat: verts[0][1] });
        const dx = first.x - e.point.x;
        const dy = first.y - e.point.y;
        if (Math.hypot(dx, dy) <= SNAP_PIXEL_RADIUS) nowSnap = true;
      }
      if (nowSnap !== snapHover) setSnapHover(nowSnap);

      // Ghost preview line: last vertex → cursor (or → first if snapping)
      if (verts.length >= 1) {
        const target: LngLat = nowSnap ? verts[0] : [e.lngLat.lng, e.lngLat.lat];
        const ghost = turf.lineString([verts[verts.length - 1], target]);
        (map.getSource("ghost") as maplibregl.GeoJSONSource)?.setData(turf.featureCollection([ghost]));
        map.getCanvas().style.cursor = nowSnap ? "pointer" : "crosshair";
      }
    });

    // ---------- Vertex placement ----------
    map.on("click", (e) => {
      if (e.defaultPrevented) return; // province click consumed it
      if (phaseRef.current !== "drawing") return;
      if (!lockedRef.current) return;

      const verts = verticesRef.current;

      // Snap to close
      if (verts.length >= MIN_POINTS_TO_CLOSE) {
        const first = map.project({ lng: verts[0][0], lat: verts[0][1] });
        const dx = first.x - e.point.x;
        const dy = first.y - e.point.y;
        if (Math.hypot(dx, dy) <= SNAP_PIXEL_RADIUS) {
          finishArea();
          return;
        }
      }

      const lngLat: LngLat = [e.lngLat.lng, e.lngLat.lat];

      // Constrain to locked province
      if (!turf.booleanPointInPolygon(turf.point(lngLat), lockedRef.current.geom as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>)) {
        setHint(`Click inside ${lockedRef.current.id} to place a vertex`);
        flashWarn();
        return;
      }

      verticesRef.current = [...verts, lngLat];
      setPointCount(verticesRef.current.length);
      spawnRipple(map, lngLat);
      updateGeometry();

      const n = verticesRef.current.length;
      if (n < MIN_POINTS_TO_CLOSE) {
        setHint(`${MIN_POINTS_TO_CLOSE - n} more point${MIN_POINTS_TO_CLOSE - n > 1 ? "s" : ""} needed to close`);
      } else {
        setHint(`Click the first point to close · or "Finish Area"`);
      }
    });

    return () => {
      if (shimmerRafRef.current) cancelAnimationFrame(shimmerRafRef.current);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep phaseRef in sync
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Mark first vertex with feature-state (visual emphasis when snap-ready)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Re-flag first vertex by re-emitting source data with ids
    const verts = verticesRef.current;
    if (!verts.length) return;
    const fc = turf.featureCollection(
      verts.map((v, i) => turf.point(v, {}, { id: i }))
    );
    (map.getSource("vertices") as maplibregl.GeoJSONSource)?.setData(fc);
    if (verts.length >= MIN_POINTS_TO_CLOSE) {
      map.setFeatureState({ source: "vertices", id: 0 }, { first: true });
    }
  }, [pointCount]);

  // ---------- Geometry & area validation ----------
  const updateGeometry = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const verts = verticesRef.current;

    // Vertices source (with ids so first can be highlighted)
    const fc = turf.featureCollection(verts.map((v, i) => turf.point(v, {}, { id: i })));
    (map.getSource("vertices") as maplibregl.GeoJSONSource)?.setData(fc);

    // Committed line through points (no auto-close while drawing)
    if (verts.length >= 2) {
      const line = turf.lineString(verts);
      (map.getSource("path") as maplibregl.GeoJSONSource)?.setData(turf.featureCollection([line]));
    } else {
      (map.getSource("path") as maplibregl.GeoJSONSource)?.setData(turf.featureCollection([]));
    }

    // Live polygon preview while drawing (≥3 points)
    if (verts.length >= 3) {
      const ring = [...verts, verts[0]];
      const poly = turf.polygon([ring]);
      (map.getSource("polygon") as maplibregl.GeoJSONSource)?.setData(turf.featureCollection([poly]));

      const m2 = turf.area(poly);
      const km2 = m2 / 1_000_000;
      setAreaKm2(km2);

      const tooBig = km2 > MAX_AREA_KM2;
      const tooSmall = m2 < MIN_AREA_M2;

      const invalidColor = tooBig ? "hsl(0, 90%, 65%)" : "hsl(45, 100%, 65%)";
      const okColor = "hsl(142, 100%, 70%)";

      if (tooBig) {
        setAreaError(`Area exceeds ${MAX_AREA_KM2} km² limit (${km2.toFixed(2)} km²)`);
        applyPolyColors(map, "hsl(0, 80%, 60%)", invalidColor, "hsl(0, 90%, 70%)");
        onAreaChange(0);
      } else if (tooSmall) {
        setAreaError(`Area below ${(MIN_AREA_M2 / 10_000).toFixed(2)} ha minimum`);
        applyPolyColors(map, "hsl(45, 90%, 55%)", invalidColor, "hsl(45, 100%, 70%)");
        onAreaChange(0);
      } else {
        setAreaError(null);
        applyPolyColors(map, "hsl(142, 92%, 55%)", okColor, "hsl(142, 100%, 70%)");
        onAreaChange(Math.max(0.01, m2 / 10_000));
      }
    } else {
      (map.getSource("polygon") as maplibregl.GeoJSONSource)?.setData(turf.featureCollection([]));
      setAreaKm2(0);
      setAreaError(null);
      onAreaChange(0);
    }
  }, [onAreaChange]);

  // ---------- Province lock (shared by click + external prop) ----------
  const lockProvinceByFeature = useCallback(
    (f: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>) => {
      const map = mapRef.current;
      if (!map) return;
      const name = (f.properties as { name?: string } | null)?.name as string;
      if (!name) return;

      const centroid = turf.centroid(f).geometry.coordinates as LngLat;
      const bbox = turf.bbox(f) as [number, number, number, number];
      const locked: LockedProvince = { id: name, geom: f, bbox, centroid };

      if (lockedRef.current && lockedRef.current.id !== name) {
        map.setFeatureState({ source: "provinces", id: lockedRef.current.id }, { selected: false });
      }
      lockedRef.current = locked;
      setLockedProvince(locked);
      map.setFeatureState({ source: "provinces", id: name }, { selected: true });

      const sug = suggestPlantByLatitude(centroid[1]);
      setSuggested(sug);
      const fit = soilSuitability(centroid[1], centroid[0], sug);
      setSuitability(fit);

      map.fitBounds(
        [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
        {
          padding: 80,
          duration: 1400,
          pitch: 0,
          bearing: 0,
          essential: true,
          maxZoom: 10,
          easing: (t) => 1 - Math.pow(1 - t, 4),
        }
      );

      setHint(`${name} locked · search a place or click "Start drawing"`);
      onProvinceLock?.({ name, centroid: [centroid[0], centroid[1]] });
    },
    [onProvinceLock]
  );

  // External province selection (e.g. dropdown)
  useEffect(() => {
    if (!externalProvinceName) return;
    if (lockedRef.current?.id === externalProvinceName) return;
    const map = mapRef.current;
    if (!map) return;

    const trigger = () => {
      const feat = (PROVINCES.features as GeoJSON.Feature[]).find(
        (f) => (f.properties as { name?: string } | null)?.name === externalProvinceName
      ) as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | undefined;
      if (feat) lockProvinceByFeature(feat);
    };
    if (map.isStyleLoaded()) trigger();
    else map.once("load", trigger);
  }, [externalProvinceName, lockProvinceByFeature]);

  // ---------- Phase actions ----------
  const startDrawing = () => {
    if (!lockedRef.current) {
      setHint("Click a province first to lock your planting region");
      flashWarn();
      return;
    }
    setPhase("drawing");
    setHint(`Click to drop points inside ${lockedRef.current.id} · close on first point or "Finish"`);
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = "crosshair";
  };

  const finishArea = () => {
    const verts = verticesRef.current;
    if (verts.length < MIN_POINTS_TO_CLOSE) {
      setHint(`Need at least ${MIN_POINTS_TO_CLOSE} points to close`);
      flashWarn();
      return;
    }
    if (areaError) {
      flashWarn();
      return;
    }
    setPhase("closed");
    setSnapHover(false);
    const map = mapRef.current;
    if (map) {
      map.getCanvas().style.cursor = "";
      // Clear ghost
      (map.getSource("ghost") as maplibregl.GeoJSONSource)?.setData(turf.featureCollection([]));
      // Cinematic emphasis pulse
      gsap.fromTo(
        { v: 0.34 },
        { v: 0.34 },
        {
          v: 0.20,
          duration: 0.9,
          ease: "expo.out",
          onUpdate: function () {
            const o = (this.targets()[0] as { v: number }).v;
            map.setPaintProperty("polygon-glow-inner", "fill-opacity", o);
          },
        }
      );
      // Start shimmer loop
      startShimmer();
    }
    setHint(`Area ready · ${areaKm2.toFixed(2)} km² · choose a plant and Confirm Planting`);
  };

  const startShimmer = () => {
    if (shimmerRafRef.current) cancelAnimationFrame(shimmerRafRef.current);
    const map = mapRef.current;
    if (!map) return;
    const t0 = performance.now();
    const tick = (t: number) => {
      const dt = (t - t0) / 1000;
      // Two overlapping sine waves for organic breathing
      const o = 0.04 + 0.06 * (0.5 + 0.5 * Math.sin(dt * 1.3))
                    + 0.04 * (0.5 + 0.5 * Math.sin(dt * 0.7 + 1.7));
      try {
        map.setPaintProperty("polygon-shimmer", "fill-opacity", o);
      } catch { /* style might be tearing down */ }
      shimmerRafRef.current = requestAnimationFrame(tick);
    };
    shimmerRafRef.current = requestAnimationFrame(tick);
  };

  const stopShimmer = () => {
    if (shimmerRafRef.current) {
      cancelAnimationFrame(shimmerRafRef.current);
      shimmerRafRef.current = null;
    }
    const map = mapRef.current;
    if (map) { try { map.setPaintProperty("polygon-shimmer", "fill-opacity", 0); } catch { /* noop */ } }
  };

  const confirmPlanting = useCallback(() => {
    const map = mapRef.current;
    const verts = verticesRef.current;
    if (!map || verts.length < MIN_POINTS_TO_CLOSE || areaError) return;

    const ring = [...verts, verts[0]];
    const poly = turf.polygon([ring]);
    const profile = PLANT_PROFILES[activePlantId] ?? PLANT_PROFILES.olive;
    const treeColor = activeTree?.color ?? profile.color;
    const treeEmoji = activeTree?.emoji ?? profile.emoji;

    // Quantity comes from Mission Control. Cap for marker perf.
    const qty = Math.max(20, Math.min(MAX_TREE_MARKERS, mission.quantity || 200));

    const positions = spreadSeeds({
      polygon: poly,
      emitters: verts,
      count: qty,
      profile,
      seed: Math.floor(Math.random() * 9999),
    });

    // Clear previous trees + drones
    treeMarkersRef.current.forEach((m) => m.remove());
    treeMarkersRef.current = [];
    cleanupDrones();

    setPhase("planted");
    mission.setPhase("running");
    mission.setTreesPlanted(0);
    setHint(`Planting ${positions.length} ${activeTree ? "" : profile.label.toLowerCase()} across ${areaKm2.toFixed(2)} km²`);

    // ---- Drone swarm flyover ----
    const planters = droneFleet.filter((x) => x.d.role === "seeder" || x.d.role === "hybrid");
    const monitors = droneFleet.filter((x) => x.d.role === "monitor" || x.d.role === "sprayer");

    // Total drone units to render (cap visible at 12 for clarity)
    const planterUnits: typeof droneFleet = [];
    planters.forEach(({ d, n }) => {
      for (let i = 0; i < Math.min(n, 6); i++) planterUnits.push({ d, n: 1 });
    });
    const supportUnits: typeof droneFleet = [];
    monitors.forEach(({ d, n }) => {
      for (let i = 0; i < Math.min(n, 3); i++) supportUnits.push({ d, n: 1 });
    });
    mission.setActiveDronesOnMap(planterUnits.length + supportUnits.length);

    // Assign trees to planter drones round-robin
    const assignments: Array<{ pos: LngLat; droneIdx: number; t: number }> = positions.map((pos, i) => ({
      pos,
      droneIdx: planterUnits.length > 0 ? i % planterUnits.length : 0,
      t: 0,
    }));
    const totalSimMs = 3800; // ~4s mission visualisation
    assignments.forEach((a, i) => {
      a.t = (i / Math.max(1, positions.length - 1)) * totalSimMs;
    });

    // Spawn drone markers and animate them along their assigned tree path
    if (planterUnits.length === 0) {
      // No planters — just spawn trees with stagger
      spawnTrees(map, positions, profile, treeColor, treeEmoji);
      gsap.delayedCall(2.4, () => mission.setPhase("complete"));
      return;
    }

    // Compute each drone's ordered visit list (trees assigned to it)
    const droneVisits: Array<Array<{ pos: LngLat; t: number; idx: number }>> = planterUnits.map(
      (_, di) =>
        assignments
          .map((a, idx) => ({ ...a, idx }))
          .filter((a) => a.droneIdx === di)
    );

    // Drone home base = polygon centroid
    const home: LngLat = turf.centroid(poly).geometry.coordinates as LngLat;

    planterUnits.forEach((unit, di) => {
      const el = makeDroneEl(unit.d.color);
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat(home)
        .addTo(map);
      droneMarkersRef.current.push(marker);

      const visits = droneVisits[di];
      if (visits.length === 0) return;

      // Build a smooth flight: home → visits[0..n] → home
      const path: Array<{ pos: LngLat; at: number; visitIdx: number | null }> = [
        { pos: home, at: 0, visitIdx: null },
        ...visits.map((v) => ({ pos: v.pos, at: v.t + (Math.random() * 250 - 125), visitIdx: v.idx })),
        { pos: home, at: totalSimMs + 600, visitIdx: null },
      ];
      // Ensure monotonic times
      for (let i = 1; i < path.length; i++) {
        if (path[i].at < path[i - 1].at + 60) path[i].at = path[i - 1].at + 60;
      }

      const start = performance.now();
      const tick = (now: number) => {
        const t = now - start;
        // Find segment
        let i = 0;
        while (i < path.length - 1 && path[i + 1].at < t) i++;
        const a = path[i];
        const b = path[Math.min(path.length - 1, i + 1)];
        const segDur = Math.max(1, b.at - a.at);
        const u = Math.min(1, Math.max(0, (t - a.at) / segDur));
        // Smoothstep
        const k = u * u * (3 - 2 * u);
        const lng = a.pos[0] + (b.pos[0] - a.pos[0]) * k;
        const lat = a.pos[1] + (b.pos[1] - a.pos[1]) * k;
        marker.setLngLat([lng, lat]);

        // Drop tree when arriving at a visit (u just crossed 1)
        if (b.visitIdx !== null && u >= 0.97 && !el.dataset[`d${b.visitIdx}`]) {
          el.dataset[`d${b.visitIdx}`] = "1";
          dropTreeAt(map, b.pos, profile, treeColor, treeEmoji);
          mission.setTreesPlanted(prev => prev + 1);
        }

        if (t < path[path.length - 1].at + 200) {
          const raf = requestAnimationFrame(tick);
          droneRafsRef.current.push(raf);
        } else {
          // Land animation
          gsap.to(el, { opacity: 0.25, scale: 0.85, duration: 0.5, ease: "expo.out" });
        }
      };
      const raf0 = requestAnimationFrame(tick);
      droneRafsRef.current.push(raf0);
    });

    // Spawn passive monitor drones orbiting the centroid
    supportUnits.forEach((unit, di) => {
      const el = makeDroneEl(unit.d.color);
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat(home)
        .addTo(map);
      droneMarkersRef.current.push(marker);
      const radius = 0.0035 + di * 0.0015;
      const phase0 = (di * Math.PI * 2) / Math.max(1, supportUnits.length);
      const start = performance.now();
      const tick = (now: number) => {
        const t = (now - start) / 1000;
        const ang = phase0 + t * 0.6;
        marker.setLngLat([home[0] + Math.cos(ang) * radius, home[1] + Math.sin(ang) * radius]);
        if (now - start < totalSimMs + 1000) {
          const raf = requestAnimationFrame(tick);
          droneRafsRef.current.push(raf);
        } else {
          gsap.to(el, { opacity: 0.2, duration: 0.6 });
        }
      };
      droneRafsRef.current.push(requestAnimationFrame(tick));
    });

    gsap.delayedCall(totalSimMs / 1000 + 1.2, () => {
      mission.setPhase("complete");
    });
  }, [areaError, areaKm2, activePlantId, activeTree, droneFleet, mission]);

  const flashWarn = () => {
    const el = containerRef.current;
    if (!el) return;
    gsap.fromTo(
      el,
      { boxShadow: "inset 0 0 0 0 hsl(0 80% 60% / 0)" },
      {
        boxShadow: "inset 0 0 0 3px hsl(0 80% 60% / 0.55)",
        duration: 0.18,
        yoyo: true,
        repeat: 1,
        ease: "sine.inOut",
        onComplete: () => { el.style.boxShadow = ""; },
      }
    );
  };

  const reset = () => {
    verticesRef.current = [];
    setPointCount(0);
    setPhase("idle");
    setAreaKm2(0);
    setAreaError(null);
    setSnapHover(false);
    setSuggested(null);
    setSuitability(0);
    cleanupDrones();
    mission.reset();
    onAreaChange(0);
    stopShimmer();
    updateGeometry();

    treeMarkersRef.current.forEach((m) => m.remove());
    treeMarkersRef.current = [];

    const map = mapRef.current;
    if (map) {
      (map.getSource("ghost") as maplibregl.GeoJSONSource)?.setData(turf.featureCollection([]));
      map.getCanvas().style.cursor = "";
    }

    if (lockedRef.current && map) {
      map.setFeatureState({ source: "provinces", id: lockedRef.current.id }, { selected: false });
    }
    lockedRef.current = null;
    setLockedProvince(null);
    onProvinceLock?.(null);

    if (searchPinRef.current) {
      searchPinRef.current.marker.remove();
      searchPinRef.current = null;
    }

    map?.flyTo({
      center: [43.7, 33.2],
      zoom: 5.4,
      pitch: 0,
      bearing: 0,
      speed: 0.8,
      curve: 1.5,
      easing: (t) => 1 - Math.pow(1 - t, 3),
    });

    setHint("Click a province to lock your planting region");
  };

  const undoLastPoint = () => {
    if (phase !== "drawing" || !verticesRef.current.length) return;
    verticesRef.current = verticesRef.current.slice(0, -1);
    setPointCount(verticesRef.current.length);
    updateGeometry();
  };

  // ---------- Search → constrained to locked province ----------
  const handleSearchSelect = (r: GeocodeResult) => {
    const map = mapRef.current;
    if (!map) return;

    if (searchPinRef.current) {
      searchPinRef.current.marker.remove();
      searchPinRef.current = null;
    }

    const el = document.createElement("div");
    el.className = "arbor-search-pin";
    el.innerHTML = `<div class="asp-ring"></div><div class="asp-dot"></div>`;
    const marker = new maplibregl.Marker({ element: el, anchor: "center" })
      .setLngLat([r.lng, r.lat])
      .addTo(map);
    searchPinRef.current = { marker, name: r.short };
    gsap.fromTo(el, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(2.4)" });

    if (r.bbox) {
      map.fitBounds(
        [[r.bbox[0], r.bbox[1]], [r.bbox[2], r.bbox[3]]],
        { padding: 100, duration: 1300, pitch: 0, bearing: 0, essential: true, maxZoom: 14 }
      );
    } else {
      map.flyTo({
        center: [r.lng, r.lat], zoom: 13, pitch: 0, bearing: 0,
        speed: 0.8, curve: 1.6, essential: true,
        easing: (t) => 1 - Math.pow(1 - t, 4),
      });
    }
    setHint(`Centered on ${r.short} · click "Start drawing" to outline your area`);
  };

  // Plant suggestion adoption — applies to mission via tree mapping
  const adoptSuggestion = () => {
    // The smart suggestion targets a PlantId; map it back to a sensible Iraqi tree.
    // For now, just keep visual hint — actual species swap is via TreeCatalog.
  };

  const recommendedDensity = suggested ? recommendDensity(suggested, mission.areaHa) : null;
  const activeProfile = PLANT_PROFILES[activePlantId] ?? null;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0 rounded-2xl overflow-hidden" />

      {/* Atmospheric overlay */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          background:
            "radial-gradient(ellipse at 30% 0%, hsl(142 92% 55% / 0.10), transparent 55%), radial-gradient(ellipse at 90% 100%, hsl(180 80% 55% / 0.08), transparent 55%)",
        }}
        aria-hidden
      />

      {/* Search bar — appears ONLY after a province is locked */}
      {lockedProvince && (
        <div className="absolute top-4 left-4 right-4 sm:right-auto sm:w-[440px] z-20 animate-fade-in">
          <MapSearch
            onSelect={handleSearchSelect}
            viewbox={lockedProvince.bbox}
            placeholder={`Search inside ${lockedProvince.id}…`}
          />
        </div>
      )}

      {/* Locked-province chip */}
      {lockedProvince && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 hidden md:block">
          <div className="glass-subtle px-3 py-1.5 rounded-full text-[11px] flex items-center gap-2 font-mono">
            <Lock className="h-3 w-3 text-primary" />
            <span className="text-muted-foreground uppercase tracking-wider">Locked</span>
            <span className="text-foreground/90">{lockedProvince.id}</span>
          </div>
        </div>
      )}

      {/* Province hover tooltip */}
      {tooltip.visible && !lockedProvince && (
        <div
          className="pointer-events-none absolute z-20 glass rounded-xl px-4 py-3 min-w-[200px] animate-fade-in"
          style={{ left: tooltip.x + 18, top: tooltip.y + 18, transform: "translate3d(0,0,0)" }}
        >
          <p className="text-[10px] tracking-[0.2em] uppercase text-primary/80 font-mono">Province</p>
          <p className="font-display text-lg leading-tight mt-0.5">{tooltip.name}</p>
          <div className="hairline my-2" />
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Capital</p>
              <p className="font-mono mt-0.5">{tooltip.capital}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Population</p>
              <p className="font-mono mt-0.5">{tooltip.popM.toFixed(2)}M</p>
            </div>
            <div className="col-span-2">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Area</p>
              <p className="font-mono mt-0.5 text-primary">
                {tooltip.areaKm2.toLocaleString(undefined, { maximumFractionDigits: 0 })} km²
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Smart suggestion card — appears when locked, before drawing */}
      {lockedProvince && suggested && phase !== "planted" && (
        <div className="absolute top-20 left-4 z-10 animate-fade-in">
          <div className="glass rounded-xl px-4 py-3 min-w-[230px]">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <p className="text-[10px] uppercase tracking-[0.2em] text-primary/80 font-mono">Smart suggestion</p>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-2xl leading-none">{PLANT_PROFILES[suggested].emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-display text-base leading-tight">{PLANT_PROFILES[suggested].label}</p>
                <p className="text-[10px] text-muted-foreground leading-snug truncate">
                  {PLANT_PROFILES[suggested].climateFit}
                </p>
              </div>
            </div>
            <div className="hairline my-2.5" />
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-muted-foreground uppercase tracking-wider">Soil fit</span>
              <span className="text-primary">{Math.round(suitability * 100)}%</span>
            </div>
            {recommendedDensity && (
              <div className="flex items-center justify-between text-[10px] font-mono mt-1">
                <span className="text-muted-foreground uppercase tracking-wider">Density</span>
                <span className="text-foreground/85">{recommendedDensity} /ha</span>
              </div>
            )}
            {activePlantId !== suggested && (
              <button
                onClick={adoptSuggestion}
                className="mt-3 w-full px-3 py-1.5 rounded-md bg-primary/15 hover:bg-primary/25 text-primary text-[11px] font-medium transition-colors"
              >
                Use {PLANT_PROFILES[suggested].label}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Hint bar */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 animate-fade-in max-w-[92%]">
        <div className="glass px-4 py-2.5 rounded-full text-xs sm:text-sm flex items-center gap-3 whitespace-nowrap">
          <span className="h-2 w-2 rounded-full bg-primary animate-glow-pulse" />
          <span className="text-foreground/85">{hint}</span>
          {phase === "drawing" && (
            <span className="text-muted-foreground font-mono">{pointCount} pt{pointCount === 1 ? "" : "s"}</span>
          )}
          {snapHover && (
            <span className="text-primary font-mono uppercase tracking-wider text-[10px]">snap</span>
          )}
        </div>
      </div>

      {/* Live area readout */}
      {pointCount >= 3 && (
        <div className="absolute top-20 right-4 z-10 animate-fade-in">
          <div className={[
            "glass rounded-xl px-4 py-3 min-w-[200px]",
            areaError ? "ring-1 ring-destructive/50" : "",
          ].join(" ")}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Planting area</p>
              {areaError && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
              {!areaError && phase !== "drawing" && <Check className="h-3.5 w-3.5 text-primary" />}
            </div>
            <p className="font-display text-2xl mt-1 leading-none">
              {areaKm2.toFixed(areaKm2 < 1 ? 3 : 2)} <span className="text-sm text-muted-foreground">km²</span>
            </p>
            <div className="grid grid-cols-2 gap-2 mt-1.5 text-[11px] font-mono text-muted-foreground">
              <div>
                <p className="text-[9px] uppercase tracking-wider">Hectares</p>
                <p className="text-foreground/85">{(areaKm2 * 100).toFixed(2)} ha</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wider">m²</p>
                <p className="text-foreground/85">{(areaKm2 * 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
            </div>
            <div className="hairline my-2" />
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-muted-foreground">Limit</span>
              <span className={areaError ? "text-destructive" : "text-primary"}>
                {SOFT_AREA_KM2}–{MAX_AREA_KM2} km²
              </span>
            </div>
            {phase !== "drawing" && activeProfile && !areaError && (
              <>
                <div className="hairline my-2" />
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Plant</span>
                  <span className="text-foreground/90 inline-flex items-center gap-1.5">
                    <span>{activeProfile.emoji}</span>
                    <span className="font-mono">{activeProfile.label}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] mt-1">
                  <span className="text-muted-foreground">Trees</span>
                  <span className="font-mono text-primary">
                    {mission.quantity.toLocaleString()}
                  </span>
                </div>
              </>
            )}
            {areaError && (
              <p className="text-[10px] text-destructive mt-2 leading-snug">{areaError}</p>
            )}
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex flex-wrap justify-center gap-2.5">
        <button
          onClick={reset}
          className="glass-subtle px-4 py-2.5 rounded-full text-sm hover-lift inline-flex items-center gap-2"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>

        {phase === "idle" && lockedProvince && (
          <button
            onClick={startDrawing}
            className="px-5 py-2.5 rounded-full bg-gradient-primary text-primary-foreground font-medium text-sm hover-lift shadow-glow-soft inline-flex items-center gap-2"
          >
            <Pencil className="h-3.5 w-3.5" />
            Start drawing
          </button>
        )}

        {phase === "drawing" && (
          <>
            <button
              onClick={undoLastPoint}
              disabled={pointCount === 0}
              className="glass-subtle px-4 py-2.5 rounded-full text-sm hover-lift disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Undo
            </button>
            <button
              onClick={finishArea}
              disabled={pointCount < MIN_POINTS_TO_CLOSE || !!areaError}
              className="px-5 py-2.5 rounded-full bg-gradient-primary text-primary-foreground font-medium text-sm hover-lift disabled:opacity-40 disabled:cursor-not-allowed shadow-glow-soft inline-flex items-center gap-2"
            >
              <Flag className="h-3.5 w-3.5" />
              Finish Area
            </button>
          </>
        )}

        {phase === "closed" && (
          <button
            onClick={confirmPlanting}
            disabled={!!areaError}
            className="px-6 py-2.5 rounded-full bg-gradient-primary text-primary-foreground font-medium text-sm hover-lift disabled:opacity-40 disabled:cursor-not-allowed shadow-glow-soft inline-flex items-center gap-2"
          >
            <Check className="h-3.5 w-3.5" />
            Confirm Planting
          </button>
        )}

        {phase === "planted" && (
          <div className="px-5 py-2.5 rounded-full glass-subtle text-sm inline-flex items-center gap-2 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-glow-pulse" />
            {treeMarkersRef.current.length} planted
          </div>
        )}
      </div>

      {/* Marker styles */}
      <style>{`
        .arbor-tree {
          width: 14px; height: 14px; pointer-events: none;
          display: grid; place-items: center;
          will-change: transform, opacity;
        }
        .arbor-tree::after {
          content: ""; width: 10px; height: 10px;
          border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
          background: var(--c, hsl(142 92% 55%));
          box-shadow: 0 0 12px hsl(142 92% 55% / 0.55);
        }
        .arbor-ripple {
          width: 28px; height: 28px; border-radius: 50%;
          border: 2px solid hsl(142 92% 60%);
          pointer-events: none;
          box-shadow: 0 0 16px hsl(142 92% 55% / 0.5);
        }
        .arbor-search-pin {
          width: 22px; height: 22px; position: relative; pointer-events: none;
        }
        .arbor-search-pin .asp-ring {
          position: absolute; inset: -6px; border-radius: 50%;
          border: 1.5px solid hsl(142 100% 70%);
          box-shadow: 0 0 18px hsl(142 92% 55% / 0.55);
          animation: asp-pulse 1.8s ease-out infinite;
        }
        .arbor-search-pin .asp-dot {
          position: absolute; inset: 6px; border-radius: 50%;
          background: hsl(142 100% 70%);
          box-shadow: 0 0 12px hsl(142 100% 60%);
        }
        @keyframes asp-pulse {
          0%   { transform: scale(0.8); opacity: 0.9; }
          100% { transform: scale(2.2); opacity: 0;   }
        }

        .maplibregl-ctrl-attrib { background: hsl(220 40% 8% / 0.5) !important; color: hsl(150 15% 70%) !important; }
        .maplibregl-ctrl-attrib a { color: hsl(150 15% 80%) !important; }
        .maplibregl-ctrl-group { background: hsl(220 40% 8% / 0.7) !important; border: 1px solid hsl(142 60% 45% / 0.25) !important; backdrop-filter: blur(12px); }
        .maplibregl-ctrl-group button { background-color: transparent !important; }
        .maplibregl-ctrl-group button + button { border-top: 1px solid hsl(142 60% 45% / 0.2) !important; }
      `}</style>
    </div>
  );
};

// ---------- helpers ----------
function applyPolyColors(map: maplibregl.Map, outer: string, inner: string, outline: string) {
  try {
    map.setPaintProperty("polygon-glow-outer", "fill-color", outer);
    map.setPaintProperty("polygon-glow-inner", "fill-color", inner);
    map.setPaintProperty("polygon-outline", "line-color", outline);
  } catch { /* style still loading */ }
}

function spawnRipple(map: maplibregl.Map, lngLat: LngLat) {
  for (let i = 0; i < 2; i++) {
    const el = document.createElement("div");
    el.className = "arbor-ripple";
    const m = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(lngLat).addTo(map);
    gsap.fromTo(
      el,
      { scale: 0.3, opacity: 0.9 },
      {
        scale: 4 + i * 1.5,
        opacity: 0,
        duration: 1.4,
        delay: i * 0.18,
        ease: "expo.out",
        onComplete: () => m.remove(),
      }
    );
  }
}

