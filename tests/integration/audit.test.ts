import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./db";

/**
 * Phase 6 schema audit: reads the system catalog after all migrations and fails on risky patterns, so a
 * future migration can't quietly open something up. Allow-lists are explicit and reviewed.
 */
let db: PGlite;
beforeAll(async () => {
  db = await freshDb();
});
afterAll(async () => {
  await db.close();
});
const rows = async <T>(sql: string) => (await db.query<T>(sql)).rows;

describe("schema audit", () => {
  it("every SECURITY DEFINER function pins its search_path", async () => {
    const bad = await rows<{ fn: string }>(`
      select n.nspname || '.' || p.proname as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where p.prosecdef and n.nspname in ('public', 'app_private')
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
    expect(bad).toEqual([]);
  });

  it("anonymous visitors can execute only the reviewed public functions", async () => {
    const fns = await rows<{ fn: string }>(`
      select distinct p.proname as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
        and p.prokind = 'f'
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      order by 1`);
    // Read-only, public-safe answers, or helpers with no data access. Anything new must be reviewed here.
    expect(fns.map((f) => f.fn)).toEqual([
      // D-58: badge ids from public activity counts only
      "achievements",
      // D-64: a car's Build Record behind the same revocable link as service_history (no VIN, costs or owner)
      "build_record",
      // D-64: "does this VIN match?" for that link: match / no match only, 10 an hour per link
      "check_record_vin",
      // D-63: public builds of a club's members (an invite-only club's only for its members)
      "club_builds",
      // D-64: a shop's one-time link to confirm a job (the job only, never the owner, VIN or costs; works once)
      "confirm_by_link",
      "confirm_link_view",
      "delta_in_base_unit",
      "discover_builds",
      "discover_routes",
      // D-60: other dates of a public event series
      "event_series_dates",
      "is_blocked_with",
      "is_plus_member",
      "is_reserved_username",
      "lookup_stock_specs",
      "mod_insights",
      // D-60: counts of parts on public builds of the same car
      "owner_fitment",
      "paddock_feed",
      "public_build_specs",
      "public_build_status",
      // D-61: averages and written reviews of a public route
      "route_review_summary",
      "route_reviews",
      "search_doc",
      // D-61: a car's work history behind a revocable 64-hex-character link (no VIN, costs or owner)
      "service_history",
      "share_build_link",
      "subscription_entitled",
      "upcoming_events",
      "valid_spec_deltas",
    ]);
  });

  it("trigger functions aren't executable by anyone, and new functions start private", async () => {
    const triggers = await rows<{ fn: string }>(`
      select p.proname as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
        and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`);
    expect(triggers).toEqual([]);
    await db.exec("create function public._audit_probe() returns int language sql as 'select 1'");
    const probe = await rows<{ anon: boolean }>(
      "select has_function_privilege('anon', 'public._audit_probe()', 'execute') as anon",
    );
    await db.exec("drop function public._audit_probe()");
    expect(probe).toEqual([{ anon: false }]);
  });

  it("service-role-only functions are not callable by app users", async () => {
    const leaked = await rows<{ fn: string }>(`
      select p.proname as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('apply_subscription_event', 'apply_moderation', 'claim_pending_pushes', 'drop_push_token',
                          'enforce_rate_limit', 'enforce_rate_limit_for', 'select_build_of_the_week',
                          'queue_subscription_notifications', 'user_has_plus', 'notification_enabled',
                          'purge_expired_data', 'queue_event_reminders', 'route_monthly_count',
                          'apply_route_visibility')
        and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))`);
    expect(leaked).toEqual([]);
  });

  it("anonymous visitors can read only the public_* views and write nothing", async () => {
    const readable = await rows<{ rel: string }>(`
      select c.relname as rel from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
        and has_table_privilege('anon', c.oid, 'select') order by 1`);
    expect(readable.every((r) => r.rel.startsWith("public_"))).toBe(true);
    const writable = await rows<{ rel: string }>(`
      select c.relname as rel from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'app_private') and c.relkind = 'r'
        and (has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update')
             or has_table_privilege('anon', c.oid, 'delete'))`);
    expect(writable).toEqual([]);
  });

  it("retention purge removes only expired rows", async () => {
    await db.exec(`
      insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000f6');
      insert into public.notifications (recipient_id, category, entity_type, entity_id, title, body, created_at) values
        ('00000000-0000-4000-8000-0000000000f6', 'new_follower', 'user', 'x_old', 't', 'b', now() - interval '200 days'),
        ('00000000-0000-4000-8000-0000000000f6', 'new_follower', 'user', 'x_new', 't', 'b', now() - interval '10 days');`);
    const r = await db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      return (await tx.query("select * from public.purge_expired_data()")).rows;
    });
    expect(r).toEqual([{ notifications: 1, regions: 0 }]);
    expect(await rows("select entity_id from public.notifications where entity_id like 'x_%'")).toEqual([
      { entity_id: "x_new" },
    ]);
  });

  it("every public_* view is a security barrier", async () => {
    const views = await rows<{ rel: string; opts: string[] | null }>(`
      select c.relname as rel, c.reloptions as opts from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v' and c.relname like 'public\\_%'`);
    expect(views.length).toBeGreaterThan(5);
    for (const v of views) expect(v.opts ?? [], v.rel).toContain("security_barrier=true");
  });

  it("app users can't touch the private schema at all", async () => {
    const usage = await rows<{ anon: boolean; auth: boolean }>(`
      select has_schema_privilege('anon', 'app_private', 'usage') as anon,
             has_schema_privilege('authenticated', 'app_private', 'usage') as auth`);
    expect(usage).toEqual([{ anon: false, auth: false }]);
  });

  it("server-only columns have no client write grant", async () => {
    const cols = await rows<{ col: string }>(`
      select table_name || '.' || column_name as col from information_schema.column_privileges
      where grantee in ('authenticated', 'anon') and privilege_type in ('INSERT', 'UPDATE')
        and (table_name, column_name) in (
          ('users','reputation'), ('users','business_badge'), ('users','hidden_at'), ('users','deleted_at'),
          ('vehicles','hidden_at'), ('vehicles','hero_path'), ('vehicles','owner_id'), ('vehicles','deleted_at'),
          ('builds','featured'), ('builds','owner_id'), ('mods','hidden_at'), ('mods','owner_id'),
          ('wishlist_items','is_affiliate'), ('notifications','title'), ('notifications','recipient_id'),
          ('reports','status'), ('mod_photos','storage_path'))`);
    expect(cols).toEqual([]);
  });
});
