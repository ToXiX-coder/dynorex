// POST /functions/v1/export-data
// Returns everything stored about the caller as JSON. Runs AS the caller (anon key + their JWT), so
// row-level security decides what is included: only their own rows. No service role is used.
// The table list lives in _shared/exportTables.ts; tests/integration/export.test.ts checks it covers every
// table that references a user and that each query is allowed for a signed-in user.
// NOT YET RUN: needs Deno + Supabase (see docs/phase-2-report.md).
import { errorResponse, HttpError, userClient } from "../_shared/auth.ts";
import { EXPORT_TABLES } from "../_shared/exportTables.ts";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") throw new HttpError(405, "Something broke on our end");
    const sb = userClient(req);
    const { data: who, error } = await sb.auth.getUser();
    if (error || !who.user) throw new HttpError(401, "You've been logged out");
    const id = who.user.id;

    const tables: Record<string, unknown> = {};
    for (const [key, table, column, columns] of EXPORT_TABLES) {
      let query = sb.from(table).select(columns ?? "*");
      if (column) query = query.eq(column, id);
      const { data, error } = await query;
      if (error) throw error;
      tables[key] = key === "profile" ? (data?.[0] ?? null) : data;
    }

    const body = {
      exported_at: new Date().toISOString(),
      format_version: 2,
      account: { id, email: who.user.email, created_at: who.user.created_at },
      ...tables,
      // Nearby opt-in status (the coarse grid cell itself is not readable by clients) and device count
      nearby: (await sb.rpc("my_region")).data ?? [],
      push_devices: (await sb.rpc("my_push_status")).data ?? [],
      // Dynorex+ plan as the app sees it (store receipts and webhook payloads stay server-side)
      subscription: (await sb.rpc("my_subscription")).data ?? [],
    };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
});
