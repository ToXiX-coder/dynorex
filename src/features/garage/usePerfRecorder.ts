import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { MPH_PER_MPS, runPhase, simulatedRun, type RunPhase, type Sample } from "@/domain/perf";
import { haversineM } from "@/domain/routes";

/**
 * Live performance run (D-60). Location is read only while this screen is armed, at the fastest rate the phone
 * offers. GPS Doppler speed is used when the phone reports it (much steadier than position changes), otherwise
 * speed is worked out from the distance between fixes. Watching stops by itself when the run is done.
 */
export function usePerfRecorder() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [phase, setPhase] = useState<RunPhase | "idle">("idle");
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const sub = useRef<Location.LocationSubscription | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const buf = useRef<Sample[]>([]);
  const t0 = useRef(0);
  const last = useRef<{ lat: number; lng: number; t: number } | null>(null);

  const stopAll = useCallback(() => {
    sub.current?.remove();
    sub.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stopAll, [stopAll]);

  const push = useCallback(
    (s: Sample) => {
      buf.current = [...buf.current, s].slice(-3000);
      const p = runPhase(buf.current);
      setSamples(buf.current);
      setPhase(p);
      if (p === "done") stopAll();
    },
    [stopAll],
  );

  const arm = useCallback(async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      setPermission("denied");
      return false;
    }
    setPermission("granted");
    stopAll();
    buf.current = [];
    last.current = null;
    t0.current = Date.now();
    setSamples([]);
    setPhase("waiting");
    sub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 100, distanceInterval: 0 },
      (loc) => {
        const { latitude: lat, longitude: lng, speed } = loc.coords;
        let mph: number;
        if (speed !== null && speed >= 0) mph = speed * MPH_PER_MPS;
        else {
          const prev = last.current;
          const dt = prev ? (loc.timestamp - prev.t) / 1000 : 0;
          mph = prev && dt > 0 ? (haversineM([prev.lat, prev.lng], [lat, lng]) / dt) * MPH_PER_MPS : 0;
        }
        last.current = { lat, lng, t: loc.timestamp };
        push([Math.max(0, loc.timestamp - t0.current), Math.round(mph * 10) / 10]);
      },
    );
    return true;
  }, [push, stopAll]);

  /** Pitch mode: plays a sample 10 Hz pull in real time, so the whole flow can be shown parked. */
  const simulate = useCallback(() => {
    stopAll();
    const run = simulatedRun();
    buf.current = [];
    setSamples([]);
    setPhase("waiting");
    const start = Date.now();
    let i = 0;
    timer.current = setInterval(() => {
      const elapsed = Date.now() - start;
      while (i < run.length && run[i]![0] <= elapsed) push(run[i++]!);
      if (i >= run.length) stopAll();
    }, 50);
  }, [push, stopAll]);

  const reset = useCallback(() => {
    stopAll();
    buf.current = [];
    setSamples([]);
    setPhase("idle");
  }, [stopAll]);

  const speed = samples.length ? samples[samples.length - 1]![1] : 0;
  return { samples, phase, permission, speed, arm, simulate, reset, stop: stopAll };
}
