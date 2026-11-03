// RevenueCat helpers (Deno). RevenueCat validates App Store / Google Play receipts; Dynorex stores the
// result in public.subscriptions through apply_subscription_event() (service role only).
// NOT YET RUN: needs Deno, Supabase, RevenueCat and store accounts (docs/subscriptions.md).
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const ENTITLEMENT = "plus";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Store product ids -> ours. Play ids may carry a base plan ("dynorex_plus_monthly:monthly"). */
export function normaliseProduct(id: unknown): "dynorex_plus_monthly" | "dynorex_plus_annual" | null {
  const base = String(id ?? "").split(":")[0];
  return base === "dynorex_plus_monthly" || base === "dynorex_plus_annual" ? base : null;
}
export function normalisePlatform(store: unknown): "app_store" | "play_store" | null {
  return store === "APP_STORE" ? "app_store" : store === "PLAY_STORE" ? "play_store" : null;
}
/** Only real Dynorex account ids (anonymous RevenueCat ids are ignored). */
export const isAccountId = (s: unknown): s is string => typeof s === "string" && UUID.test(s);
const iso = (ms: unknown) => (typeof ms === "number" && ms > 0 ? new Date(ms).toISOString() : null);
export { iso };

type Status = "active" | "cancelled" | "grace" | "billing_retry" | "expired" | "refunded";

/** Reads the subscriber's current state from RevenueCat's REST API and records it (restore, transfer). */
export async function syncFromRevenueCat(admin: SupabaseClient, userId: string): Promise<string> {
  const key = Deno.env.get("REVENUECAT_SECRET_KEY");
  if (!key) throw new Error("revenuecat_not_configured");
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`revenuecat_${res.status}`);
  const body = (await res.json()) as {
    subscriber?: {
      entitlements?: Record<string, { product_identifier?: string }>;
      subscriptions?: Record<
        string,
        {
          store?: string;
          expires_date?: string | null;
          purchase_date?: string | null;
          original_purchase_date?: string | null;
          unsubscribe_detected_at?: string | null;
          billing_issues_detected_at?: string | null;
          grace_period_expires_date?: string | null;
          refunded_at?: string | null;
        }
      >;
    };
  };
  const productId = body.subscriber?.entitlements?.[ENTITLEMENT]?.product_identifier;
  const sub = productId ? body.subscriber?.subscriptions?.[productId] : undefined;
  const product = normaliseProduct(productId);
  const platform = normalisePlatform(sub?.store);
  if (!sub || !product || !platform) return "nothing_to_restore";

  const now = Date.now();
  const expires = sub.expires_date ? Date.parse(sub.expires_date) : 0;
  const grace = sub.grace_period_expires_date ? Date.parse(sub.grace_period_expires_date) : 0;
  const status: Status = sub.refunded_at
    ? "refunded"
    : expires > now
      ? sub.unsubscribe_detected_at
        ? "cancelled"
        : "active"
      : sub.billing_issues_detected_at && grace > now
        ? "grace"
        : sub.billing_issues_detected_at
          ? "billing_retry"
          : "expired";

  const { data, error } = await admin.rpc("apply_subscription_event", {
    p_provider: "sync",
    p_event_id: `sync:${userId}:${now}`,
    p_user: userId,
    p_type: "SYNC",
    p_platform: platform,
    p_product: product,
    // RevenueCat's REST view has no original transaction id; this key is stable for one store subscription
    p_original_tx: `rc:${platform}:${product}:${sub.original_purchase_date ?? "unknown"}`,
    p_event_at: new Date(now).toISOString(),
    p_period_start: sub.purchase_date ?? null,
    p_expires_at: sub.expires_date ?? null,
    p_grace_until: sub.grace_period_expires_date ?? null,
    p_sync_status: status,
  });
  if (error) throw error;
  return String(data);
}
