import { useEffect, useRef } from "react";
import { gsap } from "gsap";

interface Props {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
}

export const AnimatedNumber = ({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 0.8,
  className,
}: Props) => {
  const ref = useRef<HTMLSpanElement>(null);
  const proxy = useRef({ v: value });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tween = gsap.to(proxy.current, {
      v: value,
      duration,
      ease: "expo.out",
      onUpdate: () => {
        el.textContent =
          prefix +
          proxy.current.v.toLocaleString("en-US", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          }) +
          suffix;
      },
    });
    return () => { tween.kill(); };
  }, [value, prefix, suffix, decimals, duration]);

  return (
    <span
      ref={ref}
      className={className}
      aria-label={`${prefix}${value.toFixed(decimals)}${suffix}`}
    >
      {prefix}
      {value.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
};
