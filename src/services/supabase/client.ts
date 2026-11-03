import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import { config } from "@/services/config";
import type { Database } from "./database.types";
import { chunkedStorage } from "./secureStorage";

/**
 * The only Supabase client in the app. It uses the public anon key, so every query runs as the
 * signed-in user under row-level security. Privileged work goes through Edge Functions.
 * Returns null when the backend isn't configured, and screens show an honest "not connected" state.
 */
let client: SupabaseClient<Database> | null | undefined;

export function getSupabase(): SupabaseClient<Database> | null {
  if (client !== undefined) return client;
  // pitch mode never talks to a real project, even if one is configured
  if (config.demoMode || !config.supabaseUrl || !config.supabaseAnonKey) {
    client = null;
    return client;
  }
  client = createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      // Web previews have no keychain; they keep the session in memory only.
      storage: Platform.OS === "web" ? undefined : chunkedStorage(SecureStore),
      persistSession: Platform.OS !== "web",
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
  // Refresh tokens only while the app is in the foreground (Supabase's React Native guidance), so a
  // backgrounded app doesn't burn refresh tokens and a resumed app gets a fresh session immediately.
  if (Platform.OS !== "web") {
    const auth = client.auth;
    AppState.addEventListener("change", (state) => {
      if (state === "active") void auth.startAutoRefresh();
      else void auth.stopAutoRefresh();
    });
  }
  return client;
}
