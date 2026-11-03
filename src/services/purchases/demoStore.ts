import { Platform } from "react-native";
import { demoActivatePlus } from "@/demo/services";
import { LIST_PRICES } from "@/domain/plus";
import type { StoreApi } from "./types";

/**
 * Pitch mode only: shows the real paywall with the spec's list prices, and "buying" turns Dynorex+ on in
 * the sample data. No store is contacted and no money moves; the paywall says so on screen.
 */
export const demoStore: StoreApi = {
  availability: "demo",
  platform: Platform.OS === "android" ? "play_store" : "app_store",
  start: async () => {},
  stop: async () => {},
  plans: async () => [
    { id: "monthly", priceString: LIST_PRICES.monthly.price },
    { id: "annual", priceString: LIST_PRICES.annual.price },
  ],
  purchase: async (plan) => {
    await new Promise((r) => setTimeout(r, 400));
    demoActivatePlus(plan, Platform.OS === "android" ? "play_store" : "app_store");
    return { ok: true };
  },
  restore: async () => true,
  manage: async () => {},
};
