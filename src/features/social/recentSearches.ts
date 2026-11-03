import AsyncStorage from "@react-native-async-storage/async-storage";

/** Recent searches live only on this device (never sent anywhere) and can be cleared. */
const KEY = "dynorex.recentSearches";
export const MAX_RECENT = 8;

/** Newest first, no duplicates (case-insensitive), trimmed, capped. */
export function addRecent(list: readonly string[], q: string): string[] {
  const t = q.trim().slice(0, 60);
  if (t.length < 2) return [...list];
  return [t, ...list.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENT);
}

export const recentSearches = {
  load: async (): Promise<string[]> => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const v = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT) : [];
    } catch {
      return [];
    }
  },
  save: (list: string[]) => AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => {}),
  clear: () => AsyncStorage.removeItem(KEY).catch(() => {}),
};
