import type { PlanId } from "@/domain/plus";

/**
 * The app's view of the store. A successful purchase here only means the STORE took payment; Dynorex+
 * is on only once the server has recorded the verified purchase (subscription-sync / webhook).
 */
export interface StorePlan {
  id: PlanId;
  /** Localized price from the store, e.g. "$7.99" or "7,99 €". */
  priceString: string;
}
export type StorePurchase = { ok: true } | { ok: false; cancelled: boolean };

export interface StoreApi {
  /** "unavailable" on web, without SDK keys, or before stores are set up. */
  readonly availability: "ready" | "unavailable" | "demo";
  readonly platform: "app_store" | "play_store" | null;
  start(userId: string): Promise<void>;
  stop(): Promise<void>;
  plans(): Promise<StorePlan[] | null>;
  purchase(plan: PlanId): Promise<StorePurchase>;
  restore(): Promise<boolean>;
  manage(): Promise<void>;
}
