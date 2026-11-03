/**
 * Supabase session storage backed by the platform keychain/keystore (expo-secure-store).
 * SecureStore values are size-limited, so long session JSON is split into chunks.
 * The store is injected so the chunking logic can be tested without native modules.
 */
export interface KeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export const CHUNK_SIZE = 1800;
const safeKey = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, "_");

export function chunkedStorage(store: KeyValueStore) {
  return {
    async getItem(key: string): Promise<string | null> {
      const k = safeKey(key);
      const countRaw = await store.getItemAsync(`${k}.n`);
      if (countRaw === null) return null;
      const count = Number(countRaw);
      if (!Number.isInteger(count) || count < 0 || count > 64) return null;
      const parts: string[] = [];
      for (let i = 0; i < count; i++) {
        const p = await store.getItemAsync(`${k}.${i}`);
        if (p === null) return null; // partial write: treat as signed out
        parts.push(p);
      }
      return parts.join("");
    },
    async setItem(key: string, value: string): Promise<void> {
      const k = safeKey(key);
      await this.removeItem(key);
      const count = Math.ceil(value.length / CHUNK_SIZE);
      for (let i = 0; i < count; i++) {
        await store.setItemAsync(`${k}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      }
      // count written last, so a crash mid-write reads as "no session"
      await store.setItemAsync(`${k}.n`, String(count));
    },
    async removeItem(key: string): Promise<void> {
      const k = safeKey(key);
      const countRaw = await store.getItemAsync(`${k}.n`);
      await store.deleteItemAsync(`${k}.n`);
      const count = Number(countRaw ?? 0);
      for (let i = 0; i < (Number.isInteger(count) ? Math.min(count, 64) : 0); i++) {
        await store.deleteItemAsync(`${k}.${i}`);
      }
    },
  };
}
