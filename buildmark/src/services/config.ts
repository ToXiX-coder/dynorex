import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { Platform } from "react-native";

/** PUBLIC configuration only: everything here ships in the app bundle. */
const appEnv = (Constants.expoConfig?.extra?.appEnv as string | undefined) ?? "development";

export const config = {
  appEnv,
  /** Sample data, no sign-in, no network. Refused in production builds (app.config.ts). */
  demoMode: process.env.EXPO_PUBLIC_DEMO_MODE === "true" && appEnv !== "production",
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || null,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || null,
  /** Where shared links point, e.g. https://buildmark.app. Falls back to the current site on web. */
  siteUrl: process.env.EXPO_PUBLIC_SITE_URL || null,
};

/** A link someone else can open: the buyer's record (/r/…) or the shop's confirmation page (/c/…). */
export function publicLink(path: `/${string}`): string {
  if (config.siteUrl) return `${config.siteUrl.replace(/\/$/, "")}${path}`;
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const base = (globalThis as { __BM_BASE?: string }).__BM_BASE;
    return base ? `${base}#${path}` : `${window.location.origin}${path}`;
  }
  return Linking.createURL(path);
}
