import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as turf from "@turf/turf";
import { gsap } from "gsap";
import { RotateCcw, Check, AlertTriangle, Lock } from "lucide-react";
import type { MissionConfig } from "@/lib/pricing";
import { TREE_PROFILES } from "@/lib/pricing";
import provincesData from "@/data/iraq-provinces.json";
import { MapSearch, type GeocodeResult } from "./MapSearch";

interface Props {
  config: MissionConfig;
  onAreaChange: (areaHa: number) => void;
  onMissionRun: (running: boolean) => void;
}

type LngLat = [number, number];

// ---- Strict UX constraints ----
const MIN_POINTS = 4;
const MAX_POINTS = 6;
const MAX_AREA_KM2 = 5;          // hard cap (km²)
const SOFT_AREA_KM2 = 2;         // suggested zone
// Iraq bounding box (with a small breathing margin)
const IRAQ_BOUNDS: maplibregl.LngLatBoundsLike = [
  [38.0, 28.5],  // SW
  [49.2, 37.9],  // NE
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

export const MapExperience = ({ config, onAreaChange, onMissionRun }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const verticesRef = useRef<LngLat[]>([]);
  const droneMarkersRef = useRef<maplibregl.Marker[]>([]);
  const treeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const hoveredProvinceRef = useRef<string | null>(null);
  const lockedProvinceRef = useRef<{ id: string; geom: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> } | null>(null);
  const searchPinRef = useRef<SearchPin | null>(null);

  const [pointCount, setPointCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [areaKm2, setAreaKm2] = useState(0);
  const [areaError, setAreaError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [lockedProvinceName, setLockedProvinceName] = useState<string | null>(null);
  const [hint, setHint] = useState<string>(
    "Search a place or click a province to start"
  );
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
      // Strict: no rotation, no pitch — always north-up
      pitch: 0,
      bearing: 0,
      maxPitch: 0,
      minPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchZoomRotate: true,
      // Pan limits
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
        paint: {
          "fill-color": "hsl(180, 70%, 50%)",
          "fill-opacity": 0.04,
        },
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
            ["boolean", ["feature-state", "selected"], false], 0.16,
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
      map.addSource("polygon", { type: "geojson", data: turf.featureCollection([]) });
      map.addSource("droneTrail", { type: "geojson", data: turf.featureCollection([]) });

      map.addLayer({
        id: "polygon-glow-outer",
        type: "fill",
        source: "polygon",
        paint: {
          "fill-color": [
            "case",
            ["boolean", ["feature-state", "invalid"], false], "hsl(0, 80%, 60%)",
            "hsl(142, 92%, 55%)",
          ],
          "fill-opacity": 0.08,
        },
      });
      map.addLayer({
        id: "polygon-glow-inner",
        type: "fill",
        source: "polygon",
        paint: {
          "fill-color": [
            "case",
            ["boolean", ["feature-state", "invalid"], false], "hsl(0, 90%, 65%)",
            "hsl(142, 100%, 70%)",
          ],
          "fill-opacity": 0.18,
        },
      });
      map.addLayer({
        id: "polygon-outline",
        type: "line",
        source: "polygon",
        paint: {
          "line-color": [
            "case",
            ["boolean", ["feature-state", "invalid"], false], "hsl(0, 90%, 70%)",
            "hsl(142, 100%, 70%)",
          ],
          "line-width": 2.2,
          "line-blur": 1.4,
          "line-opacity": 1,
        },
      });

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
      map.getCanvas().style.cursor = running ? "wait" : "pointer";
    });

    map.on("mouseleave", "province-fill", () => {
      if (hoveredProvinceRef.current) {
        map.setFeatureState({ source: "provinces", id: hoveredProvinceRef.current }, { hover: false });
        hoveredProvinceRef.current = null;
      }
      setTooltip((t) => ({ ...t, visible: false }));
      map.getCanvas().style.cursor = "";
    });

    // ---------- Province click → cinematic flyTo (no pitch/bearing) ----------
    map.on("click", "province-fill", (e) => {
      if (running) return;
      // If a province is already locked, do not switch unless the user resets.
      if (lockedProvinceRef.current) return;
      // If user has already started drawing, do not steal the click.
      if (verticesRef.current.length > 0) return;

      const f = e.features?.[0];
      if (!f) return;
      const name = f.properties?.name as string;
      const geom = f as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
      const center = turf.centroid(geom).geometry.coordinates as LngLat;

      // Lock to province
      lockedProvinceRef.current = { id: name, geom };
      setLockedProvinceName(name);
      map.setFeatureState({ source: "provinces", id: name }, { selected: true });

      // Smooth zoom — north-up, flat
      map.flyTo({
        center,
        zoom: 9,
        pitch: 0,
        bearing: 0,
        speed: 0.7,
        curve: 1.6,
        easing: (t) => 1 - Math.pow(1 - t, 4),
        essential: true,
      });

      setHint(`Locked to ${name} · click ${MIN_POINTS}–${MAX_POINTS} points to draw your planting area`);
      e.preventDefault();
    });

    // ---------- Vertex placement ----------
    map.on("click", (e) => {
      if (running) return;
      if (e.defaultPrevented) return; // province-flyTo consumed it
      // Require a locked province before drawing
      if (!lockedProvinceRef.current) {
        setHint("Click a province first to lock your planting region");
        return;
      }
      if (confirmed) return;

      const lngLat: LngLat = [e.lngLat.lng, e.lngLat.lat];

      // Constrain to the locked province polygon
      if (!turf.booleanPointInPolygon(turf.point(lngLat), lockedProvinceRef.current.geom as turf.AllGeoJSON as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>)) {
        setHint(`Click inside ${lockedProvinceRef.current.id} to place a vertex`);
        flashWarn();
        return;
      }

      if (verticesRef.current.length >= MAX_POINTS) {
        setHint(`Maximum ${MAX_POINTS} points reached · Confirm or Reset`);
        return;
      }

      verticesRef.current = [...verticesRef.current, lngLat];
      setPointCount(verticesRef.current.length);
      spawnRipple(map, lngLat);
      updateGeometry();

      const n = verticesRef.current.length;
      if (n < MIN_POINTS) {
        setHint(`${MIN_POINTS - n} more point${MIN_POINTS - n > 1 ? "s" : ""} needed`);
      } else if (n < MAX_POINTS) {
        setHint(`Polygon ready · add up to ${MAX_POINTS - n} more or Confirm area`);
      } else {
        setHint(`Maximum ${MAX_POINTS} points reached · Confirm or Reset`);
      }
    });

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Geometry & area validation ----------
  const updateGeometry = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const verts = verticesRef.current;

    (map.getSource("vertices") as maplibregl.GeoJSONSource)?.setData(
      turf.featureCollection(verts.map((v) => turf.point(v)))
    );

    if (verts.length >= 2) {
      // Progressive line draw via GSAP — animate dashOffset feel by tweening line length
      const line = turf.lineString(verts);
      (map.getSource("path") as maplibregl.GeoJSONSource)?.setData(turf.featureCollection([line]));
    } else {
      (map.getSource("path") as maplibregl.GeoJSONSource)?.setData(turf.featureCollection([]));
    }

    if (verts.length >= 3) {
      const ring = [...verts, verts[0]];
      const poly = turf.polygon([ring]);
      (map.getSource("polygon") as maplibregl.GeoJSONSource)?.setData(turf.featureCollection([poly]));

      const m2 = turf.area(poly);
      const km2 = m2 / 1_000_000;
      setAreaKm2(km2);

      const invalid = km2 > MAX_AREA_KM2;
      // Toggle invalid feature-state on the polygon source's single feature
      // (we use a synthetic id 'planting' via promoteId-less source — instead recolor via paint condition based on area)
      // Simpler: switch paint property dynamically:
      map.setPaintProperty("polygon-glow-inner", "fill-color",
        invalid ? "hsl(0, 90%, 65%)" : "hsl(142, 100%, 70%)");
      map.setPaintProperty("polygon-glow-outer", "fill-color",
        invalid ? "hsl(0, 80%, 60%)" : "hsl(142, 92%, 55%)");
      map.setPaintProperty("polygon-outline", "line-color",
        invalid ? "hsl(0, 90%, 70%)" : "hsl(142, 100%, 70%)");

      if (invalid) {
        setAreaError(`Area exceeds ${MAX_AREA_KM2} km² limit (${km2.toFixed(2)} km²) — adjust your polygon`);
        onAreaChange(0); // do not surface invalid area to pricing
      } else {
        setAreaError(null);
        onAreaChange(Math.max(0.01, m2 / 10_000)); // hectares
      }
    } else {
      (map.getSource("polygon") as maplibregl.GeoJSONSource)?.setData(turf.featureCollection([]));
      setAreaKm2(0);
      setAreaError(null);
      onAreaChange(0);
    }
  }, [onAreaChange]);

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
    if (running) return;
    verticesRef.current = [];
    setPointCount(0);
    setConfirmed(false);
    setAreaKm2(0);
    setAreaError(null);
    updateGeometry();

    droneMarkersRef.current.forEach((m) => m.remove());
    droneMarkersRef.current = [];
    treeMarkersRef.current.forEach((m) => m.remove());
    treeMarkersRef.current = [];

    const map = mapRef.current;
    if (map?.getSource("droneTrail")) {
      (map.getSource("droneTrail") as maplibregl.GeoJSONSource).setData(turf.featureCollection([]));
    }

    // Unlock province
    if (lockedProvinceRef.current && map) {
      map.setFeatureState({ source: "provinces", id: lockedProvinceRef.current.id }, { selected: false });
    }
    lockedProvinceRef.current = null;
    setLockedProvinceName(null);

    // Remove search pin
    if (searchPinRef.current) {
      searchPinRef.current.marker.remove();
      searchPinRef.current = null;
    }

    // Fly back to country view
    map?.flyTo({
      center: [43.7, 33.2],
      zoom: 5.4,
      pitch: 0,
      bearing: 0,
      speed: 0.8,
      curve: 1.5,
      easing: (t) => 1 - Math.pow(1 - t, 3),
    });

    setHint("Search a place or click a province to start");
  };

  const confirmArea = () => {
    if (running || pointCount < MIN_POINTS || areaError) return;
    setConfirmed(true);
    setHint(`Area confirmed · ${areaKm2.toFixed(2)} km² ready for deployment`);
    // Cinematic emphasis pulse
    const map = mapRef.current;
    if (!map) return;
    gsap.fromTo(
      { v: 0.32 },
      { v: 0.32 },
      {
        v: 0.18,
        duration: 0.9,
        ease: "expo.out",
        onUpdate: function () {
          const o = (this.targets()[0] as { v: number }).v;
          map.setPaintProperty("polygon-glow-inner", "fill-opacity", o);
        },
      }
    );
  };

  // ---------- Search → flyTo + drop pin ----------
  const handleSearchSelect = (r: GeocodeResult) => {
    const map = mapRef.current;
    if (!map) return;

    // Remove previous pin
    if (searchPinRef.current) {
      searchPinRef.current.marker.remove();
      searchPinRef.current = null;
    }

    // Drop animated pin
    const el = document.createElement("div");
    el.className = "arbor-search-pin";
    el.innerHTML = `<div class="asp-ring"></div><div class="asp-dot"></div>`;
    const marker = new maplibregl.Marker({ element: el, anchor: "center" })
      .setLngLat([r.lng, r.lat])
      .addTo(map);
    searchPinRef.current = { marker, name: r.short };
    gsap.fromTo(el, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(2.4)" });

    // Smooth fly — north-up, flat
    if (r.bbox) {
      map.fitBounds(
        [
          [r.bbox[0], r.bbox[1]],
          [r.bbox[2], r.bbox[3]],
        ],
        { padding: 80, duration: 1400, pitch: 0, bearing: 0, essential: true, maxZoom: 13 }
      );
    } else {
      map.flyTo({
        center: [r.lng, r.lat],
        zoom: 12,
        pitch: 0,
        bearing: 0,
        speed: 0.8,
        curve: 1.6,
        easing: (t) => 1 - Math.pow(1 - t, 4),
        essential: true,
      });
    }

    setHint(`Centered on ${r.short} · click a province to lock and draw`);
  };

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

      {/* Search bar */}
      <div className="absolute top-4 left-4 right-4 sm:right-auto sm:w-[420px] z-20">
        <MapSearch onSelect={handleSearchSelect} />
      </div>

      {/* Locked-province chip */}
      {lockedProvinceName && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 hidden md:block">
          <div className="glass-subtle px-3 py-1.5 rounded-full text-[11px] flex items-center gap-2 font-mono">
            <Lock className="h-3 w-3 text-primary" />
            <span className="text-muted-foreground uppercase tracking-wider">Locked</span>
            <span className="text-foreground/90">{lockedProvinceName}</span>
          </div>
        </div>
      )}

      {/* Tooltip */}
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

      {/* Hint bar — bottom center, above buttons */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 animate-fade-in max-w-[92%]">
        <div className="glass px-4 py-2.5 rounded-full text-xs sm:text-sm flex items-center gap-3 whitespace-nowrap">
          <span className="h-2 w-2 rounded-full bg-primary animate-glow-pulse" />
          <span className="text-foreground/85">{hint}</span>
          <span className="text-muted-foreground font-mono">{pointCount}/{MAX_POINTS}</span>
        </div>
      </div>

      {/* Live area readout */}
      {pointCount >= 3 && (
        <div className="absolute top-20 right-4 z-10 animate-fade-in">
          <div className={[
            "glass rounded-xl px-4 py-3 min-w-[180px]",
            areaError ? "ring-1 ring-destructive/50" : "",
          ].join(" ")}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Area</p>
              {areaError && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
              {!areaError && confirmed && <Check className="h-3.5 w-3.5 text-primary" />}
            </div>
            <p className="font-display text-2xl mt-1 leading-none">
              {areaKm2.toFixed(areaKm2 < 1 ? 3 : 2)} <span className="text-sm text-muted-foreground">km²</span>
            </p>
            <p className="font-mono text-[11px] text-muted-foreground mt-1">
              {(areaKm2 * 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })} m²
            </p>
            <div className="hairline my-2" />
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-muted-foreground">Limit</span>
              <span className={areaError ? "text-destructive" : "text-primary"}>
                {SOFT_AREA_KM2}–{MAX_AREA_KM2} km²
              </span>
            </div>
            {areaError && (
              <p className="text-[10px] text-destructive mt-2 leading-snug">{areaError}</p>
            )}
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-3">
        <button
          onClick={reset}
          disabled={running}
          className="glass-subtle px-5 py-2.5 rounded-full text-sm hover-lift disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
        <button
          onClick={confirmArea}
          disabled={pointCount < MIN_POINTS || !!areaError || running || confirmed}
          className="relative px-6 py-2.5 rounded-full bg-gradient-primary text-primary-foreground font-medium text-sm hover-lift disabled:opacity-40 disabled:cursor-not-allowed shadow-glow-soft inline-flex items-center gap-2"
        >
          <Check className="h-3.5 w-3.5" />
          {confirmed ? "Area Confirmed" : "Confirm Area"}
        </button>
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
