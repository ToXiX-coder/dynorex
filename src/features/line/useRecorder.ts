import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { acceptFix, simulatedDrive, trackDistanceM, type TrackPoint } from "@/domain/routes";
import { cache } from "@/services/cache";

/**
 * Foreground drive recorder. Location is used only while this screen is recording, after the person
 * agreed. Fixes are filtered (accuracy, jitter, impossible jumps). The track is saved on the phone as it
 * grows so a crash or a closed app doesn't lose the drive; it's sent to the server only on Save.
 */
export type RecorderState = "idle" | "recording" | "paused" | "stopped";
export type Draft = { points: TrackPoint[]; savedAt: number };
// Before Phase 7c the draft used one shared key, so a different account on the same phone could be offered
// someone else's track. Whoever owned it is unknown, so it is deleted, never adopted.
const LEGACY_DRAFT_KEY = "dynorex.lineDraft";
// Per-user key under the cache prefix: sign-out and account deletion wipe it (cache.clearUser).
const draftKey = (userId: string) => cache.key(userId, "lineDraft");

export const recorderDrafts = {
  load: async (userId: string): Promise<Draft | null> => {
    try {
      await AsyncStorage.removeItem(LEGACY_DRAFT_KEY);
      const raw = await AsyncStorage.getItem(draftKey(userId));
      const d = raw ? (JSON.parse(raw) as Draft) : null;
      return d && Array.isArray(d.points) && d.points.length > 0 ? d : null;
    } catch {
      return null;
    }
  },
  save: (userId: string, d: Draft) => AsyncStorage.setItem(draftKey(userId), JSON.stringify(d)).catch(() => {}),
  clear: (userId: string) => AsyncStorage.removeItem(draftKey(userId)).catch(() => {}),
};

export function useRecorder(userId: string) {
  const [state, setState] = useState<RecorderState>("idle");
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const sub = useRef<Location.LocationSubscription | null>(null);
  const buffer = useRef<TrackPoint[]>([]);

  const stopWatching = useCallback(() => {
    sub.current?.remove();
    sub.current = null;
  }, []);
  useEffect(() => stopWatching, [stopWatching]);

  const persist = useCallback(() => {
    void recorderDrafts.save(userId, { points: buffer.current, savedAt: Date.now() });
  }, [userId]);

  const watch = useCallback(async () => {
    sub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 3000 },
      (loc) => {
        const next: TrackPoint = [loc.coords.latitude, loc.coords.longitude, loc.timestamp];
        const prev = buffer.current[buffer.current.length - 1];
        if (!acceptFix(prev, next, loc.coords.accuracy ?? null)) return;
        buffer.current = [...buffer.current, next];
        setPoints(buffer.current);
        if (buffer.current.length % 10 === 0) persist();
      },
    );
  }, [persist]);

  const start = useCallback(
    async (resumeFrom?: TrackPoint[]) => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setPermission("denied");
        return false;
      }
      setPermission("granted");
      buffer.current = resumeFrom ?? [];
      setPoints(buffer.current);
      await watch();
      setState("recording");
      return true;
    },
    [watch],
  );

  const pause = useCallback(() => {
    stopWatching();
    persist();
    setState("paused");
  }, [stopWatching, persist]);

  const resume = useCallback(async () => {
    await watch();
    setState("recording");
  }, [watch]);

  const stop = useCallback(() => {
    stopWatching();
    persist();
    setState("stopped");
  }, [stopWatching, persist]);

  /** Pitch mode only: fill in a synthetic drive so the flow can be shown without driving. */
  const simulate = useCallback(() => {
    buffer.current = simulatedDrive();
    setPoints(buffer.current);
    persist();
    setState("stopped");
  }, [persist]);

  const restore = useCallback((d: Draft) => {
    buffer.current = d.points;
    setPoints(d.points);
    setState("stopped");
  }, []);

  const discard = useCallback(async () => {
    stopWatching();
    buffer.current = [];
    setPoints([]);
    await recorderDrafts.clear(userId);
    setState("idle");
  }, [stopWatching, userId]);

  const distanceM = trackDistanceM(points.map(([a, b]) => [a, b]));
  const durationS = points.length > 1 ? Math.round((points[points.length - 1]![2] - points[0]![2]) / 1000) : 0;
  return { state, points, permission, distanceM, durationS, start, pause, resume, stop, simulate, restore, discard };
}
