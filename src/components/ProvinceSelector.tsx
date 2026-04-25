import { useMemo, useState, useRef, useEffect } from "react";
import { ChevronDown, MapPin, Check } from "lucide-react";
import { gsap } from "gsap";
import { useI18n } from "@/lib/i18n";

export interface ProvinceOption {
  name: string;
  /** Arabic display label. */
  ar?: string;
  centroid?: [number, number];
}

interface Props {
  options: ProvinceOption[];
  value: string | null;
  onSelect: (name: string) => void;
  className?: string;
}

/** Province dropdown — bilingual, keyboard accessible. */
export const ProvinceSelector = ({ options, value, onSelect, className }: Props) => {
  const { t, lang, dir } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(() => options.find((o) => o.name === value) ?? null, [options, value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open && listRef.current) {
      gsap.fromTo(
        listRef.current.children,
        { y: -4, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.3, ease: "expo.out", stagger: 0.025 }
      );
    }
  }, [open]);

  const display = (o: ProvinceOption) => (lang === "ar" && o.ar ? o.ar : o.name);

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`} dir={dir}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="glass-subtle h-9 px-3 rounded-full inline-flex items-center gap-2 text-xs hover:bg-primary/10 transition-colors min-w-[170px] justify-between"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-1.5 truncate">
          <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="truncate">{selected ? display(selected) : t("pick_province")}</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul
          ref={listRef}
          className="absolute mt-2 left-0 right-0 glass rounded-2xl overflow-hidden p-1.5 max-h-72 overflow-y-auto z-30 min-w-[220px]"
          role="listbox"
        >
          {options.map((o) => {
            const active = value === o.name;
            return (
              <li key={o.name}>
                <button
                  onClick={() => { onSelect(o.name); setOpen(false); }}
                  className={[
                    "w-full text-start px-3 py-2 rounded-xl text-sm flex items-center gap-2 transition-colors",
                    active ? "bg-primary/15 text-primary" : "hover:bg-primary/5",
                  ].join(" ")}
                  role="option"
                  aria-selected={active}
                >
                  <span className="flex-1 truncate">{display(o)}</span>
                  {lang === "en" && o.ar && (
                    <span className="text-[10px] text-muted-foreground font-mono truncate">{o.ar}</span>
                  )}
                  {active && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
