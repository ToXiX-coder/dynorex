-- Dynorex Phase 7 (v2), first slice: Line (routes, privacy trimming, ratings, monthly limit, discovery)
-- and Paddock (events, RSVP with capacity, rotating check-in codes, reminders).
-- Both stay behind their app flags (off in production) until each passes the v2 exit gate.
-- New functions are private by default since migration 6: every grant below is deliberate.

-- ================================================================ LINE

-- Great-circle distance in metres.
create function public.haversine_m(lat1 float8, lon1 float8, lat2 float8, lon2 float8) returns float8
language sql immutable parallel safe set search_path = '' as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)))
$$;

-- Points are [[lat, lon, epoch_ms], ...]. Returns null if anything is malformed or physically impossible.
create function public.route_track_ok(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  n integer;
  i integer;
  lat float8; lon float8; t float8;
  plat float8; plon float8; pt float8;
begin
  if jsonb_typeof(p) <> 'array' then return false; end if;
  n := jsonb_array_length(p);
  if n < 2 or n > 20000 then return false; end if;
  for i in 0 .. n - 1 loop
    if jsonb_typeof(p -> i) <> 'array' or jsonb_array_length(p -> i) <> 3 then return false; end if;
    lat := (p -> i ->> 0)::float8; lon := (p -> i ->> 1)::float8; t := (p -> i ->> 2)::float8;
    if lat is null or lon is null or t is null or abs(lat) > 90 or abs(lon) > 180 then return false; end if;
    if i > 0 then
      if t < pt then return false; end if;
      -- faster than 120 m/s (430 km/h) between fixes is a bad track, not a drive
      if t > pt and public.haversine_m(plat, plon, lat, lon) / ((t - pt) / 1000) > 120 then return false; end if;
    end if;
    plat := lat; plon := lon; pt := t;
  end loop;
  return true;
exception when others then
  return false;
end $$;

create function public.route_distance_m(p jsonb) returns integer
language sql immutable set search_path = '' as $$
  select coalesce(round(sum(public.haversine_m((a ->> 0)::float8, (a ->> 1)::float8, (b ->> 0)::float8, (b ->> 1)::float8)))::integer, 0)
  from (select e as a, lead(e) over (order by o) as b from jsonb_array_elements(p) with ordinality as x(e, o)) s
  where b is not null
$$;

-- Privacy trimming: drop the first and last `metres` of a track so a shared route never shows where someone
-- starts or ends (home, work). Done on the server; the app can't skip it.
create function public.trim_route(p jsonb, metres integer default 500) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  n integer := jsonb_array_length(p);
  i integer;
  d float8 := 0;
  first_keep integer := n;
  last_keep integer := -1;
begin
  for i in 1 .. n - 1 loop
    d := d + public.haversine_m((p -> (i - 1) ->> 0)::float8, (p -> (i - 1) ->> 1)::float8, (p -> i ->> 0)::float8, (p -> i ->> 1)::float8);
    if d >= metres then first_keep := i; exit; end if;
  end loop;
  d := 0;
  for i in reverse n - 2 .. 0 loop
    d := d + public.haversine_m((p -> (i + 1) ->> 0)::float8, (p -> (i + 1) ->> 1)::float8, (p -> i ->> 0)::float8, (p -> i ->> 1)::float8);
    if d >= metres then last_keep := i; exit; end if;
  end loop;
  if first_keep >= last_keep then
    return null; -- too short to share safely
  end if;
  -- public copy: positions only, timestamps removed
  return (select jsonb_agg(jsonb_build_array(round(((p -> j ->> 0)::numeric), 5), round(((p -> j ->> 1)::numeric), 5)) order by j)
          from generate_series(first_keep, last_keep) j);
end $$;

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  description text check (char_length(description) <= 1000),
  visibility public.visibility not null default 'private' check (visibility <> 'friends_only'),
  -- full track: owner only
  points jsonb not null check (public.route_track_ok(points)),
  distance_m integer not null check (distance_m between 0 and 2000000),
  duration_s integer not null check (duration_s between 0 and 172800),
  started_at timestamptz not null,
  ended_at timestamptz not null check (ended_at >= started_at),
  -- trimmed copy shown publicly, set by the server only
  public_points jsonb,
  start_cell_lat smallint,
  start_cell_lon smallint,
  client_ref uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  hidden_at timestamptz
);
create unique index routes_client_ref_uq on public.routes (owner_id, client_ref) where client_ref is not null;
create index routes_owner_idx on public.routes (owner_id, created_at desc) where deleted_at is null;
create index routes_public_idx on public.routes (created_at desc) where deleted_at is null and visibility = 'public';
create trigger routes_updated_at before update on public.routes for each row execute function public.set_updated_at();

revoke all on public.routes from anon, authenticated;
grant select on public.routes to authenticated;
alter table public.routes enable row level security;
create policy routes_owner_select on public.routes for select to authenticated
  using (owner_id = auth.uid() and deleted_at is null);
-- writes only through the functions below

create function public.route_monthly_count(p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  -- deleted recordings still count, so delete-and-record-again can't get around the limit
  select count(*)::integer from public.routes
  where owner_id = p_user and created_at >= date_trunc('month', now())
$$;

-- Apply visibility: public needs a verified email + username and a route long enough to trim.
create function public.apply_route_visibility(p_route uuid, p_public boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  trimmed jsonb;
begin
  if p_public then
    if not public.current_user_verified() then
      raise exception 'email_not_verified' using errcode = 'P0001';
    end if;
    if not public.current_user_has_username() then
      raise exception 'username_required' using errcode = 'P0001';
    end if;
    select public.trim_route(points) into trimmed from public.routes where id = p_route;
    if trimmed is null then
      raise exception 'route_too_short_to_share' using errcode = 'P0001',
        hint = 'Shared routes hide the first and last 500 m, so they need to be longer than about 1 km.';
    end if;
    update public.routes set visibility = 'public', public_points = trimmed,
      start_cell_lat = floor(((trimmed -> 0 ->> 0)::float8) * 2)::smallint,
      start_cell_lon = floor(((trimmed -> 0 ->> 1)::float8) * 2)::smallint
    where id = p_route;
  else
    update public.routes set visibility = 'private', public_points = null, start_cell_lat = null, start_cell_lon = null
    where id = p_route;
  end if;
end $$;

-- Save a recorded drive. Validates the track, computes distance/duration server-side, enforces the
-- monthly limit atomically (5 for Free, unlimited for Dynorex+), and is idempotent on client_ref.
create function public.save_route(
  p_client_ref uuid, p_title text, p_description text, p_points jsonb, p_public boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_start timestamptz;
  v_end timestamptz;
begin
  if auth.uid() is null then
    raise exception 'sign_in_required' using errcode = 'P0001';
  end if;
  select r.id into v_id from public.routes r where r.owner_id = auth.uid() and r.client_ref = p_client_ref;
  if v_id is not null then
    return v_id; -- already saved by an earlier attempt
  end if;
  if not public.route_track_ok(p_points) then
    raise exception 'invalid_route' using errcode = '22023';
  end if;
  perform public.enforce_rate_limit('route_save', 30, 3600);
  perform pg_advisory_xact_lock(hashtext('routes:' || auth.uid()::text));
  if not public.user_has_plus(auth.uid()) and public.route_monthly_count(auth.uid()) >= 5 then
    raise exception 'plan_limit_routes' using errcode = 'P0001', hint = 'limit=5';
  end if;
  v_start := to_timestamp(((p_points -> 0 ->> 2)::float8) / 1000);
  v_end := to_timestamp(((p_points -> (jsonb_array_length(p_points) - 1) ->> 2)::float8) / 1000);
  insert into public.routes (owner_id, title, description, points, distance_m, duration_s, started_at, ended_at, client_ref)
    values (auth.uid(), p_title, nullif(trim(coalesce(p_description, '')), ''), p_points, public.route_distance_m(p_points),
            extract(epoch from (v_end - v_start))::integer, v_start, v_end, p_client_ref)
    returning id into v_id;
  if p_public then
    perform public.apply_route_visibility(v_id, true);
  end if;
  return v_id;
end $$;

create function public.set_route_public(p_route uuid, p_public boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.routes where id = p_route and owner_id = auth.uid() and deleted_at is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.apply_route_visibility(p_route, p_public);
  return p_public;
end $$;

create function public.soft_delete_route(p_route uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.routes set deleted_at = now(), public_points = null
    where id = p_route and owner_id = auth.uid() and deleted_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;

create table public.route_ratings (
  route_id uuid not null references public.routes (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  comment text check (char_length(comment) <= 280 and comment !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (route_id, user_id)
);
create trigger route_ratings_updated_at before update on public.route_ratings for each row execute function public.set_updated_at();
create trigger route_ratings_rate_limit before insert on public.route_ratings
  for each row execute function public.rate_limit_trigger('rating', '30', '3600');

-- Public routes: trimmed geometry only, start date (not time), no owner id. Same rules as public builds.
create view public.public_routes with (security_barrier = true) as
  select r.id as route_id, u.username as owner_username, r.title, r.description, r.distance_m, r.duration_s,
         r.started_at::date as drive_date, r.public_points as points, r.created_at,
         (select round(avg(x.stars), 1) from public.route_ratings x where x.route_id = r.id) as rating_avg,
         (select count(*) from public.route_ratings x where x.route_id = r.id) as rating_count
  from public.routes r
  join public.users u on u.id = r.owner_id and u.deleted_at is null and u.hidden_at is null and u.username is not null
  where r.deleted_at is null and r.hidden_at is null and r.visibility = 'public' and r.public_points is not null
    and not public.is_blocked_with(r.owner_id);
revoke all on public.public_routes from anon, authenticated;
grant select on public.public_routes to anon, authenticated;

revoke all on public.route_ratings from anon, authenticated;
grant select, insert (route_id, stars, comment), update (stars, comment), delete on public.route_ratings to authenticated;
alter table public.route_ratings enable row level security;
create policy route_ratings_own_select on public.route_ratings for select to authenticated using (user_id = auth.uid());
create policy route_ratings_insert on public.route_ratings for insert to authenticated
  with check (
    user_id = auth.uid() and public.current_user_has_username()
    and exists (select 1 from public.public_routes pr where pr.route_id = route_ratings.route_id)
    and not exists (select 1 from public.routes r where r.id = route_ratings.route_id and r.owner_id = auth.uid())
  );
create policy route_ratings_update on public.route_ratings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy route_ratings_delete on public.route_ratings for delete to authenticated using (user_id = auth.uid());

-- Discovery: top rated, newest, or near me (coarse cells from Phase 4; trimmed start only).
create function public.discover_routes(p_mode text default 'top', p_page integer default 0)
returns setof public.public_routes
language plpgsql stable security definer set search_path = '' as $$
declare me app_private.user_regions;
begin
  if p_mode not in ('top', 'new', 'nearby') then
    raise exception 'invalid_mode' using errcode = '22023';
  end if;
  if p_mode = 'nearby' then
    select * into me from app_private.user_regions r where r.user_id = auth.uid() and r.updated_at > now() - interval '30 days';
    if not found then return; end if;
  end if;
  return query
  select pr.* from public.public_routes pr
  join public.routes r on r.id = pr.route_id
  where (p_mode <> 'nearby' or (abs(r.start_cell_lat - me.cell_lat) <= 1 and abs(r.start_cell_lon - me.cell_lon) <= 1))
    and not exists (select 1 from public.mutes m where m.muter_id = auth.uid() and m.muted_id = r.owner_id)
  order by
    case when p_mode = 'top' then coalesce(pr.rating_avg, 0) * ln(2 + pr.rating_count) end desc nulls last,
    pr.created_at desc, pr.route_id
  limit 20 offset least(greatest(p_page, 0), 50) * 20;
end $$;

-- ================================================================ PADDOCK: events

create type public.event_status as enum ('scheduled', 'cancelled');
create type public.rsvp_status as enum ('going', 'interested');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  description text check (char_length(description) <= 2000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- the organizer's chosen meeting place, shown publicly (events are meant to be found)
  location_text text not null check (char_length(location_text) between 1 and 120),
  capacity integer check (capacity between 1 and 5000),
  status public.event_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  hidden_at timestamptz,
  check (ends_at > starts_at and ends_at <= starts_at + interval '7 days'),
  check (coalesce(title, '') !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' and coalesce(description, '') !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]')
);
create index events_upcoming_idx on public.events (starts_at) where deleted_at is null and status = 'scheduled';
create trigger events_updated_at before update on public.events for each row execute function public.set_updated_at();
create trigger events_rate_limit before insert on public.events
  for each row execute function public.rate_limit_trigger('event_create', '5', '86400');

-- New events must start in the future; an event that has started can't be moved.
create function public.check_event_times() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.starts_at < now() then
    raise exception 'event_in_past' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.starts_at <= now() and (new.starts_at, new.ends_at) is distinct from (old.starts_at, old.ends_at) then
    raise exception 'event_already_started' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger events_times before insert or update on public.events for each row execute function public.check_event_times();
revoke execute on function public.check_event_times() from public, anon, authenticated;

revoke all on public.events from anon, authenticated;
grant select, insert (title, description, starts_at, ends_at, location_text, capacity),
  update (title, description, starts_at, ends_at, location_text, capacity) on public.events to authenticated;
alter table public.events enable row level security;
create policy events_organizer_select on public.events for select to authenticated
  using (organizer_id = auth.uid() and deleted_at is null);
create policy events_insert on public.events for insert to authenticated
  with check (organizer_id = auth.uid() and public.current_user_verified() and public.current_user_has_username());
create policy events_update on public.events for update to authenticated
  using (organizer_id = auth.uid() and deleted_at is null and status = 'scheduled') with check (organizer_id = auth.uid());

create table public.event_rsvps (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  status public.rsvp_status not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_rsvps_user_idx on public.event_rsvps (user_id);
revoke all on public.event_rsvps from anon, authenticated;
grant select on public.event_rsvps to authenticated;
alter table public.event_rsvps enable row level security;
create policy event_rsvps_own on public.event_rsvps for select to authenticated using (user_id = auth.uid());

create table public.event_checkins (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  method text not null default 'code' check (method in ('code')),
  primary key (event_id, user_id)
);
revoke all on public.event_checkins from anon, authenticated;
grant select on public.event_checkins to authenticated;
alter table public.event_checkins enable row level security;
create policy event_checkins_own on public.event_checkins for select to authenticated using (user_id = auth.uid());

-- Rotating check-in codes (server only). A code lives 90 seconds; the organizer's screen fetches a new one.
create table app_private.event_checkin_codes (
  event_id uuid not null references public.events (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{6}$'),
  expires_at timestamptz not null,
  primary key (event_id, code)
);

create view public.public_events with (security_barrier = true) as
  select e.id as event_id, u.username as organizer_username, e.title, e.description, e.starts_at, e.ends_at,
         e.location_text, e.capacity, e.status,
         (select count(*) from public.event_rsvps r where r.event_id = e.id and r.status = 'going') as going_count,
         (select count(*) from public.event_rsvps r where r.event_id = e.id and r.status = 'interested') as interested_count
  from public.events e
  join public.users u on u.id = e.organizer_id and u.deleted_at is null and u.hidden_at is null and u.username is not null
  where e.deleted_at is null and e.hidden_at is null and not public.is_blocked_with(e.organizer_id);
revoke all on public.public_events from anon, authenticated;
grant select on public.public_events to anon, authenticated;

-- RSVP. "Going" respects capacity under a row lock, so two last-seat requests can't both get in.
create function public.rsvp_event(p_event uuid, p_status public.rsvp_status) returns text
language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  going integer;
begin
  if auth.uid() is null then
    raise exception 'sign_in_required' using errcode = 'P0001';
  end if;
  if not public.current_user_has_username() then
    raise exception 'username_required' using errcode = 'P0001';
  end if;
  perform public.enforce_rate_limit('rsvp', 60, 3600);
  select * into e from public.events where id = p_event for update;
  if not found or e.deleted_at is not null or e.hidden_at is not null or public.is_blocked_with(e.organizer_id)
     or not exists (select 1 from public.users u where u.id = e.organizer_id and u.username is not null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if e.status <> 'scheduled' or e.ends_at < now() then
    raise exception 'event_closed' using errcode = 'P0001';
  end if;
  if p_status = 'going' and e.capacity is not null
     and not exists (select 1 from public.event_rsvps r where r.event_id = p_event and r.user_id = auth.uid() and r.status = 'going') then
    select count(*) into going from public.event_rsvps r where r.event_id = p_event and r.status = 'going';
    if going >= e.capacity then
      raise exception 'event_full' using errcode = 'P0001';
    end if;
  end if;
  insert into public.event_rsvps (event_id, user_id, status) values (p_event, auth.uid(), p_status)
    on conflict (event_id, user_id) do update set status = excluded.status;
  return p_status::text;
end $$;

create function public.cancel_rsvp(p_event uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.event_rsvps where event_id = p_event and user_id = auth.uid();
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Organizer cancels: everyone who said going/interested is told (respecting their notification switch).
create function public.cancel_event(p_event uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_title text;
begin
  update public.events set status = 'cancelled'
    where id = p_event and organizer_id = auth.uid() and deleted_at is null and status = 'scheduled'
    returning title into v_title;
  if v_title is null then
    return false;
  end if;
  insert into public.notifications (recipient_id, actor_id, category, entity_type, entity_id, title, body)
  select r.user_id, auth.uid(), 'event_reminder', 'event', p_event::text, 'Event cancelled',
         format('%s was cancelled by the organizer.', left(v_title, 100))
  from public.event_rsvps r
  where r.event_id = p_event and public.notification_enabled(r.user_id, 'event_reminder');
  return true;
end $$;

-- Organizer only, while the event is on (1 h before start until end): a fresh 6-digit code for 90 s.
create function public.event_checkin_code(p_event uuid) returns table (code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  v_code text;
begin
  select * into e from public.events where id = p_event and organizer_id = auth.uid() and deleted_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if e.status <> 'scheduled' or now() < e.starts_at - interval '1 hour' or now() > e.ends_at then
    raise exception 'checkin_closed' using errcode = 'P0001';
  end if;
  delete from app_private.event_checkin_codes c where c.event_id = p_event and c.expires_at < now();
  v_code := lpad((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % 1000000)::text, 6, '0');
  insert into app_private.event_checkin_codes (event_id, code, expires_at)
    values (p_event, v_code, now() + interval '90 seconds') on conflict do nothing;
  return query select v_code, now() + interval '90 seconds';
end $$;

-- Attendee check-in: must have RSVP'd going, event must be on, code must be current. Once per person;
-- 10 attempts an hour stops code guessing. A shared code is useless after 90 seconds.
create function public.check_in_event(p_event uuid, p_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare e public.events;
begin
  if auth.uid() is null then
    raise exception 'sign_in_required' using errcode = 'P0001';
  end if;
  perform public.enforce_rate_limit('checkin', 10, 3600);
  select * into e from public.events where id = p_event and deleted_at is null;
  if not found or e.status <> 'scheduled' or now() < e.starts_at - interval '1 hour' or now() > e.ends_at then
    raise exception 'checkin_closed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.event_rsvps r where r.event_id = p_event and r.user_id = auth.uid() and r.status = 'going') then
    raise exception 'rsvp_required' using errcode = 'P0001';
  end if;
  if not exists (select 1 from app_private.event_checkin_codes c
                 where c.event_id = p_event and c.code = p_code and c.expires_at > now()) then
    raise exception 'invalid_code' using errcode = 'P0001';
  end if;
  insert into public.event_checkins (event_id, user_id) values (p_event, auth.uid()) on conflict do nothing;
  return true;
end $$;

-- Organizer's attendance numbers (counts only).
create function public.event_attendance(p_event uuid) returns table (going integer, interested integer, checked_in integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.events where id = p_event and organizer_id = auth.uid()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return query select
    (select count(*)::integer from public.event_rsvps where event_id = p_event and status = 'going'),
    (select count(*)::integer from public.event_rsvps where event_id = p_event and status = 'interested'),
    (select count(*)::integer from public.event_checkins where event_id = p_event);
end $$;

create function public.upcoming_events(p_page integer default 0) returns setof public.public_events
language sql stable security definer set search_path = '' as $$
  select pe.* from public.public_events pe
  join public.users o on o.username = pe.organizer_username
  where pe.status = 'scheduled' and pe.ends_at > now()
    and not exists (select 1 from public.mutes m where m.muter_id = auth.uid() and m.muted_id = o.id)
  order by pe.starts_at, pe.event_id
  limit 20 offset least(greatest(p_page, 0), 50) * 20
$$;

-- Reminders 24 h before (scheduler, hourly). Once per person per event.
create function public.queue_event_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into public.notifications (recipient_id, actor_id, category, entity_type, entity_id, title, body)
  select r.user_id, e.organizer_id, 'event_reminder', 'event', e.id::text, 'Tomorrow: ' || left(e.title, 60),
         format('%s starts in about 24 hours at %s.', left(e.title, 60), left(e.location_text, 80))
  from public.events e join public.event_rsvps r on r.event_id = e.id
  where e.status = 'scheduled' and e.deleted_at is null
    and e.starts_at between now() + interval '23 hours' and now() + interval '25 hours'
    and public.notification_enabled(r.user_id, 'event_reminder')
    and not exists (select 1 from public.notifications x where x.recipient_id = r.user_id
                    and x.category = 'event_reminder' and x.entity_id = e.id::text);
  get diagnostics n = row_count;
  return n;
end $$;

-- ================================================================ grants (explicit: functions are private by default)

grant execute on function public.haversine_m(float8, float8, float8, float8), public.route_track_ok(jsonb),
  public.route_distance_m(jsonb), public.trim_route(jsonb, integer) to authenticated;
grant execute on function public.save_route(uuid, text, text, jsonb, boolean), public.set_route_public(uuid, boolean),
  public.soft_delete_route(uuid) to authenticated;
grant execute on function public.discover_routes(text, integer), public.upcoming_events(integer) to anon, authenticated;
grant execute on function public.rsvp_event(uuid, public.rsvp_status), public.cancel_rsvp(uuid), public.cancel_event(uuid),
  public.event_checkin_code(uuid), public.check_in_event(uuid, text), public.event_attendance(uuid) to authenticated;
grant execute on function public.queue_event_reminders() to service_role;
-- route_monthly_count and apply_route_visibility stay internal (no grants)

-- ================================================================ safety: routes and events can be reported and moderated
alter type public.report_target add value if not exists 'route';
alter type public.report_target add value if not exists 'event';
