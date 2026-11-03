import { Linking, Platform } from "react-native";
import Purchases, { PACKAGE_TYPE, PURCHASES_ERROR_CODE, type PurchasesPackage } from "react-native-purchases";
import { MANAGE_URLS, type PlanId } from "@/domain/plus";
import { config } from "@/services/config";
import { demoStore } from "./demoStore";
import type { StoreApi, StorePlan } from "./types";

/**
 * iOS / Android in-app purchases through RevenueCat (it validates receipts with Apple and Google).
 * The app user id is the Dynorex account id, so the server can match verified events to the account.
 * Needs a development or store build; the paywall explains when purchases aren't available.
 */
const apiKey = Platform.OS === "ios" ? config.revenueCatIosKey : config.revenueCatAndroidKey;
let configured = false;
const packages = new Map<PlanId, PurchasesPackage>();

async function loadPackages() {
  const offerings = await Purchases.getOfferings();
  packages.clear();
  for (const p of offerings.current?.availablePackages ?? []) {
    if (p.packageType === PACKAGE_TYPE.MONTHLY) packages.set("monthly", p);
    if (p.packageType === PACKAGE_TYPE.ANNUAL) packages.set("annual", p);
  }
}

const nativeStore: StoreApi = {
  availability: apiKey ? "ready" : "unavailable",
  platform: Platform.OS === "ios" ? "app_store" : "play_store",

  start: async (userId) => {
    if (!apiKey) return;
    if (!configured) {
      Purchases.configure({ apiKey, appUserID: userId });
      configured = true;
    } else {
      await Purchases.logIn(userId);
    }
  },
  stop: async () => {
    if (configured) await Purchases.logOut().catch(() => {});
  },
  plans: async () => {
    if (!configured) return null;
    try {
      await loadPackages();
      const out: StorePlan[] = [];
      for (const id of ["monthly", "annual"] as const) {
        const p = packages.get(id);
        if (p) out.push({ id, priceString: p.product.priceString });
      }
      return out.length ? out : null;
    } catch {
      return null;
    }
  },
  purchase: async (plan) => {
    const p = packages.get(plan);
    if (!configured || !p) return { ok: false, cancelled: false };
    try {
      await Purchases.purchasePackage(p);
      return { ok: true };
    } catch (e) {
      const code = (e as { code?: string }).code;
      return { ok: false, cancelled: code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR };
    }
  },
  restore: async () => {
    if (!configured) return false;
    try {
      await Purchases.restorePurchases();
      return true;
    } catch {
      return false;
    }
  },
  manage: async () => {
    try {
      if (configured) return await Purchases.showManageSubscriptions();
    } catch {
      // fall through to the store's web page
    }
    await Linking.openURL(Platform.OS === "ios" ? MANAGE_URLS.app_store : MANAGE_URLS.play_store).catch(() => {});
  },
};

export const store: StoreApi = config.demoMode ? demoStore : nativeStore;
