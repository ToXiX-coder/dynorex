import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TrackPoint } from "@/domain/routes";
import type { MappedError } from "@/features/auth/errors";
import { cache } from "@/services/cache";
import { lineService } from "./lineService";

/**
 * Drives saved while offline. Each keeps the client_ref it was first sent with, so retrying can never create a
 * second copy (save_route is idempotent on it). Stored per user under the cache prefix, so signing out or
 * deleting the account wipes them. Nothing is dropped silently: a drive the server refuses (e.g. the monthly
 * limit) stays listed with its reason until the person discards it.
 */
export type PendingDrive = {
  clientRef: string;
  title: string;
  share: boolean;
  points: TrackPoint[];
  queuedAt: number;
  lastError?: MappedError["key"];
};
const key = (userId: string) => cache.key(userId, "linePending");

async function read(userId: string): Promise<PendingDrive[]> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    const list = raw ? (JSON.parse(raw) as PendingDrive[]) : [];
    return Array.isArray(list)
      ? list.filter((d) => d && typeof d.clientRef === "string" && Array.isArray(d.points))
      : [];
  } catch {
    return [];
  }
}
async function write(userId: string, list: PendingDrive[]) {
  try {
    if (list.length) await AsyncStorage.setItem(key(userId), JSON.stringify(list));
    else await AsyncStorage.removeItem(key(userId));
  } catch {
    // storage full or unavailable: the draft copy still exists until the queue write succeeds
  }
}

let running: Promise<SyncResult> | null = null;
export type SyncResult = { uploaded: string[]; waiting: PendingDrive[] };

export const pendingDrives = {
  list: read,
  async add(userId: string, d: Omit<PendingDrive, "queuedAt">) {
    const list = await read(userId);
    if (!list.some((x) => x.clientRef === d.clientRef)) list.push({ ...d, queuedAt: Date.now() });
    await write(userId, list);
  },
  async discard(userId: string, clientRef: string) {
    await write(
      userId,
      (await read(userId)).filter((x) => x.clientRef !== clientRef),
    );
  },
  /** Try every waiting drive once (one sync at a time). Offline ones simply wait for next time. */
  sync(userId: string): Promise<SyncResult> {
    running ??= (async () => {
      const uploaded: string[] = [];
      const retried: PendingDrive[] = [];
      const batch = await read(userId);
      for (const d of batch) {
        const r = await lineService.save(d.clientRef, d.title, null, d.points, d.share);
        if (r.ok) uploaded.push(r.data);
        else retried.push({ ...d, lastError: r.error.key === "offline" ? d.lastError : r.error.key });
      }
      // drives queued while this ran are kept as they are
      const done = new Set(batch.map((d) => d.clientRef));
      const waiting = [...retried, ...(await read(userId)).filter((d) => !done.has(d.clientRef))];
      await write(userId, waiting);
      return { uploaded, waiting };
    })().finally(() => {
      running = null;
    });
    return running;
  },
};
