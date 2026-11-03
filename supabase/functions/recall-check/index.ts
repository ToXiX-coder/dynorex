// POST /functions/v1/recall-check   (scheduler only; never called by the app)
// Header: x-dispatch-secret: <PUSH_DISPATCH_SECRET>
//
// Once a day (Supabase Cron + pg_net, like push-dispatch): for each make / model / year that a live car has, ask
// NHTSA's public recall lookup and store what it says. store_recalls() tells owners about campaigns it hasn't
// seen before for that car (once each, respecting their switch); push-dispatch then delivers those alerts.
// Only make, model and year leave Dynorex: never a VIN, an owner or a location. NHTSA covers US-market cars, so
// matches are "may affect": the owner confirms with a dealer using their VIN.
// NOT YET RUN: needs Deno and Supabase.
import { adminClient, errorResponse, HttpError } from "../_shared/auth.ts";
import { recallsUrl, toRecallItems } from "../_shared/recalls.ts";

const MAX_CARS_PER_RUN = 500; // a day's run; the rest wait for tomorrow
const PAUSE_MS = 250; // be gentle with a free public service

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
    const { data, error } = await admin.rpc("recall_targets");
    if (error) throw error;
    const cars = ((data ?? []) as { make: string; model: string; model_year: number }[]).slice(0, MAX_CARS_PER_RUN);

    let checked = 0;
    let alerts = 0;
    let failed = 0;
    for (const car of cars) {
      try {
        const res = await fetch(recallsUrl(car.make, car.model, car.model_year), {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`nhtsa ${res.status}`);
        const items = toRecallItems(await res.json());
        const { data: n, error: e } = await admin.rpc("store_recalls", {
          p_make: car.make,
          p_model: car.model,
          p_year: car.model_year,
          p_items: items,
        });
        if (e) throw e;
        alerts += Number(n ?? 0);
        checked++;
      } catch {
        failed++; // one car failing (bad model name, timeout) never stops the rest
      }
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
    return new Response(JSON.stringify({ checked, failed, alerts }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return errorResponse(e);
  }
});
