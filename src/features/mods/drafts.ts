import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

/**
 * Mod drafts kept on the phone. The form autosaves here, so a failed or offline save loses nothing.
 * A draft keeps its client_ref for life: submitting it twice (retry, offline replay) can never create
 * two mods, because the database refuses a second row with the same ref.
 */
export interface ModDraft {
  clientRef: string;
  vehicleId: string;
  fields: Record<string, string>;
  deltas: Record<string, { delta: string; unit: string }>;
  /** true once the person tapped Save while offline: sync will submit it when back online */
  queued: boolean;
  updatedAt: number;
}

const KEY = (userId: string) => `dynorex:drafts:v1:${userId}`;

async function readAll(userId: string): Promise<ModDraft[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY(userId));
    return raw ? (JSON.parse(raw) as ModDraft[]) : [];
  } catch {
    return [];
  }
}
async function writeAll(userId: string, drafts: ModDraft[]) {
  try {
    await AsyncStorage.setItem(KEY(userId), JSON.stringify(drafts));
  } catch {
    // storage full/unavailable: the form still works, it just can't keep a backup
  }
}

export const drafts = {
  newRef: () => Crypto.randomUUID(),

  /** The open (unqueued) draft for this vehicle's new-mod form, if any. */
  async openFor(userId: string, vehicleId: string): Promise<ModDraft | null> {
    return (await readAll(userId)).find((d) => d.vehicleId === vehicleId && !d.queued) ?? null;
  },

  async save(userId: string, draft: ModDraft): Promise<void> {
    const all = (await readAll(userId)).filter((d) => d.clientRef !== draft.clientRef);
    all.push({ ...draft, updatedAt: Date.now() });
    await writeAll(userId, all);
  },

  async remove(userId: string, clientRef: string): Promise<void> {
    await writeAll(
      userId,
      (await readAll(userId)).filter((d) => d.clientRef !== clientRef),
    );
  },

  async queued(userId: string): Promise<ModDraft[]> {
    return (await readAll(userId)).filter((d) => d.queued);
  },

  async count(userId: string, vehicleId?: string): Promise<number> {
    return (await readAll(userId)).filter((d) => d.queued && (!vehicleId || d.vehicleId === vehicleId)).length;
  },
};
