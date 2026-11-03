import { useCallback, useEffect, useState } from "react";

/** Countdown for "Resend in 42s" buttons, matching the server's resend interval. */
export function useCooldown(seconds: number) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const start = useCallback(() => setLeft(seconds), [seconds]);
  return { left, start };
}
