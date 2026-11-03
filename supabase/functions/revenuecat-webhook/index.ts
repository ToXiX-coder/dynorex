// POST /functions/v1/revenuecat-webhook   (RevenueCat only; never called by the app)
// Header: Authorization: <REVENUECAT_WEBHOOK_AUTH>  (the value set in the RevenueCat dashboard)
//
// Turns verified store events into subscription state. RevenueCat has already validated the receipt
// with Apple/Google; this function checks the event came from RevenueCat, maps it, and hands it to
// apply_subscription_event(), which is idempotent (duplicate deliveries are no-ops) and ignores
// events older than the newest one applied (out-of-order delivery).
// Sandbox events are ignored unless ALLOW_SANDBOX_PURCHASES=true (staging only).
// Logs never contain payloads, user ids or transaction ids.
// NOT YET RUN: needs Deno, Supabase and a RevenueCat project.
import { adminClient, errorResponse, HttpError } from "../_shared/auth.ts";
import {
  isAccountId,
  iso,
  normalisePlatform,
  normaliseProduct,
  syncFromRevenueCat,
} from "../_shared/revenuecat.ts";

type RcEvent = {
  id?: string;
  type?: string;
  app_user_id?: string;
  product_id?: string;
  store?: string;
  environment?: string;
  original_transaction_id?: string;
  event_timestamp_ms?: number;
  purchased_at_ms?: number;
  expiration_at_ms?: number;
  grace_period_expiration_at_ms?: number;
  cancel_reason?: string;
  transferred_to?: string[];
};

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") throw new HttpError(405, "Something broke on our end");
    const expected = Deno.env.get("REVENUECAT_WEBHOOK_AUTH") ?? "";
    if (!sameSecret(req.headers.get("Authorization") ?? "", expected)) throw new HttpError(401, "Not allowed");

    const e = ((await req.json()) as { event?: RcEvent }).event;
    if (!e?.id || !e.type) throw new HttpError(400, "Bad event");
    if (e.environment === "SANDBOX" && Deno.env.get("ALLOW_SANDBOX_PURCHASES") !== "true") {
      return json({ result: "ignored_sandbox" });
    }
    const admin = adminClient();

    // ownership moved to another account: read the new owner's state from RevenueCat
    if (e.type === "TRANSFER") {
      for (const to of e.transferred_to ?? []) if (isAccountId(to)) await syncFromRevenueCat(admin, to);
      return json({ result: "synced" });
    }

    const product = normaliseProduct(e.product_id);
    const platform = normalisePlatform(e.store);
    if (!isAccountId(e.app_user_id) || !product || !platform || !e.original_transaction_id) {
      return json({ result: "ignored" }); // anonymous ids, other products, other stores, test pings
    }
    // a refund arrives as a cancellation made by store support
    const type = e.type === "CANCELLATION" && e.cancel_reason === "CUSTOMER_SUPPORT" ? "REFUND" : e.type;

    const { data, error } = await admin.rpc("apply_subscription_event", {
      p_provider: "revenuecat",
      p_event_id: e.id,
      p_user: e.app_user_id,
      p_type: type,
      p_platform: platform,
      p_product: product,
      p_original_tx: e.original_transaction_id,
      p_event_at: iso(e.event_timestamp_ms) ?? new Date().toISOString(),
      p_period_start: iso(e.purchased_at_ms),
      p_expires_at: iso(e.expiration_at_ms),
      p_grace_until: iso(e.grace_period_expiration_at_ms),
      p_sync_status: null,
    });
    if (error) throw error; // 500 -> RevenueCat retries; the event id makes the retry safe
    return json({ result: data });
  } catch (err) {
    return errorResponse(err);
  }
});
