import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { CinematicHero } from "@/components/CinematicHero";
import { MapExperience } from "@/components/MapExperience";
import { MissionHUD } from "@/components/MissionHUD";
import type { MissionConfig } from "@/lib/pricing";

const Index = () => {
  const [config, setConfig] = useState<MissionConfig>({
    drones: 6,
    density: 800,
    areaHa: 0,
    species: "oak",
  });
  const [running, setRunning] = useState(false);

  const mapSectionRef = useRef<HTMLElement>(null);
  const sectionLabelRef = useRef<HTMLDivElement>(null);

  const scrollToMap = () => {
    mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Reveal animations on scroll
  useEffect(() => {
    if (!sectionLabelRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            gsap.from(e.target.children, {
              y: 24,
              opacity: 0,
              duration: 0.9,
              ease: "expo.out",
              stagger: 0.08,
            });
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.25 }
    );
    obs.observe(sectionLabelRef.current);
    return () => obs.disconnect();
  }, []);

  return (
    <main className="relative">
      {/* Top nav */}
      <header className="fixed top-0 inset-x-0 z-50 px-6 py-4">
        <div className="container mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 group" aria-label="ARBOR home">
            <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary shadow-glow-soft">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                <path d="M12 2L4 14h5l-3 8 9-12h-5l3-8z" fill="hsl(220 50% 4%)" />
              </svg>
            </span>
            <span className="font-display text-lg tracking-wide">ARBOR</span>
          </a>
          <nav className="hidden md:flex items-center gap-1 glass-subtle rounded-full px-2 py-1.5 text-sm">
            <a href="#map" className="px-3 py-1.5 rounded-full hover:bg-primary/10 transition-colors">Mission</a>
            <a href="#impact" className="px-3 py-1.5 rounded-full hover:bg-primary/10 transition-colors">Impact</a>
            <a href="#fleet" className="px-3 py-1.5 rounded-full hover:bg-primary/10 transition-colors">Fleet</a>
          </nav>
          <button
            onClick={scrollToMap}
            className="px-4 py-2 rounded-full bg-gradient-primary text-primary-foreground text-sm font-medium hover-lift"
          >
            Launch
          </button>
        </div>
      </header>

      {/* Hero */}
      <CinematicHero onStart={scrollToMap} />

      {/* Mission section */}
      <section
        id="map"
        ref={mapSectionRef}
        className="relative py-20 lg:py-28"
        aria-label="Mission planner"
      >
        <div className="container mx-auto">
          <div ref={sectionLabelRef} className="max-w-2xl mb-10">
            <p className="text-[11px] tracking-[0.3em] uppercase text-primary/80 font-mono">02 — Plan a mission</p>
            <h2 className="font-display text-display-lg mt-3 text-balance">
              Draw your area. Deploy the swarm.
            </h2>
            <p className="mt-4 text-muted-foreground text-pretty">
              Click anywhere on the map to drop polygon vertices. Once you've outlined an area,
              configure your fleet on the right and watch the mission unfold in real time.
            </p>
          </div>

          <div className="grid lg:grid-cols-[1fr_auto] gap-6 items-start">
            <div className="relative h-[640px] rounded-2xl glass overflow-hidden vignette">
              <MapExperience
                config={config}
                onAreaChange={(areaHa) => setConfig((c) => ({ ...c, areaHa }))}
                onMissionRun={setRunning}
                onPlantChange={(species) => setConfig((c) => ({ ...c, species }))}
              />
            </div>
            <MissionHUD config={config} onChange={setConfig} running={running} />
          </div>
        </div>
      </section>

      {/* Impact strip */}
      <section id="impact" className="relative py-20 border-t border-border/50">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { k: "Reforestation", t: "Native species first", d: "Drones plant species matched to regional ecosystems — oak, pine, palm — with seed pods designed to germinate in degraded soil." },
              { k: "Carbon capture", t: "Measurable CO₂ /yr", d: "Each mission logs predicted CO₂ sequestration based on tree species, density, and survival rates." },
              { k: "Transparent", t: "Donation by the tree", d: "You see exactly what each dollar buys — saplings, drone time, and verified planting coordinates." },
            ].map((c, i) => (
              <article key={i} className="glass rounded-2xl p-6 hover-lift">
                <p className="text-[10px] tracking-[0.25em] uppercase text-primary/80 font-mono">{c.k}</p>
                <h3 className="font-display text-2xl mt-2">{c.t}</h3>
                <p className="text-muted-foreground mt-3 text-sm leading-relaxed">{c.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-10">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} ARBOR — Reforesting at the speed of flight.</p>
          <p className="font-mono">v1.0 · build·earth</p>
        </div>
      </footer>
    </main>
  );
};

export default Index;
