import { useEffect, useRef, useState } from "react";
import { Search, Loader2, MapPin, X } from "lucide-react";
import { gsap } from "gsap";

export interface GeocodeResult {
  id: string;
  name: string;          // display name
  short: string;         // primary label
  type: string;          // e.g. "city", "town", "road"
  lng: number;
  lat: number;
  bbox?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
}

interface Props {
  /** lng/lat bounding box used to constrain results (Iraq by default) */
  viewbox?: [number, number, number, number];
  /** ISO country codes to bias the search */
  countryCodes?: string;
  onSelect: (r: GeocodeResult) => void;
  className?: string;
  placeholder?: string;
}

/**
 * Nominatim-powered search input.
 * Free, open-source, MapLibre-friendly. Constrained to Iraq by default.
 */
export const MapSearch = ({
  viewbox = [38.79, 29.06, 48.57, 37.39], // Iraq bounding box
  countryCodes = "iq",
  onSelect,
  className,
}: Props) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Debounced fetch
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = window.setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", query);
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("limit", "6");
        url.searchParams.set("countrycodes", countryCodes);
        url.searchParams.set("viewbox", viewbox.join(","));
        url.searchParams.set("bounded", "1");

        const res = await fetch(url.toString(), {
          signal: ac.signal,
          headers: { "Accept-Language": "en" },
        });
        if (!res.ok) throw new Error(`Geocoder ${res.status}`);
        const data = (await res.json()) as Array<{
          place_id: number;
          display_name: string;
          name?: string;
          type: string;
          lon: string;
          lat: string;
          boundingbox?: [string, string, string, string];
          address?: Record<string, string>;
        }>;

        const mapped: GeocodeResult[] = data.map((d) => {
          const a = d.address ?? {};
          const short =
            d.name ||
            a.city ||
            a.town ||
            a.village ||
            a.suburb ||
            a.road ||
            d.display_name.split(",")[0];
          const bb = d.boundingbox;
          return {
            id: String(d.place_id),
            name: d.display_name,
            short,
            type: d.type,
            lng: parseFloat(d.lon),
            lat: parseFloat(d.lat),
            bbox: bb
              ? [parseFloat(bb[2]), parseFloat(bb[0]), parseFloat(bb[3]), parseFloat(bb[1])]
              : undefined,
          };
        });
        setResults(mapped);
        setOpen(true);
        setActiveIdx(-1);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 320);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, countryCodes, viewbox]);

  // Animate list entrance
  useEffect(() => {
    if (open && listRef.current && results.length) {
      gsap.fromTo(
        listRef.current.children,
        { y: -6, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.35, ease: "expo.out", stagger: 0.04 }
      );
    }
  }, [open, results]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, []);

  const choose = (r: GeocodeResult) => {
    setQuery(r.short);
    setOpen(false);
    onSelect(r);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || !results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = activeIdx >= 0 ? results[activeIdx] : results[0];
      if (pick) choose(pick);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ""}`}>
      <div className="glass rounded-full pl-4 pr-2 py-2 flex items-center gap-2 shadow-glow-soft">
        {loading ? (
          <Loader2 className="h-4 w-4 text-primary animate-spin" />
        ) : (
          <Search className="h-4 w-4 text-primary/80" />
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search city, district, or street in Iraq…"
          className="bg-transparent outline-none text-sm flex-1 placeholder:text-muted-foreground min-w-0"
          aria-label="Search location"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setResults([]);
              setOpen(false);
            }}
            className="h-7 w-7 grid place-items-center rounded-full hover:bg-primary/10 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul
          ref={listRef}
          className="absolute mt-2 left-0 right-0 glass rounded-2xl overflow-hidden p-1.5 max-h-80 overflow-y-auto z-30"
        >
          {results.map((r, i) => (
            <li key={r.id}>
              <button
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => choose(r)}
                className={[
                  "w-full text-left px-3 py-2.5 rounded-xl flex items-start gap-3 transition-colors",
                  activeIdx === i ? "bg-primary/10" : "hover:bg-primary/5",
                ].join(" ")}
              >
                <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.short}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{r.name}</p>
                </div>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground/80 font-mono shrink-0 mt-1">
                  {r.type}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
