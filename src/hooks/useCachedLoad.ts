import { useCallback, useEffect, useRef, useState } from "react";
import type { MappedError } from "@/features/auth/errors";
import { useAuth } from "@/features/auth/AuthProvider";
import { cache, relativeAge } from "@/services/cache";
import { mark } from "@/services/monitoring/perf";

type Result<T> = { ok: true; data: T } | { ok: false; error: MappedError };

/**
 * Shows the cached copy straight away (fast Garage render, works offline), then refreshes from the
 * server. If the refresh fails, the cached copy stays on screen with "Last updated …".
 */
export function useCachedLoad<T>(cacheName: string | null, load: () => Promise<Result<T>>) {
  const { user } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [fresh, setFresh] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<MappedError | null>(null);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await loadRef.current();
    if (r.ok) {
      if (cacheName === "garage") mark("garage_fresh");
      setData(r.data);
      setFresh(true);
      setError(null);
      if (user && cacheName) void cache.set(user.id, cacheName, r.data);
    } else {
      setError(r.error);
    }
    setLoading(false);
  }, [user, cacheName]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (user && cacheName) {
        const hit = await cache.get<T>(user.id, cacheName);
        if (alive && hit) {
          if (cacheName === "garage") mark("garage_cached");
          setData((d) => d ?? hit.data);
          setSavedAt(hit.savedAt);
        }
      }
      if (alive) await refresh();
    })();
    return () => {
      alive = false;
    };
  }, [user, cacheName, refresh]);

  return {
    data,
    loading,
    error,
    refresh,
    /** "3 hours ago" while showing cached data the server couldn't refresh */
    staleLabel: !fresh && savedAt ? relativeAge(savedAt) : null,
  };
}
