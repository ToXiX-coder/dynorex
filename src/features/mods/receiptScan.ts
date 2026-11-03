import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { localToday } from "@/domain/when";
import { mapError, type MappedError } from "@/features/auth/errors";
import type { PreparedPhoto } from "@/services/media/photos";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";
import type { ScannedReceipt } from "./receiptFill";

export type { ScannedReceipt } from "./receiptFill";
type Result<T> = { ok: true; data: T } | { ok: false; error: MappedError };

async function base64Of(uri: string): Promise<string> {
  if (Platform.OS !== "web") return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Reads a receipt photo (already re-encoded on the phone, so no location data). The photo goes to the server and on
 * to Anthropic; nothing is kept. Returns null when it couldn't read a receipt. Pitch mode returns a labelled sample.
 */
export async function scanReceipt(photo: PreparedPhoto): Promise<Result<ScannedReceipt | null>> {
  if (config.demoMode) {
    await new Promise((r) => setTimeout(r, 900));
    const d = new Date();
    d.setDate(d.getDate() - 3);
    return {
      ok: true,
      data: {
        part: "Coilovers",
        brand: "BC Racing",
        part_number: "F-11-BR",
        total: 1195,
        currency: "USD",
        date: localToday(d),
        shop: "Sample Tuning Co.",
      },
    };
  }
  try {
    const sb = getSupabase();
    if (!sb) throw new Error("not_configured");
    const image = await base64Of(photo.uri);
    const { data, error } = await sb.functions.invoke<{ fields: ScannedReceipt | null }>("receipt-scan", {
      method: "POST",
      body: { image },
    });
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      if (status === 429) return { ok: false, error: { key: "rateLimited" } };
      if (status === 400) return { ok: false, error: { key: "photoRejected" } };
      throw error;
    }
    return { ok: true, data: data?.fields ?? null };
  } catch (e) {
    return { ok: false, error: mapError(e) };
  }
}
