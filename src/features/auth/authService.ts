import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { demoAuthService } from "@/demo/services";
import { disablePush } from "@/features/notifications/push";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";
import { mapError, type MappedError } from "./errors";

/**
 * Every auth action the app performs. Each returns a Result and never throws, so screens can show
 * loading / success / error / offline states without try/catch. Nothing here logs credentials or tokens.
 */
export type Result<T = void> = { ok: true; data: T } | { ok: false; error: MappedError };

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = (e: unknown): Result<never> => ({ ok: false, error: mapError(e) });

function client() {
  const sb = getSupabase();
  if (!sb) throw new Error("not_configured");
  return sb;
}

/** dynorex://<path> in builds (exp://… in Expo Go). Must be listed in supabase/config.toml redirects. */
export const redirectUrl = (path: "auth/callback" | "reset-password") => Linking.createURL(path);

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    return fail(e);
  }
}

/** Throw Supabase's returned error object so `run` maps it. */
function check<T extends { error: unknown }>(res: T): T {
  if (res.error) throw res.error;
  return res;
}

const realAuthService = {
  signUpWithEmail: (email: string, password: string) =>
    run(async () => {
      check(
        await client().auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectUrl("auth/callback") },
        }),
      );
    }),

  signInWithEmail: (email: string, password: string) =>
    run(async () => {
      check(await client().auth.signInWithPassword({ email, password }));
    }),

  resendVerification: (email: string) =>
    run(async () => {
      check(
        await client().auth.resend({
          type: "signup",
          email,
          options: { emailRedirectTo: redirectUrl("auth/callback") },
        }),
      );
    }),

  /**
   * Always reports success unless the request itself failed (offline, rate limited), so the answer
   * never reveals whether an account exists for that email.
   */
  requestPasswordReset: (email: string) =>
    run(async () => {
      const { error } = await client().auth.resetPasswordForEmail(email, { redirectTo: redirectUrl("reset-password") });
      if (error) {
        const mapped = mapError(error);
        if (mapped.key === "offline" || mapped.key === "tooManyAttempts" || mapped.key === "rateLimited") throw error;
      }
    }),

  /** For links from email (confirm sign-up, reset password) and OAuth: PKCE code -> session. */
  exchangeCode: (code: string) =>
    run(async () => {
      check(await client().auth.exchangeCodeForSession(code));
    }),

  updatePassword: (password: string) =>
    run(async () => {
      check(await client().auth.updateUser({ password }));
    }),

  /** Re-checks the server, e.g. after the person verified their email in a browser. */
  refresh: () =>
    run(async () => {
      check(await client().auth.refreshSession());
    }),

  /** Revokes this device's refresh token on the server, then clears the keychain copy. */
  signOut: () =>
    run(async () => {
      // stop pushes to this device for this account first (best effort; needs the session)
      await disablePush().catch(() => false);
      check(await client().auth.signOut({ scope: "local" }));
    }),

  appleAvailable: async () =>
    Platform.OS === "ios" ? AppleAuthentication.isAvailableAsync().catch(() => false) : false,

  /** Native Sign in with Apple on iOS (identity token -> Supabase). Android uses the browser flow. */
  signInWithApple: () =>
    run(async () => {
      if (Platform.OS !== "ios") return oauthInBrowser("apple");
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error("cancelled");
      check(await client().auth.signInWithIdToken({ provider: "apple", token: credential.identityToken }));
    }),

  signInWithGoogle: () => run(() => oauthInBrowser("google")),

  /** Edge Function: requires a sign-in within the last 5 minutes, then removes the account. */
  deleteAccount: () =>
    run(async () => {
      check(await client().functions.invoke("delete-account", { method: "POST" }));
    }),

  exportData: () =>
    run(async () => {
      const res = check(await client().functions.invoke<unknown>("export-data", { method: "POST" }));
      return res.data;
    }),
};

export type AuthServiceApi = typeof realAuthService;
export const authService: AuthServiceApi = config.demoMode ? demoAuthService : realAuthService;

/** OAuth through the system browser sheet with PKCE; the code comes back on our redirect URL. */
async function oauthInBrowser(provider: "google" | "apple") {
  const redirectTo = redirectUrl("auth/callback");
  const { data, error } = await client().auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) throw error ?? new Error("oauth_failed");
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") throw new Error("cancelled");
  const code = new URL(result.url).searchParams.get("code");
  if (!code) throw new Error("oauth_failed");
  check(await client().auth.exchangeCodeForSession(code));
}
