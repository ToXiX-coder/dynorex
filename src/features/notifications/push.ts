import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";

/**
 * Push registration. Nothing is asked until the person turns push on in Settings. The Expo push token
 * is stored on the server in a table clients can't read, and locally only so it can be removed again
 * on sign-out. It is never logged or sent to analytics.
 */
export type PushState =
  | "unsupported" // web
  | "notConfigured" // no backend or no EAS project ID in this build
  | "undetermined"
  | "denied"
  | "granted";

const TOKEN_KEY = "dynorex.pushToken";

export async function pushState(): Promise<PushState> {
  if (Platform.OS === "web") return "unsupported";
  if (!getSupabase() || !config.easProjectId) return "notConfigured";
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return "granted";
    return p.canAskAgain ? "undetermined" : "denied";
  } catch {
    return "notConfigured";
  }
}

export type EnableResult = { ok: true } | { ok: false; reason: "denied" | "notConfigured" | "failed" };

/** Asks the OS, gets a token and registers it. Resolves ok only after the server stored it. */
export async function enablePush(): Promise<EnableResult> {
  const state = await pushState();
  if (state === "unsupported" || state === "notConfigured") return { ok: false, reason: "notConfigured" };
  try {
    if (Platform.OS === "android") {
      // the channel must exist before a token is requested (Android 13+ shows the prompt then)
      await Notifications.setNotificationChannelAsync("default", {
        name: "Dynorex",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const perm = state === "granted" ? { granted: true } : await Notifications.requestPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: "denied" };
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: config.easProjectId! });
    const { error } = await getSupabase()!.rpc("register_push_token", {
      p_token: token,
      p_platform: Platform.OS === "ios" ? "ios" : "android",
    });
    if (error) return { ok: false, reason: "failed" };
    await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => {});
    return { ok: true };
  } catch {
    // Expo Go on Android has no remote push; development builds do
    return { ok: false, reason: "failed" };
  }
}

/** Stops pushes to this device for this account. Safe to call when nothing is registered. */
export async function disablePush(): Promise<boolean> {
  const token = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
  if (!token) return true;
  const sb = getSupabase();
  const { error } = sb ? await sb.rpc("unregister_push_token", { p_token: token }) : { error: null };
  if (error) return false;
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
  return true;
}

export async function hasLocalPushToken(): Promise<boolean> {
  return Boolean(await AsyncStorage.getItem(TOKEN_KEY).catch(() => null));
}
