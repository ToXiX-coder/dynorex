import { useCallback, useRef, useState } from "react";
import type { MappedError } from "@/features/auth/errors";

type Result<T> = { ok: true; data: T } | { ok: false; error: MappedError };

/**
 * Runs an async service call with busy + error state. Ignores double taps while busy, and drops
 * "cancelled" results (e.g. the Apple sheet was closed) instead of showing an error.
 */
export function useAction<A extends unknown[], T>(fn: (...args: A) => Promise<Result<T>>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(
    async (...args: A): Promise<Result<T> | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        const res = await fn(...args);
        if (!res.ok && !res.error.cancelled) setError(res.error);
        return res;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [fn],
  );

  return { run, busy, error, setError };
}
