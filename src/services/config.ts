import Constants from "expo-constants";
import { resolveFlags, type Flags } from "@/domain/flags";
import { publicMapboxToken } from "@/domain/maps";

/**
 * PUBLIC configuration only. Everything here ships inside the app bundle and must be safe to read.
 * Server-only secrets (service role key, Stripe secret, webhook secrets) live in Supabase Edge
 * Function secrets and GitHub Actions secrets, never here. See docs/setup.md.
 */
export interface PublicConfig {
  appEnv: "development" | "staging" | "production";
  supabaseUrl: string | null;
  /** The Supabase anon/publishable key. Public by design; RLS protects data. */
  supabaseAnonKey: string | null;
  sentryDsn: string | null;
  /** Public Mapbox token (pk.*) for Line. Null when unset or not a public token. */
  mapboxToken: string | null;
  release: string;
  flags: Flags;
  /** Store pages for the web "Get the app" banner. Null until the listings exist. */
  appStoreUrl: string | null;
  playStoreUrl: string | null;
  /** EAS project ID, needed to get an Expo push token. Null until `eas init`. */
  easProjectId: string | null;
  /**
   * Pitch mode: no sign-in, an in-memory sample-data backend, a permanent "PITCH MODE" banner, and no
   * network calls to Supabase. For demos only; production builds can't turn it on.
   */
  demoMode: boolean;
  /** RevenueCat PUBLIC SDK keys (safe in the app). Null until the store setup exists. */
  revenueCatIosKey: string | null;
  revenueCatAndroidKey: string | null;
  /** Published legal pages and support contact. Null until they exist; the app then says so plainly. */
  legal: {
    terms: string | null;
    privacy: string | null;
    guidelines: string | null;
    affiliate: string | null;
    supportEmail: string | null;
  };
}

/** Pitch mode is refused in production builds whatever the environment says. */
export const resolveDemoMode = (raw: string | undefined, appEnv: string) => raw === "true" && appEnv !== "production";

const httpsOnly = (v: string | undefined) => (v && /^https:\/\/[^\s]+$/.test(v) ? v : null);

const appEnv = (Constants.expoConfig?.extra?.appEnv ?? "development") as PublicConfig["appEnv"];

export const config: PublicConfig = {
  appEnv,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || null,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || null,
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN || null,
  mapboxToken: publicMapboxToken(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN),
  release: `dynorex@${Constants.expoConfig?.version ?? "0.0.0"}`,
  // Pitch mode previews switched-off features on sample data (they all work end to end in pitch mode).
  flags: resolveDemoMode(process.env.EXPO_PUBLIC_DEMO_MODE, appEnv)
    ? Object.freeze({
        ...resolveFlags(process.env.EXPO_PUBLIC_FLAG_OVERRIDES, appEnv),
        subscriptions: true,
        discoverNearby: true,
        buildOfTheWeek: true,
        // first slices of Line and Paddock (Phase 7); still off in every real build
        line: true,
        paddock: true,
        // the Paddock Shop (D-56: listings, offers, offer chat; no payments)
        marketplace: true,
        // Torq chat answers from sample builds with a rule-based twin (no AI call in pitch mode)
        torqChat: true,
        // receipt scan returns a labelled sample reading (no AI call in pitch mode)
        receiptScan: true,
      })
    : resolveFlags(process.env.EXPO_PUBLIC_FLAG_OVERRIDES, appEnv),
  appStoreUrl: httpsOnly(process.env.EXPO_PUBLIC_APP_STORE_URL),
  playStoreUrl: httpsOnly(process.env.EXPO_PUBLIC_PLAY_STORE_URL),
  easProjectId:
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
    ((Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ?? null),
  demoMode: resolveDemoMode(process.env.EXPO_PUBLIC_DEMO_MODE, appEnv),
  revenueCatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || null,
  revenueCatAndroidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || null,
  legal: {
    terms: httpsOnly(process.env.EXPO_PUBLIC_TERMS_URL),
    privacy: httpsOnly(process.env.EXPO_PUBLIC_PRIVACY_URL),
    guidelines: httpsOnly(process.env.EXPO_PUBLIC_GUIDELINES_URL),
    affiliate: httpsOnly(process.env.EXPO_PUBLIC_AFFILIATE_URL),
    supportEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? "")
      ? process.env.EXPO_PUBLIC_SUPPORT_EMAIL!
      : null,
  },
};

/** True when there is something to talk to: a Supabase project, or the pitch-mode sample backend. */
export const backendConfigured = () => config.demoMode || Boolean(config.supabaseUrl && config.supabaseAnonKey);
