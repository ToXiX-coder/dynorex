import { demoApi } from "@/demo/demoApi";
import type { Api } from "./api";
import { config } from "./config";
import { getSupabase } from "./supabase";
import { supabaseApi } from "./supabaseApi";

let api: Api | null | undefined;

/** The backend the screens talk to, or null when none is configured (the app then says so). */
export function getApi(): Api | null {
  if (api !== undefined) return api;
  if (config.demoMode) return (api = demoApi());
  const sb = getSupabase();
  return (api = sb ? supabaseApi(sb) : null);
}
