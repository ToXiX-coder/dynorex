// POST /functions/v1/push-dispatch   (scheduler only; never called by the app)
// Header: x-dispatch-secret: <PUSH_DISPATCH_SECRET>
//
// Sends pending in-app notifications as Expo push messages. Run it every minute from a scheduler
// (Supabase Cron + pg_net, see docs/notifications.md). Each notification is claimed once by
// claim_pending_pushes(), so overlapping runs never double-send. Notifications are only created when
// the recipient's category switch is on, so a disabled category never reaches this function.
//
// Payload rules: title and body are exactly the stored notification text (public username / public
// build title only); data carries entity_type, entity_id and category for deep linking, nothing else.
// Tokens Expo reports as DeviceNotRegistered are deleted.
// NOT YET RUN: needs Deno, Supabase and real devices.
import { adminClient, errorResponse, HttpError } from "../_shared/auth.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH = 100; // Expo accepts up to 100 messages per request

type Claimed = {
  notification_id: string;
  token: string;
  title: string;
  body: string;
  category: string;
  entity_type: string;
  entity_id: string;
};

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") throw new HttpError(405, "Something broke on our end");
    const secret = Deno.env.get("PUSH_DISPATCH_SECRET") ?? "";
    if (!sameSecret(req.headers.get("x-dispatch-secret") ?? "", secret)) throw new HttpError(401, "Not allowed");

    const admin = adminClient();
    const { data, error } = await admin.rpc("claim_pending_pushes", { p_limit: 500 });
    if (error) throw error;
    const rows = (data ?? []) as Claimed[];

    let sent = 0;
    let dropped = 0;
    const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN"); // optional "enhanced push security" token
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const messages = chunk.map((r) => ({
        to: r.token,
        title: r.title,
        body: r.body,
        sound: "default",
        channelId: "default",
        data: { entity_type: r.entity_type, entity_id: r.entity_id, category: r.category },
      }));
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        console.error("expo_push_http", res.status); // no payloads in logs
        continue; // claimed rows stay claimed: a missed push is better than a duplicate
      }
      const tickets = ((await res.json()) as { data?: { status: string; details?: { error?: string } }[] }).data ?? [];
      for (const [j, t] of tickets.entries()) {
        if (t.status === "ok") sent++;
        else if (t.details?.error === "DeviceNotRegistered") {
          await admin.rpc("drop_push_token", { p_token: chunk[j]!.token });
          dropped++;
        }
      }
    }
    return new Response(JSON.stringify({ claimed: rows.length, sent, dropped }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
});
