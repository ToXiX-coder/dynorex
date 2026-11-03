import { useEffect, useState } from "react";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Animates from 0 to `target` with an ease-out (like a tach needle settling). With reduced motion, or when
 * the target isn't a number, it returns the target immediately. Screen readers get the final value from the
 * surrounding accessibility labels, never the in-between numbers.
 */
export function useCountUp(target: number, duration = 900) {
  const reduced = useReducedMotion();
  const still = reduced || !Number.isFinite(target);
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (still) return;
    let raf = 0;
    const t0 = Date.now();
    const step = () => {
      const p = Math.min(1, (Date.now() - t0) / duration);
      setValue(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, still]);
  return still ? target : value;
}
