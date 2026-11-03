// POST /functions/v1/subscription-sync
// Called by the app after a purchase or "Restore purchases". The caller's identity comes from their JWT;
// their current store state is read server-side from RevenueCat (never from the app) and recorded.
// 10 per hour per person. Returns only the caller's own status.
// NOT YET RUN: needs Deno, Supabase and a RevenueCat project.
import { adminClient, errorResponse, HttpError, userClient } from "../_shared/auth.ts";
import { syncFromRevenueCat } from "../_shared/revenuecat.ts";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") throw new HttpError(405, "Something broke on our end");
    const user = userClient(req);
    const { data: who, error } = await user.auth.getUser();
    if (error || !who.user) throw new HttpError(401, "You've been logged out");
    const admin = adminClient();

    const { error: rl } = await admin.rpc("enforce_rate_limit_for", {
      p_user: who.user.id,
      p_action: "subscription_sync",
      p_max: 10,
      p_window_seconds: 3600,
    });
    if (rl) throw new HttpError(429, "You're moving fast. Wait a minute and try again.", 3600);

    const result = await syncFromRevenueCat(admin, who.user.id);
    const { data: status } = await user.rpc("my_subscription");
    return new Response(JSON.stringify({ result, subscription: (status ?? [])[0] ?? null }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
});
