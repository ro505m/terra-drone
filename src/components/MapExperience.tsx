import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as turf from "@turf/turf";
import { gsap } from "gsap";
import type { MissionConfig } from "@/lib/pricing";
import { TREE_PROFILES } from "@/lib/pricing";
import provincesData from "@/data/iraq-provinces.json";

interface Props {
  config: MissionConfig;
  onAreaChange: (areaHa: number) => void;
  onMissionRun: (running: boolean) => void;
}

type LngLat = [number, number];
const MAX_POINTS = 4;

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

export const MapExperience = ({ config, onAreaChange, onMissionRun }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const verticesRef = useRef<LngLat[]>([]);
  const droneMarkersRef = useRef<maplibregl.Marker[]>([]);
  const treeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const hoveredProvinceRef = useRef<string | null>(null);

  const [pointCount, setPointCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [hint, setHint] = useState<string>("Hover provinces · click 4 points to define your reforestation area");
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
      zoom: 5.2,
      pitch: 35,
      bearing: -10,
      attributionControl: { compact: true },
      dragRotate: true,
    });
    mapRef.current = map;

    map.on("load", () => {
      // ---------- Province sources & layers ----------
      map.addSource("provinces", { type: "geojson", data: PROVINCES, promoteId: "name" });

      // Atmospheric fog under provinces
      map.addLayer({
        id: "atmosphere-glow",
        type: "fill",
        source: "provinces",
        paint: {
          "fill-color": "hsl(180, 70%, 50%)",
          "fill-opacity": 0.04,
        },
      });

      // Base province fill
      map.addLayer({
        id: "province-fill",
        type: "fill",
        source: "provinces",
        paint: {
          "fill-color": [
            "case",
            ["boolean", ["feature-state", "hover"], false], "hsl(142, 92%, 55%)",
            "hsl(160, 50%, 25%)",
          ],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false], 0.18,
            0.04,
          ],
          "fill-opacity-transition": { duration: 350 },
          "fill-color-transition": { duration: 350 },
        },
      });

      // Soft glow border (always visible)
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

      // Animated bright border on hover
      map.addLayer({
        id: "province-border-hover",
        type: "line",
        source: "provinces",
        paint: {
          "line-color": "hsl(142, 100%, 70%)",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "hover"], false], 2.5,
            0,
          ],
          "line-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false], 1,
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
      map.addSource("polygon", { type: "geojson", data: turf.featureCollection([]) });
      map.addSource("droneTrail", { type: "geojson", data: turf.featureCollection([]) });

      // Polygon glowing fill
      map.addLayer({
        id: "polygon-glow-outer",
        type: "fill",
        source: "polygon",
        paint: { "fill-color": "hsl(142, 92%, 55%)", "fill-opacity": 0.08 },
      });
      map.addLayer({
        id: "polygon-glow-inner",
        type: "fill",
        source: "polygon",
        paint: { "fill-color": "hsl(142, 100%, 70%)", "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: "polygon-outline",
        type: "line",
        source: "polygon",
        paint: {
          "line-color": "hsl(142, 100%, 70%)",
          "line-width": 2.2,
          "line-blur": 1.4,
          "line-opacity": 1,
        },
      });

      // Drawing in-progress dashed path
      map.addLayer({
        id: "path-line",
        type: "line",
        source: "path",
        paint: {
          "line-color": "hsl(142, 92%, 65%)",
          "line-width": 2,
          "line-dasharray": [2, 2],
          "line-opacity": 0.85,
        },
      });

      // Drone trails (cyan, soft)
      map.addLayer({
        id: "drone-trail",
        type: "line",
        source: "droneTrail",
        paint: {
          "line-color": "hsl(180, 80%, 65%)",
          "line-width": 1.4,
          "line-opacity": 0.55,
          "line-blur": 0.8,
        },
      });

      // Vertex pulse aura
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
          "circle-radius": 5,
          "circle-color": "hsl(142, 100%, 70%)",
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

      const areaKm2 = turf.area(f as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>) / 1_000_000;

      setTooltip({
        visible: true,
        x: e.point.x,
        y: e.point.y,
        name,
        capital: (f.properties?.capital as string) ?? "—",
        popM: (f.properties?.popM as number) ?? 0,
        areaKm2,
      });
      map.getCanvas().style.cursor = running ? "wait" : "crosshair";
    });

    map.on("mouseleave", "province-fill", () => {
      if (hoveredProvinceRef.current) {
        map.setFeatureState({ source: "provinces", id: hoveredProvinceRef.current }, { hover: false });
        hoveredProvinceRef.current = null;
      }
      setTooltip((t) => ({ ...t, visible: false }));
      map.getCanvas().style.cursor = "";
    });

    // ---------- Province click → cinematic flyTo ----------
    map.on("click", "province-fill", (e) => {
      if (running) return;
      // Only zoom if no point is being added (handled below)
      // We allow vertex placement to take precedence; province flyTo only when zoom is low.
      if (verticesRef.current.length === 0 && map.getZoom() < 6.5) {
        const f = e.features?.[0];
        if (!f) return;
        const center = turf.centroid(f as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>).geometry.coordinates as LngLat;
        map.flyTo({
          center,
          zoom: 8.2,
          pitch: 55,
          bearing: map.getBearing() + 30,
          speed: 0.7,
          curve: 1.6,
          easing: (t) => 1 - Math.pow(1 - t, 4), // quartic ease-out
          essential: true,
        });
        e.preventDefault();
      }
    });

    // ---------- Vertex placement ----------
    map.on("click", (e) => {
      if (running) return;
      if (e.defaultPrevented) return; // province-flyTo consumed it
      if (verticesRef.current.length >= MAX_POINTS) {
        setHint(`Already ${MAX_POINTS} points placed · Reset to draw a new area`);
        return;
      }

      const lngLat: LngLat = [e.lngLat.lng, e.lngLat.lat];
      verticesRef.current = [...verticesRef.current, lngLat];
      setPointCount(verticesRef.current.length);
      updateGeometry();
      spawnRipple(map, lngLat);

      const remaining = MAX_POINTS - verticesRef.current.length;
      if (remaining > 0) {
        setHint(`${remaining} more point${remaining > 1 ? "s" : ""} to complete the area`);
      } else {
        setHint("Area defined · Configure your fleet and Deploy");
      }
    });

    // ---------- Cinematic idle drift ----------
    let raf = 0;
    const tick = () => {
      if (!running && mapRef.current && verticesRef.current.length === 0) {
        const b = mapRef.current.getBearing();
        mapRef.current.setBearing(b + 0.012);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Geometry ----------
  const updateGeometry = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const verts = verticesRef.current;

    (map.getSource("vertices") as maplibregl.GeoJSONSource)?.setData(
      turf.featureCollection(verts.map((v) => turf.point(v)))
    );

    if (verts.length >= 2) {
      (map.getSource("path") as maplibregl.GeoJSONSource)?.setData(
        turf.featureCollection([turf.lineString(verts)])
      );
    } else {
      (map.getSource("path") as maplibregl.GeoJSONSource)?.setData(turf.featureCollection([]));
    }

    if (verts.length >= 3) {
      const ring = [...verts, verts[0]];
      const poly = turf.polygon([ring]);
      (map.getSource("polygon") as maplibregl.GeoJSONSource)?.setData(turf.featureCollection([poly]));
      // Animate polygon glow pulse
      gsap.fromTo(
        { v: 0 },
        { v: 0 },
        {
          v: 1,
          duration: 0.6,
          ease: "expo.out",
          onUpdate: function () {
            const o = (this.targets()[0] as { v: number }).v;
            map.setPaintProperty("polygon-glow-inner", "fill-opacity", 0.18 + 0.12 * (1 - o));
          },
        }
      );
      const areaM2 = turf.area(poly);
      onAreaChange(Math.max(0.01, areaM2 / 10_000));
    } else {
      (map.getSource("polygon") as maplibregl.GeoJSONSource)?.setData(turf.featureCollection([]));
      onAreaChange(0);
    }
  }, [onAreaChange]);

  const reset = () => {
    if (running) return;
    verticesRef.current = [];
    setPointCount(0);
    updateGeometry();
    droneMarkersRef.current.forEach((m) => m.remove());
    droneMarkersRef.current = [];
    treeMarkersRef.current.forEach((m) => m.remove());
    treeMarkersRef.current = [];
    const map = mapRef.current;
    if (map?.getSource("droneTrail")) {
      (map.getSource("droneTrail") as maplibregl.GeoJSONSource).setData(turf.featureCollection([]));
    }
    setHint("Hover provinces · click 4 points to define your reforestation area");
  };

  // ---------- Mission ----------
  const deploy = () => {
    const map = mapRef.current;
    const verts = verticesRef.current;
    if (!map || verts.length < 3 || running) return;

    setRunning(true);
    onMissionRun(true);
    setHint("Mission in progress · drone swarm deploying");

    const ring = [...verts, verts[0]];
    const poly = turf.polygon([ring]);
    const center = turf.centroid(poly).geometry.coordinates as LngLat;

    // Cinematic camera: zoom + tilt + bearing with cubic-out easing
    map.flyTo({
      center,
      zoom: Math.max(9, map.getZoom() + 2.5),
      pitch: 60,
      bearing: map.getBearing() + 35,
      speed: 0.7,
      curve: 1.8,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      essential: true,
    });

    setTimeout(() => runSwarm(poly, center), 1500);
  };

  const runSwarm = (poly: GeoJSON.Feature<GeoJSON.Polygon>, center: LngLat) => {
    const map = mapRef.current;
    if (!map) return;

    const droneCount = config.drones;
    const totalTrees = Math.round(config.density * (turf.area(poly) / 10_000));
    const profile = TREE_PROFILES[config.species];

    // SAFE perimeter line: ensure at least 2 distinct coordinates
    const perimeterCoords = poly.geometry.coordinates[0];
    if (perimeterCoords.length < 2) {
      setRunning(false);
      onMissionRun(false);
      return;
    }
    const perimeter = turf.lineString(perimeterCoords);
    const perimeterLen = turf.length(perimeter, { units: "kilometers" });
    if (!isFinite(perimeterLen) || perimeterLen <= 0) {
      setRunning(false);
      onMissionRun(false);
      return;
    }

    // Spawn drones — staggered entrance via GSAP timeline
    const drones: {
      marker: maplibregl.Marker;
      offset: number;
      speed: number;
      delay: number;
      trail: LngLat[];
    }[] = [];

    const entranceTl = gsap.timeline();
    for (let i = 0; i < droneCount; i++) {
      const el = document.createElement("div");
      el.className = "arbor-drone";
      el.innerHTML = `
        <div class="ad-glow"></div>
        <div class="ad-body">
          <div class="ad-rotor tl"></div><div class="ad-rotor tr"></div>
          <div class="ad-rotor bl"></div><div class="ad-rotor br"></div>
          <div class="ad-core"></div>
        </div>`;
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat(center)
        .addTo(map);

      drones.push({
        marker,
        offset: i / droneCount,
        speed: 0.85 + Math.random() * 0.35, // 0.85 – 1.2
        delay: Math.random() * 0.4,         // up to 0.4s start jitter
        trail: [],
      });

      entranceTl.from(
        el,
        { scale: 0, opacity: 0, duration: 0.6, ease: "back.out(2)" },
        i * 0.06
      );
    }
    droneMarkersRef.current = drones.map((d) => d.marker);

    // Plant trees on schedule
    const totalMs = Math.min(45_000, Math.max(14_000, totalTrees * 18));
    const start = performance.now();
    const scheduledTrees = Math.min(totalTrees, 220);
    const plantInterval = totalMs / Math.max(1, scheduledTrees);
    let lastPlant = start;

    const tick = (now: number) => {
      const map2 = mapRef.current;
      if (!map2) return;

      const t = (now - start) / totalMs;
      if (t >= 1) {
        finish();
        return;
      }

      drones.forEach((d) => {
        // Apply per-drone delay
        const localT = Math.max(0, t - d.delay / (totalMs / 1000));
        const along = ((localT * d.speed) + d.offset) % 1;
        const distance = Math.min(perimeterLen, Math.max(0, along * perimeterLen));

        let ptAlong: LngLat;
        try {
          ptAlong = turf.along(perimeter, distance, { units: "kilometers" }).geometry
            .coordinates as LngLat;
        } catch {
          ptAlong = center;
        }

        // Sweep into interior with sinusoidal sway
        const sway = 0.22 + 0.10 * Math.sin(now / 700 + d.offset * 6.28);
        const pos: LngLat = [
          ptAlong[0] + (center[0] - ptAlong[0]) * sway,
          ptAlong[1] + (center[1] - ptAlong[1]) * sway,
        ];

        d.marker.setLngLat(pos);
        d.trail.push(pos);
        if (d.trail.length > 36) d.trail.shift();
      });

      const trailColl = turf.featureCollection(
        drones
          .filter((d) => d.trail.length > 1)
          .map((d) => turf.lineString(d.trail))
      );
      (map2.getSource("droneTrail") as maplibregl.GeoJSONSource)?.setData(trailColl);

      // Plant trees, biased to drone positions
      while (now - lastPlant > plantInterval && treeMarkersRef.current.length < scheduledTrees) {
        lastPlant += plantInterval;
        const drone = drones[treeMarkersRef.current.length % drones.length];
        const at = drone.marker.getLngLat();
        const jLng = (Math.random() - 0.5) * 0.0009;
        const jLat = (Math.random() - 0.5) * 0.0009;
        spawnTree(map2, [at.lng + jLng, at.lat + jLat], profile.color);
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    const finish = () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      drones.forEach((d, i) => {
        gsap.to(d.marker.getElement(), {
          opacity: 0,
          y: -36,
          duration: 0.8,
          delay: i * 0.04,
          ease: "expo.in",
          onComplete: () => d.marker.remove(),
        });
      });
      droneMarkersRef.current = [];
      setRunning(false);
      onMissionRun(false);
      setHint("Mission complete · forest seeded 🌱  (Reset to plan another)");
    };
  };

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0 rounded-2xl overflow-hidden" />

      {/* Atmospheric overlay (CSS-only) */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          background:
            "radial-gradient(ellipse at 30% 0%, hsl(142 92% 55% / 0.10), transparent 55%), radial-gradient(ellipse at 90% 100%, hsl(180 80% 55% / 0.08), transparent 55%)",
        }}
        aria-hidden
      />

      {/* Glassmorphism province tooltip */}
      {tooltip.visible && (
        <div
          className="pointer-events-none absolute z-20 glass rounded-xl px-4 py-3 min-w-[200px] animate-fade-in"
          style={{
            left: tooltip.x + 18,
            top: tooltip.y + 18,
            transform: "translate3d(0,0,0)",
          }}
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

      {/* Top hint bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 animate-fade-in">
        <div className="glass px-4 py-2.5 rounded-full text-xs sm:text-sm flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-primary animate-glow-pulse" />
          <span className="text-foreground/85">{hint}</span>
          <span className="text-muted-foreground font-mono">{pointCount}/{MAX_POINTS} pts</span>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-3">
        <button
          onClick={reset}
          disabled={running}
          className="glass-subtle px-5 py-2.5 rounded-full text-sm hover-lift disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Reset Area
        </button>
        <button
          onClick={deploy}
          disabled={pointCount < 3 || running}
          className="relative px-6 py-2.5 rounded-full bg-gradient-primary text-primary-foreground font-medium text-sm hover-lift disabled:opacity-40 disabled:cursor-not-allowed shadow-glow-soft"
        >
          {running ? "Deploying…" : "Deploy Fleet"}
        </button>
      </div>

      {/* Drone marker styles */}
      <style>{`
        .arbor-drone {
          width: 22px; height: 22px; position: relative; pointer-events: none;
          will-change: transform;
        }
        .arbor-drone .ad-glow {
          position: absolute; inset: -10px; border-radius: 50%;
          background: radial-gradient(circle, hsl(142 92% 55% / 0.55), transparent 70%);
          filter: blur(4px);
          animation: ad-pulse 1.6s ease-in-out infinite;
        }
        @keyframes ad-pulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 0.95; transform: scale(1.15); }
        }
        .arbor-drone .ad-body {
          position: absolute; inset: 0; display: grid; place-items: center;
        }
        .arbor-drone .ad-core {
          width: 7px; height: 7px; border-radius: 50%;
          background: hsl(142 100% 70%);
          box-shadow: 0 0 10px hsl(142 100% 60%), 0 0 20px hsl(142 100% 50% / 0.6);
        }
        .arbor-drone .ad-rotor {
          position: absolute; width: 7px; height: 7px; border-radius: 50%;
          background: hsl(220 15% 18%); border: 1px solid hsl(142 92% 55% / 0.6);
        }
        .arbor-drone .ad-rotor.tl { top: 0; left: 0; }
        .arbor-drone .ad-rotor.tr { top: 0; right: 0; }
        .arbor-drone .ad-rotor.bl { bottom: 0; left: 0; }
        .arbor-drone .ad-rotor.br { bottom: 0; right: 0; }

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

        .maplibregl-ctrl-attrib { background: hsl(220 40% 8% / 0.5) !important; color: hsl(150 15% 70%) !important; }
        .maplibregl-ctrl-attrib a { color: hsl(150 15% 80%) !important; }
      `}</style>
    </div>
  );
};

// ---------- helpers ----------
function spawnRipple(map: maplibregl.Map, lngLat: LngLat) {
  // Two-layer ripple for richer effect
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

function spawnTree(map: maplibregl.Map, lngLat: LngLat, color: string) {
  const el = document.createElement("div");
  el.className = "arbor-tree";
  el.style.setProperty("--c", color);
  const m = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(lngLat).addTo(map);
  gsap.fromTo(
    el,
    { scale: 0, opacity: 0, y: -8, rotation: -10 },
    {
      scale: 1,
      opacity: 1,
      y: 0,
      rotation: 0,
      duration: 0.85,
      ease: "elastic.out(1, 0.6)",
    }
  );
}
