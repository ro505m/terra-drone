import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as turf from "@turf/turf";
import { gsap } from "gsap";
import type { MissionConfig } from "@/lib/pricing";
import { TREE_PROFILES } from "@/lib/pricing";

interface Props {
  config: MissionConfig;
  onAreaChange: (areaHa: number) => void;
  onMissionRun: (running: boolean) => void;
}

type LngLat = [number, number];

// Premium dark basemap (no API key required — CARTO public tiles)
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

/**
 * MapExperience
 * - Click anywhere to drop polygon vertices (animated ripple + pulse)
 * - Lines draw progressively, polygon fills with neon glow
 * - "Deploy fleet" launches a swarm of drones along the polygon's perimeter,
 *   each with its own offset & speed jitter. Trees spawn behind them.
 */
export const MapExperience = ({ config, onAreaChange, onMissionRun }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const verticesRef = useRef<LngLat[]>([]);
  const droneMarkersRef = useRef<maplibregl.Marker[]>([]);
  const treeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const animFrameRef = useRef<number | null>(null);

  const [pointCount, setPointCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [hint, setHint] = useState<string>("Click on the map to drop area vertices · 3+ points required");

  // ---------- Map init ----------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      center: [10.5, 30.5],
      zoom: 2.2,
      pitch: 25,
      bearing: -8,
      attributionControl: { compact: true },
      dragRotate: true,
    });
    mapRef.current = map;

    map.on("load", () => {
      // Sources
      map.addSource("vertices", { type: "geojson", data: turf.featureCollection([]) });
      map.addSource("path",     { type: "geojson", data: turf.featureCollection([]) });
      map.addSource("polygon",  { type: "geojson", data: turf.featureCollection([]) });
      map.addSource("droneTrail", { type: "geojson", data: turf.featureCollection([]) });

      // Polygon glow (under everything)
      map.addLayer({
        id: "polygon-glow",
        type: "fill",
        source: "polygon",
        paint: {
          "fill-color": "hsl(142, 92%, 55%)",
          "fill-opacity": 0.14,
        },
      });
      map.addLayer({
        id: "polygon-outline",
        type: "line",
        source: "polygon",
        paint: {
          "line-color": "hsl(142, 92%, 60%)",
          "line-width": 2,
          "line-blur": 1.2,
          "line-opacity": 0.95,
        },
      });

      // Drawing path while building
      map.addLayer({
        id: "path-line",
        type: "line",
        source: "path",
        paint: {
          "line-color": "hsl(142, 92%, 65%)",
          "line-width": 2.2,
          "line-dasharray": [2, 2],
          "line-opacity": 0.9,
        },
      });

      // Drone trail
      map.addLayer({
        id: "drone-trail",
        type: "line",
        source: "droneTrail",
        paint: {
          "line-color": "hsl(180, 80%, 65%)",
          "line-width": 1.4,
          "line-opacity": 0.6,
          "line-blur": 0.6,
        },
      });

      // Vertex points — pulsing
      map.addLayer({
        id: "vertex-pulse",
        type: "circle",
        source: "vertices",
        paint: {
          "circle-radius": 14,
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

    // Click handler
    map.on("click", (e) => {
      if (running) return;
      const lngLat: LngLat = [e.lngLat.lng, e.lngLat.lat];
      verticesRef.current = [...verticesRef.current, lngLat];
      setPointCount(verticesRef.current.length);
      updateGeometry();

      // Click ripple — DOM marker animated by GSAP
      spawnRipple(map, lngLat);
    });

    // Subtle continuous bearing drift for cinematic feel
    let raf = 0;
    let startBearing = map.getBearing();
    const tick = () => {
      if (!running && mapRef.current) {
        startBearing += 0.015;
        mapRef.current.setBearing(startBearing);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Geometry updates ----------
  const updateGeometry = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const verts = verticesRef.current;

    // Vertices
    (map.getSource("vertices") as maplibregl.GeoJSONSource)?.setData(
      turf.featureCollection(verts.map((v) => turf.point(v)))
    );

    // Path line
    if (verts.length >= 2) {
      (map.getSource("path") as maplibregl.GeoJSONSource)?.setData(
        turf.featureCollection([turf.lineString(verts)])
      );
    } else {
      (map.getSource("path") as maplibregl.GeoJSONSource)?.setData(turf.featureCollection([]));
    }

    // Polygon
    if (verts.length >= 3) {
      const ring = [...verts, verts[0]];
      const poly = turf.polygon([ring]);
      (map.getSource("polygon") as maplibregl.GeoJSONSource)?.setData(turf.featureCollection([poly]));
      const areaM2 = turf.area(poly);
      onAreaChange(Math.max(0.1, areaM2 / 10_000)); // hectares
    } else {
      (map.getSource("polygon") as maplibregl.GeoJSONSource)?.setData(turf.featureCollection([]));
      onAreaChange(0);
    }
  }, [onAreaChange]);

  // ---------- Reset ----------
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
    setHint("Click on the map to drop area vertices · 3+ points required");
  };

  // ---------- Mission ----------
  const deploy = () => {
    const map = mapRef.current;
    const verts = verticesRef.current;
    if (!map || verts.length < 3 || running) return;

    setRunning(true);
    onMissionRun(true);
    setHint("Mission in progress · drones deploying");

    const ring = [...verts, verts[0]];
    const poly = turf.polygon([ring]);
    const center = turf.centroid(poly).geometry.coordinates as LngLat;

    // Cinematic camera move into the area
    map.flyTo({
      center,
      zoom: Math.max(8, map.getZoom() + 4),
      pitch: 55,
      bearing: map.getBearing() + 25,
      speed: 0.8,
      curve: 1.6,
      essential: true,
    });

    // Wait for camera then run swarm
    setTimeout(() => runSwarm(poly, center), 1400);
  };

  const runSwarm = (poly: GeoJSON.Feature<GeoJSON.Polygon>, center: LngLat) => {
    const map = mapRef.current;
    if (!map) return;

    const droneCount = config.drones;
    const totalTrees = Math.round(config.density * (turf.area(poly) / 10_000));
    const treesPerDrone = Math.max(3, Math.ceil(totalTrees / droneCount / 8)); // sample
    const profile = TREE_PROFILES[config.species];

    // Build a smooth perimeter line and sample evenly
    const perimeter = turf.lineString([...poly.geometry.coordinates[0]]);
    const perimeterLen = turf.length(perimeter, { units: "kilometers" });

    // Trail accumulator
    const trailFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];

    // Spawn drone DOM markers
    const drones: { marker: maplibregl.Marker; offset: number; speed: number; trail: LngLat[] }[] = [];
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
        offset: i / droneCount,                       // even distribution along path
        speed: 0.9 + Math.random() * 0.25,            // slight variation
        trail: [],
      });

      // Entrance animation
      gsap.from(el, { scale: 0, opacity: 0, duration: 0.7, ease: "back.out(2)", delay: i * 0.05 });
    }

    // Animation
    const totalMs = Math.min(45_000, Math.max(12_000, totalTrees * 18));
    const start = performance.now();

    // Plant trees on a schedule
    const scheduledTrees = Math.min(totalTrees, 200); // cap DOM markers for perf
    const plantInterval = totalMs / scheduledTrees;
    let lastPlant = start;

    const tick = (now: number) => {
      const t = (now - start) / totalMs; // 0 → 1
      if (t >= 1) {
        finishMission();
        return;
      }

      // Move each drone along perimeter with offset + slight curve into interior
      drones.forEach((d) => {
        const along = ((t * d.speed) + d.offset) % 1;
        const distance = along * perimeterLen;
        const ptAlong = turf.along(perimeter, distance, { units: "kilometers" }).geometry.coordinates as LngLat;

        // Pull slightly toward centroid for "sweeping interior" feel
        const interpToward = (a: number, b: number, k: number) => a + (b - a) * k;
        const sway = 0.18 + 0.08 * Math.sin((now / 800) + d.offset * 6);
        const pos: LngLat = [
          interpToward(ptAlong[0], center[0], sway),
          interpToward(ptAlong[1], center[1], sway),
        ];

        d.marker.setLngLat(pos);
        d.trail.push(pos);
        if (d.trail.length > 40) d.trail.shift();
      });

      // Update trail
      const trailColl = turf.featureCollection(
        drones.filter((d) => d.trail.length > 1).map((d) => turf.lineString(d.trail))
      );
      (map.getSource("droneTrail") as maplibregl.GeoJSONSource)?.setData(trailColl);

      // Plant trees
      while (now - lastPlant > plantInterval && treeMarkersRef.current.length < scheduledTrees) {
        lastPlant += plantInterval;
        const drone = drones[treeMarkersRef.current.length % drones.length];
        const at = drone.marker.getLngLat();
        // Random small jitter
        const jitterLng = (Math.random() - 0.5) * 0.0008;
        const jitterLat = (Math.random() - 0.5) * 0.0008;
        spawnTree(map, [at.lng + jitterLng, at.lat + jitterLat], profile.color);
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    droneMarkersRef.current = drones.map((d) => d.marker);
    animFrameRef.current = requestAnimationFrame(tick);

    const finishMission = () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      // Lift drones away
      drones.forEach((d, i) => {
        gsap.to(d.marker.getElement(), {
          opacity: 0,
          y: -30,
          duration: 0.8,
          delay: i * 0.04,
          ease: "expo.in",
          onComplete: () => d.marker.remove(),
        });
      });
      droneMarkersRef.current = [];
      setRunning(false);
      onMissionRun(false);
      setHint("Mission complete — forest seeded 🌱  (Reset to plan another)");
    };
  };

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0 rounded-2xl overflow-hidden" />

      {/* Top hint bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 animate-fade-in">
        <div className="glass px-4 py-2.5 rounded-full text-xs sm:text-sm flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-primary animate-glow-pulse" />
          <span className="text-foreground/85">{hint}</span>
          <span className="text-muted-foreground font-mono">{pointCount} pts</span>
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
          content: ""; width: 10px; height: 10px; border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
          background: var(--c, hsl(142 92% 55%));
          box-shadow: 0 0 12px hsl(142 92% 55% / 0.55);
        }

        .arbor-ripple {
          width: 28px; height: 28px; border-radius: 50%;
          border: 2px solid hsl(142 92% 60%);
          pointer-events: none;
        }

        .maplibregl-ctrl-attrib { background: hsl(220 40% 8% / 0.5) !important; color: hsl(150 15% 70%) !important; }
        .maplibregl-ctrl-attrib a { color: hsl(150 15% 80%) !important; }
      `}</style>
    </div>
  );
};

// ---------- helpers ----------
function spawnRipple(map: maplibregl.Map, lngLat: LngLat) {
  const el = document.createElement("div");
  el.className = "arbor-ripple";
  const m = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(lngLat).addTo(map);
  gsap.fromTo(el, { scale: 0.3, opacity: 0.9 }, {
    scale: 4, opacity: 0, duration: 1.2, ease: "expo.out",
    onComplete: () => m.remove(),
  });
}

function spawnTree(map: maplibregl.Map, lngLat: LngLat, color: string) {
  const el = document.createElement("div");
  el.className = "arbor-tree";
  el.style.setProperty("--c", color);
  const m = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(lngLat).addTo(map);
  gsap.fromTo(
    el,
    { scale: 0, opacity: 0, y: -8 },
    { scale: 1, opacity: 1, y: 0, duration: 0.8, ease: "elastic.out(1, 0.6)" }
  );
}
