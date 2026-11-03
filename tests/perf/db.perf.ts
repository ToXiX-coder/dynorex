import fs from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "../integration/db";

/**
 * Server-side latency of the app's busiest queries at a representative volume (spec 15.2).
 * Runs the real migrations on PGlite (single-threaded Postgres in WASM, so this is a conservative proxy:
 * hosted Postgres is faster). Measures database time only, as the signed-in user under RLS.
 * Results are written to docs/perf/db-latency.json.
 */
const VOLUME = {
  users: 3000,
  publicBuilds: 3000,
  privateVehicles: 1000,
  modsPerBuild: 10,
  buildFollows: 15000,
  follows: 10000,
  // Phase 7 (Line, Paddock)
  publicRoutes: 2000,
  routeRatings: 6000,
  upcomingEvents: 1500,
  rsvps: 10000,
  clubs: 300,
  clubMembers: 6000,
  posts: 20000,
  comments: 40000,
  likes: 60000,
};
const RUNS = 30;
let db: PGlite;
let viewer = "";
let ownVehicle = "";
let somePublicVehicle = "";

beforeAll(async () => {
  db = await freshDb();
  // bulk load as the database owner with triggers off (rate limits / notifications aren't under test here)
  await db.exec(`
    set session_replication_role = replica;
    insert into auth.users (id, email, email_confirmed_at)
      select gen_random_uuid(), 'u' || g || '@example.test', now() from generate_series(1, ${VOLUME.users}) g;
    insert into public.users (id, username, build_goal)
      select id, 'user_' || row_number() over (order by id),
             (array['daily_driver','track_build','show_car','off_road','jdm_build','restomod','stance_build'])[1 + (random()*6)::int]::public.build_goal
      from auth.users;
    with u as (select id, row_number() over (order by id) n from public.users)
    insert into public.vehicles (owner_id, year, make, model, baseline_hp, baseline_weight_lb, visibility, created_at)
      select u.id, 1980 + (g % 45),
             (array['Subaru','Mazda','Nissan','Ford','Honda','Toyota','BMW','Chevrolet'])[1 + g % 8],
             (array['WRX','Miata','Skyline','Mustang','Civic','Supra','M3','Camaro'])[1 + g % 8],
             150 + g % 300, 2400 + g % 1500,
             case when g <= ${VOLUME.publicBuilds} then 'public' else 'private' end::public.visibility,
             now() - (g % 365) * interval '1 day'
      from generate_series(1, ${VOLUME.publicBuilds + VOLUME.privateVehicles}) g
      join u on u.n = 1 + (g % ${VOLUME.users});
    insert into public.builds (owner_id, vehicle_id, title, visibility)
      select owner_id, id, make || ' ' || model || ' build', visibility from public.vehicles;
    insert into public.mods (owner_id, vehicle_id, name, category, brand, part_number, status, cost_minor, currency, spec_deltas, created_at)
      select v.owner_id, v.id,
             (array['Cold air intake','Coilovers','Cat-back exhaust','Turbo kit','Big brake kit','Wheels','Seats','Tune'])[1 + g % 8],
             (array['engine','suspension','exhaust','engine','safety','wheels','interior','electronics'])[1 + g % 8]::public.mod_category,
             'Brand' || (g % 40), 'PN-' || g,
             (array['planned','in_progress','complete'])[1 + g % 3]::public.mod_status, 10000 + g, 'USD',
             '{"schema_version":1,"hp":{"delta":5,"unit":"hp"}}', now() - (g % 200) * interval '1 day'
      from public.vehicles v cross join generate_series(1, ${VOLUME.modsPerBuild}) g;
    insert into public.build_follows (user_id, build_id, created_at)
      select distinct on (u.id, b.id) u.id, b.id, now() - (random() * 30) * interval '1 day'
      from generate_series(1, ${Math.ceil(VOLUME.buildFollows / VOLUME.users)}) g cross join (select id, row_number() over (order by id) n from public.users) u
      join (select id, row_number() over (order by id) n from public.builds where visibility = 'public') b
        on b.n = 1 + ((u.n * 7 + floor(random() * ${VOLUME.publicBuilds})::int) % ${VOLUME.publicBuilds})

      on conflict do nothing;
    insert into public.follows (follower_id, followee_id)
      select a.id, b.id from (select id, row_number() over (order by id) n from public.users) a
      join (select id, row_number() over (order by id) n from public.users) b
        on b.n = 1 + ((a.n * 13 + 1) % ${VOLUME.users}) and a.id <> b.id
      cross join generate_series(1, ${Math.ceil(VOLUME.follows / VOLUME.users)}) g
      on conflict do nothing;
    -- Line: public routes with 60-point tracks, ratings
    with u as (select id, row_number() over (order by id) n from public.users)
    insert into public.routes (owner_id, title, visibility, points, public_points, distance_m, duration_s, started_at, ended_at, created_at)
      select u.id, (array['Canyon run','Coast road','Hill climb','Sunday loop'])[1 + g % 4] || ' ' || g, 'public',
             (select jsonb_agg(jsonb_build_array(34 + g * 0.001 + i * 0.001, -118 - i * 0.0005, 1700000000000 + i * 10000)) from generate_series(0, 59) i),
             (select jsonb_agg(jsonb_build_array(34 + g * 0.001 + i * 0.001, -118 - i * 0.0005)) from generate_series(5, 54) i),
             6600, 590, now() - (g % 90) * interval '1 day', now() - (g % 90) * interval '1 day', now() - (g % 90) * interval '1 day'
      from generate_series(1, ${VOLUME.publicRoutes}) g join u on u.n = 1 + (g % ${VOLUME.users});
    insert into public.route_ratings (route_id, user_id, stars)
      select r.id, u.id, 1 + (u.n + r.n) % 5
      from generate_series(1, ${Math.ceil(VOLUME.routeRatings / VOLUME.publicRoutes)}) g cross join (select id, row_number() over (order by id) n from public.routes) r
      join (select id, row_number() over (order by id) n from public.users) u
        on u.n = 1 + ((r.n * 17 + g) % ${VOLUME.users})

      on conflict do nothing;
    -- Paddock: upcoming events, RSVPs, clubs, members, posts, comments, likes
    with u as (select id, row_number() over (order by id) n from public.users)
    insert into public.events (organizer_id, title, starts_at, ends_at, location_text, capacity)
      select u.id, 'Cars and coffee ' || g, now() + (g % 60) * interval '1 day', now() + (g % 60) * interval '1 day' + interval '3 hours',
             'Sample lot ' || g, case when g % 3 = 0 then null else 50 end
      from generate_series(1, ${VOLUME.upcomingEvents}) g join u on u.n = 1 + (g * 3 % ${VOLUME.users});
    insert into public.event_rsvps (event_id, user_id, status)
      select e.id, u.id, (array['going','interested'])[1 + (u.n % 2)]::public.rsvp_status
      from generate_series(1, ${Math.ceil(VOLUME.rsvps / VOLUME.upcomingEvents)}) g cross join (select id, row_number() over (order by id) n from public.events) e
      join (select id, row_number() over (order by id) n from public.users) u
        on u.n = 1 + ((e.n * 11 + g * 101) % ${VOLUME.users})

      on conflict do nothing;
    with u as (select id, row_number() over (order by id) n from public.users)
    insert into public.clubs (owner_id, name)
      select u.id, 'Club number ' || g from generate_series(1, ${VOLUME.clubs}) g join u on u.n = g * 7 % ${VOLUME.users} + 1;
    insert into public.club_members (club_id, user_id, role)
      select owner_id, id, 'owner' from (select id as owner_id, owner_id as id from public.clubs) c;
    insert into public.club_members (club_id, user_id)
      select c.id, u.id
      from generate_series(1, ${Math.ceil(VOLUME.clubMembers / VOLUME.clubs)}) g cross join (select id, row_number() over (order by id) n from public.clubs) c
      join (select id, row_number() over (order by id) n from public.users) u
        on u.n = 1 + ((c.n * 31 + g * 97) % ${VOLUME.users})

      on conflict do nothing;
    insert into public.posts (author_id, club_id, body, created_at)
      select u.id, case when g % 3 = 0 then c.id end, 'Post number ' || g, now() - (g % 2000) * interval '1 hour'
      from generate_series(1, ${VOLUME.posts}) g
      join (select id, row_number() over (order by id) n from public.users) u on u.n = 1 + (g % ${VOLUME.users})
      join (select id, row_number() over (order by id) n from public.clubs) c on c.n = 1 + (g % ${VOLUME.clubs});
    insert into public.comments (post_id, author_id, body)
      select p.id, u.id, 'Nice ' || g
      from generate_series(1, ${Math.ceil(VOLUME.comments / VOLUME.posts)}) g cross join (select id, row_number() over (order by id) n from public.posts) p
      join (select id, row_number() over (order by id) n from public.users) u on u.n = 1 + ((p.n + g * 13) % ${VOLUME.users})
;
    insert into public.post_likes (post_id, user_id)
      select p.id, u.id
      from generate_series(1, ${Math.ceil(VOLUME.likes / VOLUME.posts)}) g cross join (select id, row_number() over (order by id) n from public.posts) p
      join (select id, row_number() over (order by id) n from public.users) u on u.n = 1 + ((p.n * 7 + g * 29) % ${VOLUME.users})

      on conflict do nothing;
    set session_replication_role = origin;
    analyze;
  `);
  viewer = (
    await db.query<{ id: string }>(
      "select user_id as id from public.build_follows group by 1 order by count(*) desc limit 1",
    )
  ).rows[0]!.id;
  await db.query("update auth.users set email_confirmed_at = now() where id = $1", [viewer]);
  ownVehicle =
    (await db.query<{ id: string }>("select id from public.vehicles where owner_id = $1 limit 1", [viewer])).rows[0]
      ?.id ?? "";
  somePublicVehicle = (
    await db.query<{ id: string }>("select vehicle_id as id from public.builds where visibility = 'public' limit 1")
  ).rows[0]!.id;
});
afterAll(async () => {
  await db.close();
});

const results: Record<string, { p50: number; p95: number; max: number }> = {};
async function measure(label: string, sql: string, params: () => unknown[]) {
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    await db.query("delete from app_private.rate_events"); // the rate limiter isn't what we're timing
    const t0 = performance.now();
    await as(db, viewer, (tx) => tx.query(sql, params()));
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const pick = (q: number) => Math.round(times[Math.min(times.length - 1, Math.floor(q * times.length))]! * 10) / 10;
  results[label] = { p50: pick(0.5), p95: pick(0.95), max: pick(1) };
  return results[label]!;
}

describe(`database latency at ${VOLUME.publicBuilds + VOLUME.privateVehicles} vehicles / ${(VOLUME.publicBuilds + VOLUME.privateVehicles) * VOLUME.modsPerBuild} mods`, () => {
  const cases: [string, string, () => unknown[]][] = [
    [
      "garage list (own vehicles, page 1)",
      "select id, year, make, model from public.vehicles where owner_id = auth.uid() and deleted_at is null order by created_at desc limit 20",
      () => [],
    ],
    [
      "vehicle timeline (page 1)",
      "select * from public.mods where vehicle_id = $1 and deleted_at is null order by created_at desc limit 20",
      () => [ownVehicle],
    ],
    ["spec estimate", "select * from public.vehicle_spec_estimate($1)", () => [ownVehicle]],
    ["cost summary", "select * from public.vehicle_cost_summary($1)", () => [ownVehicle]],
    ["public build page", "select * from public.public_builds where vehicle_id = $1", () => [somePublicVehicle]],
    ["public build specs", "select * from public.public_build_specs($1)", () => [somePublicVehicle]],
    ["discover trending", "select * from public.discover_builds('trending', 0)", () => []],
    ["discover new", "select * from public.discover_builds('new', 0)", () => []],
    ["home feed", "select * from public.home_feed(0)", () => []],
    ["search", "select * from public.search_public('subaru wrx')", () => []],
    ["discover routes (top)", "select * from public.discover_routes('top', 0)", () => []],
    ["discover routes (new)", "select * from public.discover_routes('new', 0)", () => []],
    ["upcoming events", "select * from public.upcoming_events(0)", () => []],
    ["paddock feed (following)", "select * from public.paddock_feed('following', 0)", () => []],
    ["paddock feed (everyone)", "select * from public.paddock_feed('all', 0)", () => []],
    ["clubs list", "select * from public.public_clubs order by members_count desc, club_id limit 20", () => []],
    [
      "post comments",
      "select * from public.public_comments where post_id = (select id from public.posts order by created_at desc limit 1) order by created_at limit 200",
      () => [],
    ],
    ["search (routes, events, clubs)", "select * from public.search_public('canyon club')", () => []],
    [
      "notifications inbox",
      "select * from public.notifications where recipient_id = auth.uid() order by created_at desc limit 20",
      () => [],
    ],
  ];
  it.each(cases)("%s", async (label, sql, params) => {
    const r = await measure(label, sql, params);
    // spec 15.1: API p95 under 500 ms (database share must be well inside it)
    expect(r.p95, `${label} p95 ${r.p95} ms`).toBeLessThan(500);
  });

  it("writes the report", () => {
    const out = path.resolve(import.meta.dirname, "../../docs/perf/db-latency.json");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(
      out,
      JSON.stringify(
        {
          measured_at: new Date().toISOString(),
          engine: "PGlite (Postgres 17 in WASM, single thread)",
          volume: VOLUME,
          runs_per_query: RUNS,
          unit: "ms",
          results,
        },
        null,
        2,
      ) + "\n",
    );
  });
});
