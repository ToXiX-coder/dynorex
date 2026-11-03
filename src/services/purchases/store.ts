import { Linking } from "react-native";
import { MANAGE_URLS } from "@/domain/plus";
import { config } from "@/services/config";
import { demoStore } from "./demoStore";
import type { StoreApi } from "./types";

/**
 * Web (and any platform without the native SDK): subscriptions are bought in the iOS / Android app,
 * as Apple and Google require for in-app digital subscriptions. The native version is store.native.ts.
 */
const webStore: StoreApi = {
  availability: "unavailable",
  platform: null,
  start: async () => {},
  stop: async () => {},
  plans: async () => null,
  purchase: async () => ({ ok: false, cancelled: false }),
  restore: async () => false,
  manage: async () => {
    await Linking.openURL(MANAGE_URLS.app_store).catch(() => {});
  },
};

export const store: StoreApi = config.demoMode ? demoStore : webStore;
