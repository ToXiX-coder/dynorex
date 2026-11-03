import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import { config } from "./config";

/**
 * The only Supabase client. It uses the public anon key, so every call runs as the signed-in person under
 * row-level security. Null in demo mode or when no project is configured.
 */
let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  if (config.demoMode || !config.supabaseUrl || !config.supabaseAnonKey) {
    client = null;
    return client;
  }
  client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      storage: Platform.OS === "web" ? undefined : AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  if (Platform.OS !== "web") {
    const auth = client.auth;
    AppState.addEventListener("change", (s) => void (s === "active" ? auth.startAutoRefresh() : auth.stopAutoRefresh()));
  }
  return client;
}
