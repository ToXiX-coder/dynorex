-- Dynorex D-60: "Prove it" features from the market research (owner, 2026-10-12).
--   1. performance runs: phone-GPS 0-60 / quarter mile / power estimate, per car, optional on the public build
--   2. owner fitment: "N owners of your car run this", aggregated from public builds only
--   3. repeating meets: a weekly / every-2-weeks / monthly series, created in one step
--   4. live group drive: opt-in positions, visible only to that drive's people while it is on
-- Every number from a phone is an estimate. Nothing here is labelled verified, certified or dyno-proven.
-- Functions are private by default (migration 6): every grant below is deliberate.

-- ================================================================ 1. performance runs

create table public.perf_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  ran_at timestamptz not null default now(),
  -- what the phone measured (each optional: a short run may only reach 60)
  zero_sixty_s numeric(5, 2) check (zero_sixty_s between 1.5 and 30),
  quarter_s numeric(5, 2) check (quarter_s between 6 and 40),
  trap_mph numeric(5, 1) check (trap_mph between 20 and 250),
  -- estimated wheel horsepower from speed, weight and drag; null when no weight was known
  est_whp integer check (est_whp between 20 and 3000),
  weight_lb integer check (weight_lb between 1000 and 12000),
  -- how good the GPS was: updates per second and a grade the app works out from it
  sample_hz numeric(4, 1) not null check (sample_hz between 0.2 and 50),
  quality text not null check (quality in ('good', 'fair', 'rough')),
  note text check (char_length(note) <= 200 and note !~ '[\x01-\x1F\x7F]'),
  -- shown on the public build (only if the build itself is public)
  shared boolean not null default false,
  -- the speed trace for the owner's own charts: [[ms, mph], ...]; never public
  samples jsonb not null default '[]'::jsonb check (jsonb_typeof(samples) = 'array' and pg_column_size(samples) <= 200000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (zero_sixty_s is not null or quarter_s is not null),
  check ((quarter_s is null) = (trap_mph is null)),
  check (ran_at <= now() + interval '5 minutes')
);
create index perf_runs_vehicle_idx on public.perf_runs (vehicle_id, ran_at desc) where deleted_at is null;
create trigger perf_runs_rate_limit before insert on public.perf_runs
  for each row execute function public.rate_limit_trigger('perf_run', '60', '3600');

revoke all on public.perf_runs from anon, authenticated;
grant select on public.perf_runs to authenticated;
grant insert (vehicle_id, ran_at, zero_sixty_s, quarter_s, trap_mph, est_whp, weight_lb, sample_hz, quality, note,
              shared, samples) on public.perf_runs to authenticated;
grant update (note, shared) on public.perf_runs to authenticated;
alter table public.perf_runs enable row level security;
create policy perf_runs_own_select on public.perf_runs for select to authenticated
  using (owner_id = auth.uid() and deleted_at is null);
create policy perf_runs_insert on public.perf_runs for insert to authenticated
  with check (owner_id = auth.uid() and exists (
    select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = auth.uid() and v.deleted_at is null));
create policy perf_runs_own_update on public.perf_runs for update to authenticated
  using (owner_id = auth.uid() and deleted_at is null) with check (owner_id = auth.uid());

create function public.soft_delete_perf_run(p_run uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.perf_runs set deleted_at = now() where id = p_run and owner_id = auth.uid() and deleted_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Shared runs on public builds: the numbers only (no trace, no note).
create view public.public_perf_runs with (security_barrier = true) as
  select r.id as run_id, r.vehicle_id, r.ran_at, r.zero_sixty_s, r.quarter_s, r.trap_mph, r.est_whp,
         r.sample_hz, r.quality
  from public.perf_runs r
  join public.public_builds pb on pb.vehicle_id = r.vehicle_id
  where r.deleted_at is null and r.shared;

-- ================================================================ 2. owner fitment (public builds only)

-- Which parts owners of the same car run, counted per part (case-insensitive name + brand). Only public builds
-- count, blocked owners are left out, and the answer is counts plus public vehicle ids, nothing else.
-- "Same car": same make and model, model year within 3 either side.
create function public.owner_fitment(p_make text, p_model text, p_year integer,
                                     p_category text default null, p_terms text default null)
returns table (name text, brand text, category text, owners integer, vehicle_ids uuid[])
language sql stable security definer set search_path = '' as $$
  with words as (
    select w from regexp_split_to_table(lower(left(coalesce(p_terms, ''), 120)), '[^a-z0-9]+') w
    where char_length(w) >= 3 limit 6
  ), hits as (
    select lower(pm.name) as n, lower(coalesce(pm.brand, '')) as b, min(pm.name) as name, min(pm.brand) as brand,
           min(pm.category::text) as category, pm.vehicle_id
    from public.public_mods pm
    join public.public_vehicles pv on pv.vehicle_id = pm.vehicle_id
    where lower(pv.make) = lower(left(p_make, 40)) and lower(pv.model) = lower(left(p_model, 60))
      and pv.year between p_year - 3 and p_year + 3
      and pm.status = 'complete'
      and (p_category is null or pm.category::text = p_category)
      and (not exists (select 1 from words)
           or exists (select 1 from words where lower(pm.name || ' ' || coalesce(pm.brand, '')) like '%' || w || '%'))
    group by lower(pm.name), lower(coalesce(pm.brand, '')), pm.vehicle_id
  )
  select min(h.name), min(h.brand), min(h.category), count(distinct h.vehicle_id)::integer,
         (array_agg(distinct h.vehicle_id))[1:5]
  from hits h
  group by h.n, h.b
  order by 4 desc, 1
  limit 10
$$;

-- ================================================================ 3. repeating meets

alter table public.events add column series_id uuid;
create index events_series_idx on public.events (series_id, starts_at) where series_id is not null and deleted_at is null;

-- A series counts as one new event against the daily limit (5 a day), plus its own limit (3 series a day).
create function public.events_rate_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('app.event_series', true), '') <> 'on' then
    perform public.enforce_rate_limit('event_create', 5, 86400);
  end if;
  return new;
end $$;
revoke execute on function public.events_rate_limit() from public, anon, authenticated;
drop trigger events_rate_limit on public.events;
create trigger events_rate_limit before insert on public.events for each row execute function public.events_rate_limit();

-- 2 to 12 occurrences, each a normal event (own RSVPs, check-ins and chat). Same checks as creating one event.
create function public.create_event_series(
  p_title text, p_description text, p_starts_at timestamptz, p_ends_at timestamptz, p_location_text text,
  p_capacity integer, p_kind text, p_route_id uuid, p_club_id uuid, p_place_lat double precision,
  p_place_lng double precision, p_repeat text, p_count integer)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_series uuid := gen_random_uuid();
  v_step interval;
  i integer;
begin
  if auth.uid() is null then raise exception 'sign_in_required' using errcode = 'P0001'; end if;
  if not public.current_user_verified() then raise exception 'email_not_verified' using errcode = 'P0001'; end if;
  if not public.current_user_has_username() then raise exception 'username_required' using errcode = 'P0001'; end if;
  if p_count is null or p_count not between 2 and 12 then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  v_step := case p_repeat when 'weekly' then interval '7 days' when 'biweekly' then interval '14 days'
                          when 'monthly' then interval '1 month' end;
  if v_step is null then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  perform public.enforce_rate_limit('event_create', 5, 86400);
  perform public.enforce_rate_limit('event_series', 3, 86400);
  perform set_config('app.event_series', 'on', true);
  for i in 0 .. p_count - 1 loop
    insert into public.events (organizer_id, title, description, starts_at, ends_at, location_text, capacity,
                               kind, route_id, club_id, place_lat, place_lng, series_id)
    values (auth.uid(), p_title, p_description, p_starts_at + v_step * i, p_ends_at + v_step * i, p_location_text,
            p_capacity, coalesce(p_kind, 'meet'), p_route_id, p_club_id, p_place_lat, p_place_lng,
            v_series);
  end loop;
  perform set_config('app.event_series', 'off', true);
  return v_series;
end $$;

-- The other dates in an event's series that are still to come (public events only).
create function public.event_series_dates(p_event uuid)
returns table (event_id uuid, starts_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select pe.event_id, pe.starts_at
  from public.events e
  join public.events s on s.series_id = e.series_id
  join public.public_events pe on pe.event_id = s.id
  where e.id = p_event and e.series_id is not null and pe.status = 'scheduled' and pe.ends_at > now()
  order by pe.starts_at
  limit 12
$$;

-- Organizer: cancel this date and every later one in the series. Returns how many were cancelled.
create function public.cancel_event_series(p_event uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_series uuid;
  v_from timestamptz;
  r record;
  n integer := 0;
begin
  select e.series_id, e.starts_at into v_series, v_from from public.events e
    where e.id = p_event and e.organizer_id = auth.uid() and e.deleted_at is null;
  if v_series is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  for r in select e.id from public.events e
           where e.series_id = v_series and e.starts_at >= v_from and e.status = 'scheduled' and e.deleted_at is null loop
    if public.cancel_event(r.id) then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- ================================================================ 4. live group drive

-- One row per person per drive, overwritten as they move. Never readable directly: only through
-- drive_positions_for(), which checks you're in the drive and the drive is on.
create table public.drive_positions (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  heading real check (heading between 0 and 360),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
revoke all on public.drive_positions from anon, authenticated;
alter table public.drive_positions enable row level security;

-- In the drive: the organizer, or going. On: from 30 minutes before the start until 30 minutes after the end.
create function app_private.drive_live_for(p_event uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event and e.kind = 'drive' and e.status = 'scheduled' and e.deleted_at is null
      and e.hidden_at is null
      and now() between e.starts_at - interval '30 minutes' and e.ends_at + interval '30 minutes'
      and (e.organizer_id = p_user
           or exists (select 1 from public.event_rsvps r where r.event_id = e.id and r.user_id = p_user
                      and r.status = 'going')))
$$;

create function public.share_drive_position(p_event uuid, p_lat double precision, p_lng double precision,
                                            p_heading real default null)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign_in_required' using errcode = 'P0001'; end if;
  if not app_private.drive_live_for(p_event, auth.uid()) then
    raise exception 'drive_not_live' using errcode = 'P0001';
  end if;
  insert into public.drive_positions (event_id, user_id, lat, lng, heading)
    values (p_event, auth.uid(), p_lat, p_lng, p_heading)
    on conflict (event_id, user_id) do update
      set lat = excluded.lat, lng = excluded.lng, heading = excluded.heading, updated_at = now();
  -- housekeeping: positions from drives that ended more than 30 minutes ago are deleted
  delete from public.drive_positions dp using public.events e
    where e.id = dp.event_id and e.ends_at < now() - interval '30 minutes';
  return true;
end $$;

create function public.stop_sharing_drive(p_event uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.drive_positions where event_id = p_event and user_id = auth.uid();
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Everyone sharing in a drive you're in, seen in the last 5 minutes (people you've blocked, or who blocked you,
-- are left out).
create function public.drive_positions_for(p_event uuid)
returns table (username text, lat double precision, lng double precision, heading real, seconds_ago integer,
               mine boolean)
language sql stable security definer set search_path = '' as $$
  select u.username, dp.lat, dp.lng, dp.heading, extract(epoch from now() - dp.updated_at)::integer,
         dp.user_id = auth.uid()
  from public.drive_positions dp
  join public.users u on u.id = dp.user_id and u.deleted_at is null and u.username is not null
  where dp.event_id = p_event and app_private.drive_live_for(p_event, auth.uid())
    and dp.updated_at > now() - interval '5 minutes'
    and (dp.user_id = auth.uid() or not public.is_blocked_with(dp.user_id))
  order by u.username
$$;

-- ================================================================ grants

revoke all on function app_private.drive_live_for(uuid, uuid) from public, anon, authenticated;
revoke all on public.public_perf_runs from anon, authenticated;
grant select on public.public_perf_runs to anon, authenticated;
grant execute on function public.owner_fitment(text, text, integer, text, text), public.event_series_dates(uuid)
  to anon, authenticated;
grant execute on function public.soft_delete_perf_run(uuid),
  public.create_event_series(text, text, timestamptz, timestamptz, text, integer, text, uuid, uuid,
                             double precision, double precision, text, integer),
  public.cancel_event_series(uuid), public.share_drive_position(uuid, double precision, double precision, real),
  public.stop_sharing_drive(uuid), public.drive_positions_for(uuid)
  to authenticated;
