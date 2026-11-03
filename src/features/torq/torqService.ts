import { demoTorqService } from "@/demo/v2";
import type { Insights } from "@/domain/torq";
import { mapError, type MappedError } from "@/features/auth/errors";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";

/**
 * Torq chat. Community numbers come from public.mod_insights (public builds only, privacy thresholds, gains as
 * ranges). Answers come from the torq-chat Edge Function, which holds the AI key and the rate limit; the app
 * never talks to the model provider directly. Conversations aren't stored.
 */
export type Result<T = void> = { ok: true; data: T } | { ok: false; error: MappedError };
export type ChatTurn = { role: "user" | "assistant"; content: string };
export type TorqCar = { year: number | null; make: string; model: string; myMods: string[] };
export type TorqReply = { reply: string; insights: Insights | null };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: mapError(e) };
  }
}
function sb() {
  const c = getSupabase();
  if (!c) throw new Error("not_configured");
  return c;
}

const realTorqService = {
  insights: (make: string, model: string, year: number | null) =>
    run(async () => {
      const { data, error } = await sb().rpc("mod_insights", { p_make: make, p_model: model, p_year: year });
      if (error) throw error;
      return data as unknown as Insights;
    }),
  ask: (messages: ChatTurn[], car: TorqCar | null) =>
    run(async () => {
      const { data, error, response } = await sb().functions.invoke<TorqReply>("torq-chat", {
        method: "POST",
        body: { messages, car },
      });
      if (error) {
        // the function answers 503 until the AI key is configured, 429-style P0001 when rate limited
        if (response?.status === 503) throw new Error("not_configured");
        if (response?.status === 429) throw { status: 429 };
        throw error;
      }
      return data!;
    }),
};

export type TorqServiceApi = typeof realTorqService;
export const torqService: TorqServiceApi = config.demoMode ? demoTorqService : realTorqService;
