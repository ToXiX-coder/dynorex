import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Small offline cache for the owner's own Garage, vehicle details and timelines (spec: up to 7 days).
 * Keyed by user so a different account on the same phone never sees someone else's cache.
 * VINs are stripped before caching: they're only fetched fresh from the server.
 */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PREFIX = "dynorex:cache:v1:";

export interface Cached<T> {
  data: T;
  savedAt: number;
}

function strip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (k, v) => (k === "vin" ? undefined : v))) as T;
}

export const cache = {
  key: (userId: string, name: string) => `${PREFIX}${userId}:${name}`,

  async get<T>(userId: string, name: string): Promise<Cached<T> | null> {
    try {
      const raw = await AsyncStorage.getItem(cache.key(userId, name));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Cached<T>;
      if (Date.now() - parsed.savedAt > TTL_MS) {
        await AsyncStorage.removeItem(cache.key(userId, name));
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  },

  async set<T>(userId: string, name: string, data: T): Promise<void> {
    try {
      await AsyncStorage.setItem(cache.key(userId, name), JSON.stringify({ data: strip(data), savedAt: Date.now() }));
    } catch {
      // a full or unavailable cache must never break the screen
    }
  },

  /** Sign-out and account deletion wipe this user's cache. */
  async clearUser(userId: string): Promise<void> {
    try {
      const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(`${PREFIX}${userId}:`));
      await AsyncStorage.multiRemove(keys);
    } catch {
      // ignore
    }
  },
};

/** "Last updated 3 hours ago" */
export function relativeAge(savedAt: number, now = Date.now()): string {
  const mins = Math.round((now - savedAt) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
