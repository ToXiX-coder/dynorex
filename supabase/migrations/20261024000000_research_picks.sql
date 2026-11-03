-- D-62 (2026-10-14): five features from the owner-research round.
--   1. insurance mod list: mods record who fitted them (the list itself is built on the phone, private)
--   2. recall alerts: NHTSA recalls by make / model / year (never the VIN), checked daily by the recall-check
--      Edge Function, owners told once per campaign, and can mark one "dealt with"
--   3. dyno log: owner-reported dyno results with the dyno brand and correction, private unless shared
--   4. track laps: best laps from a lap-timer app (RaceChrono, Harry's ...), private unless shared
--   5. wishlist alerts: a new Shop listing that matches something on your wishlist (and your car) tells you
-- New enum values are only referenced inside function bodies (checked at run time).

alter type public.notification_category add value if not exists 'recall';
alter type public.notification_category add value if not exists 'wishlist_match';

alter table public.notifications drop constraint notifications_entity_type_check;
alter table public.notifications add constraint notifications_entity_type_check
  check (entity_type in ('user','build','mod','event','listing','subscription','botw','business','service_request',
                         'post','vehicle'));

-- ================================================================ 1. who fitted a mod (insurance list)

alter table public.mods
  add column installed_by text check (char_length(installed_by) <= 80 and installed_by !~ '[\x01-\x1F\x7F]');
grant insert (installed_by), update (installed_by) on public.mods to authenticated;

-- ================================================================ 2. recall alerts

-- A cache of NHTSA recall campaigns per make / model / year (public government data). Written only by the
-- recall-check Edge Function; owners read the ones for their own cars through my_vehicle_recalls().
create table public.vehicle_recalls (
  campaign text not null check (campaign ~ '^[0-9A-Z]{6,16}$'),
  make_key text not null,
  model_key text not null,
  model_year integer not null check (model_year between 1950 and 2100),
  component text check (char_length(component) <= 300),
  summary text check (char_length(summary) <= 4000),
  consequence text check (char_length(consequence) <= 4000),
  remedy text check (char_length(remedy) <= 4000),
  reported_on date,
  park_it boolean not null default false,
  fetched_at timestamptz not null default now(),
  primary key (campaign, make_key, model_key, model_year)
);
create index vehicle_recalls_car_idx on public.vehicle_recalls (make_key, model_key, model_year);
revoke all on public.vehicle_recalls from anon, authenticated;
alter table public.vehicle_recalls enable row level security;

-- "Done, or not my car": hides a recall from that car's list (the owner's choice, private).
create table public.recall_dismissals (
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  owner_id uuid not null references public.users (id) on delete cascade,
  campaign text not null,
  created_at timestamptz not null default now(),
  primary key (vehicle_id, campaign)
);
revoke all on public.recall_dismissals from anon, authenticated;
grant select on public.recall_dismissals to authenticated;
alter table public.recall_dismissals enable row level security;
create policy recall_dismissals_own on public.recall_dismissals for select to authenticated using (owner_id = auth.uid());

create function app_private.car_key(p text) returns text
language sql immutable set search_path = '' as $$ select lower(btrim(p)) $$;

-- The cars to check: each make / model / year that a live car has (no owners, no VINs).
create function public.recall_targets() returns table (make text, model text, model_year integer)
language sql stable security definer set search_path = '' as $$
  select distinct min(v.make), min(v.model), v.year
  from public.vehicles v
  where v.deleted_at is null and v.year is not null
  group by app_private.car_key(v.make), app_private.car_key(v.model), v.year
$$;

-- Store what NHTSA returned for one make / model / year; campaigns seen for the first time tell the owners of
-- matching cars (once, respecting their switch). Returns how many alerts it queued.
create function public.store_recalls(p_make text, p_model text, p_year integer, p_items jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_make text := app_private.car_key(p_make);
  v_model text := app_private.car_key(p_model);
  v_new integer;
begin
  if jsonb_typeof(p_items) <> 'array' then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  with incoming as (
    select upper(btrim(i ->> 'campaign')) as campaign, left(i ->> 'component', 300) as component,
           left(i ->> 'summary', 4000) as summary, left(i ->> 'consequence', 4000) as consequence,
           left(i ->> 'remedy', 4000) as remedy, (i ->> 'reported_on')::date as reported_on,
           coalesce((i ->> 'park_it')::boolean, false) as park_it
    from jsonb_array_elements(p_items) i
    where upper(btrim(i ->> 'campaign')) ~ '^[0-9A-Z]{6,16}$'
  ), added as (
    insert into public.vehicle_recalls (campaign, make_key, model_key, model_year, component, summary, consequence,
                                        remedy, reported_on, park_it)
    select campaign, v_make, v_model, p_year, component, summary, consequence, remedy, reported_on, park_it
    from incoming
    on conflict (campaign, make_key, model_key, model_year) do update
      set summary = excluded.summary, consequence = excluded.consequence, remedy = excluded.remedy,
          component = excluded.component, park_it = excluded.park_it, fetched_at = now()
    returning campaign, component, park_it, (xmax = 0) as is_new
  ), fresh as (select * from added where is_new)
  insert into public.notifications (recipient_id, category, entity_type, entity_id, title, body)
  select distinct on (v.owner_id, v.id, f.campaign) v.owner_id, 'recall', 'vehicle', v.id::text,
         case when f.park_it then 'Recall: park it until fixed' else 'A recall may affect your car' end,
         left(format('%s on %s %s %s. Check with a dealer using your VIN.',
                     initcap(coalesce(split_part(f.component, ':', 1), 'A part')), v.year, v.make, v.model), 200)
  from fresh f
  join public.vehicles v on app_private.car_key(v.make) = v_make and app_private.car_key(v.model) = v_model
                        and v.year = p_year and v.deleted_at is null
  where public.notification_enabled(v.owner_id, 'recall');
  get diagnostics v_new = row_count;
  return v_new;
end $$;

-- Recalls for one of your cars, newest first, with whether you marked it dealt with.
create function public.my_vehicle_recalls(p_vehicle uuid)
returns table (campaign text, component text, summary text, consequence text, remedy text, reported_on date,
               park_it boolean, dismissed boolean)
language sql stable security definer set search_path = '' as $$
  select r.campaign, r.component, r.summary, r.consequence, r.remedy, r.reported_on, r.park_it,
         exists (select 1 from public.recall_dismissals d where d.vehicle_id = v.id and d.campaign = r.campaign)
  from public.vehicles v
  join public.vehicle_recalls r on r.make_key = app_private.car_key(v.make)
                                and r.model_key = app_private.car_key(v.model) and r.model_year = v.year
  where v.id = p_vehicle and v.owner_id = auth.uid() and v.deleted_at is null
  order by r.reported_on desc nulls last, r.campaign
$$;

create function public.set_recall_dismissed(p_vehicle uuid, p_campaign text, p_dismissed boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.vehicles v where v.id = p_vehicle and v.owner_id = auth.uid() and v.deleted_at is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_dismissed then
    insert into public.recall_dismissals (vehicle_id, owner_id, campaign) values (p_vehicle, auth.uid(), p_campaign)
      on conflict do nothing;
  else
    delete from public.recall_dismissals where vehicle_id = p_vehicle and campaign = p_campaign;
  end if;
  return true;
end $$;

-- ================================================================ 3. dyno log

create type public.dyno_brand as enum ('dynojet', 'mustang', 'dynapack', 'mainline', 'superflow', 'other');
create type public.dyno_correction as enum ('sae', 'std', 'uncorrected', 'unknown');

create table public.dyno_results (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  measured_on date not null check (measured_on between date '1990-01-01' and current_date + 1),
  dyno public.dyno_brand not null,
  correction public.dyno_correction not null default 'unknown',
  shop text check (char_length(shop) <= 80 and shop !~ '[\x01-\x1F\x7F]'),
  whp numeric(6, 1) not null check (whp between 20 and 3000),
  wtq numeric(6, 1) check (wtq between 20 and 3000),
  fuel text check (char_length(fuel) <= 40 and fuel !~ '[\x01-\x1F\x7F]'),
  notes text check (char_length(notes) <= 500 and notes !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  -- a photo of the sheet, set only by register-photo; private
  sheet_path text,
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index dyno_results_vehicle_idx on public.dyno_results (vehicle_id, measured_on desc) where deleted_at is null;
create trigger dyno_results_rate_limit before insert on public.dyno_results
  for each row execute function public.rate_limit_trigger('dyno_result', '30', '3600');
revoke all on public.dyno_results from anon, authenticated;
grant select on public.dyno_results to authenticated;
grant insert (vehicle_id, measured_on, dyno, correction, shop, whp, wtq, fuel, notes, shared) on public.dyno_results to authenticated;
grant update (measured_on, dyno, correction, shop, whp, wtq, fuel, notes, shared) on public.dyno_results to authenticated;
alter table public.dyno_results enable row level security;
create policy dyno_results_own_select on public.dyno_results for select to authenticated
  using (owner_id = auth.uid() and deleted_at is null);
create policy dyno_results_insert on public.dyno_results for insert to authenticated
  with check (owner_id = auth.uid() and exists (
    select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = auth.uid() and v.deleted_at is null));
create policy dyno_results_own_update on public.dyno_results for update to authenticated
  using (owner_id = auth.uid() and deleted_at is null) with check (owner_id = auth.uid());

-- Shared results on public builds: the numbers, dyno and shop only (no notes, no sheet).
create view public.public_dyno_results with (security_barrier = true) as
  select d.id as result_id, d.vehicle_id, d.measured_on, d.dyno, d.correction, d.shop, d.whp, d.wtq, d.fuel
  from public.dyno_results d
  join public.public_builds pb on pb.vehicle_id = d.vehicle_id
  where d.deleted_at is null and d.shared;

create function public.soft_delete_dyno_result(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.dyno_results set deleted_at = now() where id = p_id and owner_id = auth.uid() and deleted_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- ================================================================ 4. track laps

create table public.track_laps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  track text not null check (char_length(track) between 2 and 80 and track !~ '[\x01-\x1F\x7F]'),
  -- 20 s to 30 min
  lap_ms integer not null check (lap_ms between 20000 and 1800000),
  driven_on date not null check (driven_on between date '1990-01-01' and current_date + 1),
  source text not null default 'manual'
    check (source in ('racechrono', 'harrys', 'trackaddict', 'aim', 'other', 'manual')),
  notes text check (char_length(notes) <= 300 and notes !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index track_laps_vehicle_idx on public.track_laps (vehicle_id, driven_on desc) where deleted_at is null;
create trigger track_laps_rate_limit before insert on public.track_laps
  for each row execute function public.rate_limit_trigger('track_lap', '120', '3600');
revoke all on public.track_laps from anon, authenticated;
grant select on public.track_laps to authenticated;
grant insert (vehicle_id, track, lap_ms, driven_on, source, notes, shared) on public.track_laps to authenticated;
grant update (track, lap_ms, driven_on, source, notes, shared) on public.track_laps to authenticated;
alter table public.track_laps enable row level security;
create policy track_laps_own_select on public.track_laps for select to authenticated
  using (owner_id = auth.uid() and deleted_at is null);
create policy track_laps_insert on public.track_laps for insert to authenticated
  with check (owner_id = auth.uid() and exists (
    select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = auth.uid() and v.deleted_at is null));
create policy track_laps_own_update on public.track_laps for update to authenticated
  using (owner_id = auth.uid() and deleted_at is null) with check (owner_id = auth.uid());

create view public.public_track_laps with (security_barrier = true) as
  select l.id as lap_id, l.vehicle_id, l.track, l.lap_ms, l.driven_on, l.source
  from public.track_laps l
  join public.public_builds pb on pb.vehicle_id = l.vehicle_id
  where l.deleted_at is null and l.shared;

create function public.soft_delete_track_lap(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.track_laps set deleted_at = now() where id = p_id and owner_id = auth.uid() and deleted_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- ================================================================ 5. wishlist alerts

-- A word from a wishlist item that's worth matching on (4+ letters, not a filler word).
create function app_private.wish_words(p text) returns setof text
language sql immutable set search_path = '' as $$
  select distinct w from regexp_split_to_table(lower(p), '[^a-z0-9]+') w
  where char_length(w) >= 4
    and w not in ('with', 'from', 'used', 'new', 'like', 'pair', 'full', 'kit', 'part', 'parts', 'front', 'rear', 'set',
                  'stock', 'oem', 'aftermarket', 'for', 'and', 'the')
$$;

-- A new active listing tells people whose wishlist has a matching word in its title, and (when the wishlist
-- item is for a car) whose car's model is named in the listing. Once per person per listing; never the seller,
-- blocked people, or anyone who turned the alert off. Live only while the Shop is.
create function app_private.notify_wishlist_match() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'active' or new.deleted_at is not null or new.hidden_at is not null then return new; end if;
  insert into public.notifications (recipient_id, actor_id, category, entity_type, entity_id, title, body)
  select distinct on (w.owner_id) w.owner_id, new.seller_id, 'wishlist_match', 'listing', new.id::text,
         'Wishlist match in the Shop', format('%s is listed. It matches "%s" on your wishlist.', left(new.title, 70),
                                              left(w.name, 60))
  from public.wishlist_items w
  left join public.vehicles v on v.id = w.vehicle_id and v.deleted_at is null
  where w.deleted_at is null and w.owner_id <> new.seller_id
    and exists (select 1 from app_private.wish_words(w.name) x
                where lower(new.title) ~ ('\m' || x || '\M'))
    and (w.vehicle_id is null
         or (v.id is not null and position(lower(v.model) in lower(coalesce(new.fits, '') || ' ' || new.title)) > 0))
    and public.notification_enabled(w.owner_id, 'wishlist_match')
    and not exists (select 1 from public.blocks k where (k.blocker_id = w.owner_id and k.blocked_id = new.seller_id)
                                                 or (k.blocker_id = new.seller_id and k.blocked_id = w.owner_id))
  order by w.owner_id, w.created_at desc;
  return new;
end $$;
create trigger listings_notify_wishlist after insert on public.listings
  for each row execute function app_private.notify_wishlist_match();

-- ================================================================ grants

revoke all on function app_private.car_key(text), app_private.wish_words(text),
  app_private.notify_wishlist_match() from public, anon, authenticated;
revoke all on function public.recall_targets(), public.store_recalls(text, text, integer, jsonb),
  public.my_vehicle_recalls(uuid), public.set_recall_dismissed(uuid, text, boolean),
  public.soft_delete_dyno_result(uuid), public.soft_delete_track_lap(uuid) from public, anon, authenticated;
grant execute on function public.recall_targets(), public.store_recalls(text, text, integer, jsonb) to service_role;
grant execute on function public.my_vehicle_recalls(uuid), public.set_recall_dismissed(uuid, text, boolean),
  public.soft_delete_dyno_result(uuid), public.soft_delete_track_lap(uuid) to authenticated;
revoke all on public.public_dyno_results, public.public_track_laps from anon, authenticated;
grant select on public.public_dyno_results, public.public_track_laps to anon, authenticated;
