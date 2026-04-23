import { useEffect, useRef } from "react";
import { gsap } from "gsap";

/**
 * CinematicHero
 * - Floating island with parallax + ambient fog
 * - Drone with inertial flight path (organic, easing curves, slight lag)
 * - Trees grow with stagger + scale + rotation (not linear)
 * - Slow camera zoom / drift
 *
 * Pure SVG + GSAP — no canvas, no WebGL. Buttery on any device.
 */
export const CinematicHero = ({ onStart }: { onStart?: () => void }) => {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const island = useRef<SVGGElement>(null);
  const drone = useRef<SVGGElement>(null);
  const droneTilt = useRef<SVGGElement>(null);
  const trees = useRef<(SVGGElement | null)[]>([]);
  const headline = useRef<HTMLHeadingElement>(null);
  const sub = useRef<HTMLParagraphElement>(null);
  const cta = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // 1) Headline reveal
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.from(headline.current, { y: 60, opacity: 0, duration: 1.1 })
        .from(sub.current, { y: 24, opacity: 0, duration: 0.9 }, "-=0.7")
        .from(cta.current, { y: 18, opacity: 0, duration: 0.8 }, "-=0.6");

      // 2) Island slow float + camera drift on stage
      gsap.to(island.current, {
        y: 14,
        duration: 6,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });
      gsap.to(stage.current, {
        scale: 1.04,
        duration: 14,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        transformOrigin: "50% 55%",
      });

      // 3) Drone organic flight path
      // Define a polyline of waypoints over the island
      const path: { x: number; y: number }[] = [
        { x: 180, y: 160 },
        { x: 320, y: 130 },
        { x: 460, y: 175 },
        { x: 560, y: 220 },
        { x: 460, y: 280 },
        { x: 320, y: 305 },
        { x: 200, y: 270 },
        { x: 180, y: 160 },
      ];

      const droneTl = gsap.timeline({ repeat: -1, defaults: { ease: "sine.inOut" } });
      path.forEach((p, i) => {
        const next = path[(i + 1) % path.length];
        const dx = next.x - p.x;
        // Tilt drone in direction of travel (roll on x movement)
        droneTl.to(drone.current, {
          x: next.x,
          y: next.y,
          duration: 2.2 + Math.random() * 0.4,
          ease: "power2.inOut",
        }, i === 0 ? 0 : ">");
        droneTl.to(droneTilt.current, {
          rotation: gsap.utils.clamp(-14, 14, dx * 0.05),
          transformOrigin: "50% 50%",
          duration: 0.6,
          ease: "power3.out",
        }, "<");
      });

      // 4) Drone subtle bob (independent layer)
      gsap.to(drone.current, {
        y: "+=5",
        duration: 1.4,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });

      // 5) Trees grow organically with stagger
      const treeNodes = trees.current.filter(Boolean) as SVGGElement[];
      gsap.set(treeNodes, { scale: 0, rotation: -12, transformOrigin: "50% 100%" });
      gsap.to(treeNodes, {
        scale: 1,
        rotation: 0,
        duration: 1.4,
        ease: "elastic.out(1, 0.55)",
        stagger: { each: 0.08, from: "random" },
        delay: 0.6,
      });

      // 6) Parallax on pointer move
      const onMove = (e: PointerEvent) => {
        const r = root.current?.getBoundingClientRect();
        if (!r) return;
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        gsap.to(stage.current, {
          rotateY: px * 6,
          rotateX: -py * 4,
          duration: 1.2,
          ease: "expo.out",
          transformPerspective: 1200,
          transformOrigin: "50% 50%",
        });
      };
      root.current?.addEventListener("pointermove", onMove);
      return () => root.current?.removeEventListener("pointermove", onMove);
    }, root);

    return () => ctx.revert();
  }, []);

  // Tree positions (relative to viewBox 720x480)
  const treePositions = [
    { x: 230, y: 250, scale: 1.1 },
    { x: 290, y: 230, scale: 0.9 },
    { x: 350, y: 215, scale: 1.2 },
    { x: 410, y: 230, scale: 1.0 },
    { x: 470, y: 250, scale: 0.95 },
    { x: 260, y: 285, scale: 0.85 },
    { x: 380, y: 295, scale: 1.05 },
    { x: 440, y: 285, scale: 0.9 },
    { x: 320, y: 260, scale: 1.0 },
    { x: 500, y: 270, scale: 0.85 },
  ];

  return (
    <section
      ref={root}
      className="relative isolate overflow-hidden min-h-[100svh] flex items-center"
      aria-label="Hero"
    >
      {/* Atmospheric layers */}
      <div className="absolute inset-0 -z-10 bg-gradient-hero" />
      <div className="absolute inset-0 -z-10 noise" aria-hidden />
      {/* Soft ambient orbs */}
      <div
        className="absolute -z-10 left-1/4 top-1/3 h-[420px] w-[420px] rounded-full blur-3xl opacity-40 animate-drift"
        style={{ background: "radial-gradient(circle, hsl(142 92% 55% / 0.45), transparent 60%)" }}
        aria-hidden
      />
      <div
        className="absolute -z-10 right-1/4 bottom-1/4 h-[480px] w-[480px] rounded-full blur-3xl opacity-30 animate-drift"
        style={{ background: "radial-gradient(circle, hsl(180 80% 55% / 0.35), transparent 60%)", animationDelay: "-3s" }}
        aria-hidden
      />

      <div className="container mx-auto grid lg:grid-cols-2 gap-12 items-center py-22">
        {/* LEFT — Copy */}
        <div className="relative z-10 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-subtle text-xs uppercase tracking-[0.2em] text-primary mb-6 animate-fade-in">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-glow-pulse" />
            Live Reforestation Network
          </div>
          <h1
            ref={headline}
            className="font-display text-display-xl text-balance"
          >
            Plant a forest{" "}
            <span className="num-shimmer">from your screen.</span>
          </h1>
          <p
            ref={sub}
            className="mt-6 text-lg text-muted-foreground text-pretty max-w-lg"
          >
            ARBOR deploys autonomous drone swarms to reseed degraded land.
            Pick a region, draw an area, and watch a real forest take root —
            tree by tree, in real time.
          </p>
          <div ref={cta} className="mt-10 flex flex-wrap gap-4">
            <button
              onClick={onStart}
              className="group relative inline-flex items-center gap-2 px-7 py-4 rounded-full bg-gradient-primary text-primary-foreground font-medium hover-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="relative z-10">Start a Mission</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="relative z-10 transition-transform group-hover:translate-x-1">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-glow" />
            </button>
            <a href="#map" className="inline-flex items-center gap-2 px-7 py-4 rounded-full glass-subtle text-foreground/90 hover-lift">
              Explore the Map
            </a>
          </div>

          {/* Stats strip */}
          <dl className="mt-14 grid grid-cols-3 gap-6 max-w-md">
            {[
              { k: "2.4M+", v: "Trees seeded" },
              { k: "47", v: "Active fleets" },
              { k: "18", v: "Countries" },
            ].map((s) => (
              <div key={s.v} className="animate-fade-in">
                <dt className="text-2xl font-display num-shimmer">{s.k}</dt>
                <dd className="text-xs text-muted-foreground uppercase tracking-wider mt-1">{s.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* RIGHT — Cinematic floating island */}
        <div className="relative h-[520px] lg:h-[620px] [perspective:1400px]">
          <div ref={stage} className="absolute inset-0 will-change-transform [transform-style:preserve-3d]">
            <svg viewBox="0 0 720 480" className="w-full h-full overflow-visible">
              <defs>
                <radialGradient id="islandTop" cx="0.5" cy="0.4" r="0.6">
                  <stop offset="0%" stopColor="hsl(142 60% 38%)" />
                  <stop offset="60%" stopColor="hsl(150 55% 28%)" />
                  <stop offset="100%" stopColor="hsl(160 50% 18%)" />
                </radialGradient>
                <linearGradient id="islandSide" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(28 35% 28%)" />
                  <stop offset="100%" stopColor="hsl(28 40% 14%)" />
                </linearGradient>
                <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
                  <stop offset="0%" stopColor="hsl(142 92% 55% / 0.55)" />
                  <stop offset="100%" stopColor="hsl(142 92% 55% / 0)" />
                </radialGradient>
                <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="8" />
                </filter>
              </defs>

              {/* Glow halo behind island */}
              <ellipse cx="360" cy="290" rx="320" ry="60" fill="url(#glow)" filter="url(#soft)" />

              {/* Island */}
              <g ref={island}>
                {/* Underside (rocky cone) */}
                <path
                  d="M150 280 Q360 380 570 280 L500 410 Q360 470 220 410 Z"
                  fill="url(#islandSide)"
                />
                {/* Hanging roots */}
                <path d="M260 405 L255 450" stroke="hsl(28 35% 18%)" strokeWidth="3" strokeLinecap="round" />
                <path d="M340 425 L342 470" stroke="hsl(28 35% 18%)" strokeWidth="3" strokeLinecap="round" />
                <path d="M420 420 L418 462" stroke="hsl(28 35% 18%)" strokeWidth="3" strokeLinecap="round" />

                {/* Top surface */}
                <ellipse cx="360" cy="280" rx="220" ry="48" fill="url(#islandTop)" />
                {/* Surface highlight */}
                <ellipse cx="320" cy="265" rx="120" ry="14" fill="hsl(142 80% 65% / 0.18)" />

                {/* Trees */}
                {treePositions.map((t, i) => (
                  <g
                    key={i}
                    ref={(el) => (trees.current[i] = el)}
                    transform={`translate(${t.x} ${t.y}) scale(${t.scale})`}
                  >
                    {/* shadow */}
                    <ellipse cx="0" cy="6" rx="14" ry="3" fill="hsl(220 50% 0% / 0.45)" />
                    {/* trunk */}
                    <rect x="-2" y="-14" width="4" height="14" rx="1.5" fill="hsl(28 40% 20%)" />
                    {/* foliage layered for depth */}
                    <circle cx="0" cy="-22" r="14" fill="hsl(150 55% 22%)" />
                    <circle cx="-4" cy="-26" r="11" fill="hsl(142 70% 38%)" />
                    <circle cx="4" cy="-30" r="9" fill="hsl(142 92% 55%)" />
                  </g>
                ))}

                {/* Tiny lake */}
                <ellipse cx="430" cy="278" rx="22" ry="5" fill="hsl(180 80% 55% / 0.55)" />
                <ellipse cx="430" cy="277" rx="14" ry="2.5" fill="hsl(180 100% 80% / 0.6)" />
              </g>

              {/* Drone */}
              <g ref={drone} transform="translate(180 160)">
                <g ref={droneTilt}>
                  {/* shadow on island */}
                  <ellipse cx="0" cy="120" rx="22" ry="5" fill="hsl(220 50% 0% / 0.35)" filter="url(#soft)" />
                  {/* arms */}
                  <rect x="-22" y="-2" width="44" height="3" rx="1.5" fill="hsl(220 15% 20%)" />
                  <rect x="-2" y="-14" width="3" height="28" rx="1.5" fill="hsl(220 15% 20%)" />
                  {/* rotors */}
                  <circle cx="-22" cy="0" r="9" fill="hsl(220 20% 25% / 0.4)" stroke="hsl(142 92% 55% / 0.5)" strokeWidth="0.6" />
                  <circle cx="22"  cy="0" r="9" fill="hsl(220 20% 25% / 0.4)" stroke="hsl(142 92% 55% / 0.5)" strokeWidth="0.6" />
                  <circle cx="0" cy="-14" r="9" fill="hsl(220 20% 25% / 0.4)" stroke="hsl(142 92% 55% / 0.5)" strokeWidth="0.6" />
                  <circle cx="0" cy="14"  r="9" fill="hsl(220 20% 25% / 0.4)" stroke="hsl(142 92% 55% / 0.5)" strokeWidth="0.6" />
                  {/* body */}
                  <circle cx="0" cy="0" r="6" fill="hsl(220 15% 12%)" stroke="hsl(142 92% 55%)" strokeWidth="1" />
                  <circle cx="0" cy="0" r="2" fill="hsl(142 92% 65%)">
                    <animate attributeName="opacity" values="0.4;1;0.4" dur="1.4s" repeatCount="indefinite" />
                  </circle>
                </g>
              </g>

              {/* Particles / fog dots */}
              {Array.from({ length: 18 }).map((_, i) => (
                <circle
                  key={i}
                  cx={120 + ((i * 37) % 480)}
                  cy={120 + ((i * 53) % 280)}
                  r={1 + (i % 3) * 0.6}
                  fill="hsl(150 100% 90%)"
                  opacity={0.25}
                >
                  <animate
                    attributeName="opacity"
                    values="0.05;0.55;0.05"
                    dur={`${3 + (i % 5)}s`}
                    repeatCount="indefinite"
                    begin={`${i * 0.2}s`}
                  />
                </circle>
              ))}
            </svg>
          </div>
        </div>
      </div>

      {/* Bottom fade */}
      <div
        className="absolute inset-x-0 bottom-0 h-32 -z-10"
        style={{ background: "linear-gradient(to bottom, transparent, hsl(var(--background)))" }}
        aria-hidden
      />
    </section>
  );
};
