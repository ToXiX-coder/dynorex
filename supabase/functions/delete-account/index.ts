// POST /functions/v1/delete-account
// Deletes the caller's account. Requires a sign-in within the last 5 minutes (re-authentication).
// Deleting the auth user cascades to every row the user owns (see migrations); reports they filed
// are kept with reporter_id set to null.
// NOT YET RUN: needs Deno + Supabase (see docs/phase-2-report.md).
import { adminClient, errorResponse, HttpError, userClient } from "../_shared/auth.ts";

const REAUTH_WINDOW_MS = 5 * 60 * 1000;

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") throw new HttpError(405, "Something broke on our end");

    // 1. Who is calling? (validates the JWT with the auth server)
    const { data, error } = await userClient(req).auth.getUser();
    if (error || !data.user) throw new HttpError(401, "You've been logged out");
    const user = data.user;

    // 2. Recent sign-in required, so a stolen or forgotten unlocked phone can't delete the account.
    const last = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : 0;
    if (!last || Date.now() - last > REAUTH_WINDOW_MS) {
      throw new HttpError(403, "Sign in again before deleting your account.");
    }

    // 3. Delete with the service role (only after the checks above). Cascades through the schema.
    const admin = adminClient();

    // 3a. Remove their photos from private storage first (rows cascade, files don't).
    for (;;) {
      const { data: files } = await admin.storage.from("vehicle-media").list(user.id, { limit: 100 });
      if (!files?.length) break;
      await admin.storage.from("vehicle-media").remove(files.map((f) => `${user.id}/${f.name}`));
      if (files.length < 100) break;
    }

    // 3b. Purchase records held by RevenueCat under this account id (Phase 5). This does NOT cancel an
    //     App Store / Google Play subscription; only the person can do that in their store settings,
    //     and the app tells them so before they delete.
    const rcKey = Deno.env.get("REVENUECAT_SECRET_KEY");
    if (rcKey) {
      const rc = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${rcKey}` },
      });
      // 404 = nothing stored there; anything else stops the deletion so it can be retried cleanly
      if (!rc.ok && rc.status !== 404) throw new HttpError(502, "Something broke on our end");
    }

    const { error: delError } = await admin.auth.admin.deleteUser(user.id);
    if (delError) throw delError;

    return new Response(JSON.stringify({ deleted: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return errorResponse(e);
  }
});
