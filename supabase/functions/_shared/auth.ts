// Shared Edge Function helpers (Deno). Phase 1 defines the boundary only; the first real
// functions (account deletion/export, uploads, rate-limited writes) arrive in Phases 2-3.
// NOT YET RUN: this machine has no Deno or Supabase CLI. CI type-checks it with `deno check`.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export class HttpError extends Error {
  constructor(public status: number, public publicMessage: string, public retryAfterSeconds?: number) {
    super(publicMessage);
  }
}

/**
 * A client that acts AS the caller (anon key + their JWT), so RLS still applies.
 * Use this for anything the user is allowed to do themselves.
 */
export function userClient(req: Request): SupabaseClient {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) throw new HttpError(401, "You've been logged out");
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
}

/**
 * Service-role client. Bypasses RLS, so call it ONLY after the caller's identity and rights have
 * been checked with userClient(). The key exists only in Edge Function secrets.
 */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

/** Turn any error into a safe JSON response. Never leaks stack traces, SQL or tokens. */
export function errorResponse(e: unknown): Response {
  const err = e instanceof HttpError ? e : new HttpError(500, "Something broke on our end");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (err.retryAfterSeconds) headers["Retry-After"] = String(err.retryAfterSeconds);
  if (!(e instanceof HttpError)) console.error("unhandled", (e as Error)?.name ?? "error"); // no message/body: may contain user data
  return new Response(JSON.stringify({ error: err.publicMessage }), { status: err.status, headers });
}
