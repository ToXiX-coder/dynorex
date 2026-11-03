-- D-64 (2026-10-17): the Build Record, folded in from the Buildmark prototype (buildmark/, research in
-- buildmark/research). A car's finished mods, service log and dyno results become a record a buyer can weigh:
--   1. history that can't be scrubbed: after a 24-hour grace period, edits keep the old version and removals stay
--      visible as "removed by the owner"
--   2. emissions status on engine / exhaust / electronics mods (CARB EO number, off-road only, back to the factory
--      part, not recorded)
--   3. shop confirmation: a Dynorex shop answers from its own account, or any shop through a one-time link.
--      Never asked for emissions-related work without a CARB EO number (it would be a dated admission against the
--      shop). Nothing is ever called "verified": a confirmation records who said what, and when.
--   4. the buyer's record (the service-history link, upgraded): every entry with its evidence, edits, removals and
--      confirmations, plus a "does this VIN match?" check that never shows the VIN
--   5. handing the record to the buyer: a code from the seller plus the VIN off the car. The buyer gets a new car in
--      their garage with read-only copies of the record (not photos, posts, costs or notes); the seller's car
--      becomes a read-only "sold" copy.
-- New enum values are only referenced inside function bodies (checked at run time).

alter type public.notification_category add value if not exists 'record_confirm_request';
alter type public.notification_category add value if not exists 'record_confirm_answer';

-- ================================================================ columns

alter table public.mods
  add column compliance text check (compliance in ('not_emissions_related', 'carb_eo', 'off_road_only', 'stock', 'unknown')),
  add column carb_eo text check (carb_eo ~ '^D-[0-9]{1,4}-[0-9]{1,3}$'),
  -- set when the row was copied from an earlier owner's record; such rows are read-only
  add column inherited_at timestamptz;
alter table public.mods add constraint mods_eo_needs_number
  check ((carb_eo is null or compliance = 'carb_eo') and (compliance is distinct from 'carb_eo' or carb_eo is not null));
-- engine and exhaust parts always touch emissions; electronics may (a tune) or may not (a stereo); the rest never do
alter table public.mods add constraint mods_compliance_fits
  check (compliance is null
         or (category in ('engine', 'exhaust') and compliance <> 'not_emissions_related')
         or category = 'electronics'
         or (category not in ('engine', 'exhaust', 'electronics') and compliance = 'not_emissions_related'));
grant insert (compliance, carb_eo), update (compliance, carb_eo) on public.mods to authenticated;

alter table public.maintenance_records add column inherited_at timestamptz;
alter table public.dyno_results add column inherited_at timestamptz;
alter table public.receipts
  -- SHA-256 of the file as uploaded (register-photo), so a swapped file would show
  add column sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  add column inherited_at timestamptz;

alter table public.vehicles
  -- sold through a transfer: the seller's copy is read-only from then on
  add column sold_at timestamptz,
  -- set when the car came from another owner through a transfer
  add column received_at timestamptz,
  add column previous_owners smallint not null default 0 check (previous_owners between 0 and 100),
  -- once a buyer's link or a transfer code exists, the VIN can't change (or a record could be moved to another car)
  add column vin_locked_at timestamptz;

-- ================================================================ guards: inherited rows and sold cars are read-only

create function app_private.record_entry_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v public.vehicles;
begin
  select * into v from public.vehicles where id = coalesce(new.vehicle_id, old.vehicle_id);
  if v.deleted_at is not null then return new; end if; -- the whole car is being deleted
  if tg_op = 'INSERT' then
    if v.sold_at is not null then raise exception 'vehicle_sold' using errcode = 'P0001'; end if;
    return new;
  end if;
  if old.inherited_at is not null then raise exception 'inherited_entry' using errcode = 'P0001'; end if;
  if v.sold_at is not null then raise exception 'vehicle_sold' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger mods_record_guard before insert or update on public.mods
  for each row execute function app_private.record_entry_guard();
create trigger maintenance_record_guard before insert or update on public.maintenance_records
  for each row execute function app_private.record_entry_guard();
create trigger dyno_results_record_guard before insert or update on public.dyno_results
  for each row execute function app_private.record_entry_guard();
create trigger receipts_record_guard before insert or update on public.receipts
  for each row execute function app_private.record_entry_guard();

-- A new receipt can't be added to an earlier owner's entry.
create function app_private.receipt_parent_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.inherited_at is null and (
       exists (select 1 from public.mods m where m.id = new.mod_id and m.inherited_at is not null)
       or exists (select 1 from public.maintenance_records r where r.id = new.maintenance_id and r.inherited_at is not null)) then
    raise exception 'inherited_entry' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger receipts_parent_guard before insert on public.receipts
  for each row execute function app_private.receipt_parent_guard();

create function app_private.vehicle_record_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.vin_locked_at is not null and new.vin is distinct from old.vin then
    raise exception 'vin_locked' using errcode = 'P0001';
  end if;
  if old.sold_at is not null and new.deleted_at is null
     and (new.year, new.make, new.model, new.trim_level, new.odometer, new.odometer_unit)
         is distinct from (old.year, old.make, old.model, old.trim_level, old.odometer, old.odometer_unit) then
    raise exception 'vehicle_sold' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger vehicles_record_guard before update on public.vehicles
  for each row execute function app_private.vehicle_record_guard();
revoke all on function app_private.record_entry_guard(), app_private.receipt_parent_guard(),
  app_private.vehicle_record_guard() from public, anon, authenticated;

-- Plan limits: an earlier owner's mods and a car you sold don't use up your free plan.
create or replace function public.enforce_plan_limits() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if auth.uid() is null or public.user_has_plus(new.owner_id) then
    return new; -- trusted server path, or Dynorex+
  end if;
  perform pg_advisory_xact_lock(hashtext(tg_table_name || ':' || new.owner_id::text));
  if tg_table_name = 'vehicles' then
    select count(*) into n from public.vehicles where owner_id = new.owner_id and deleted_at is null and sold_at is null;
    if n >= 2 then
      raise exception 'plan_limit_vehicles' using errcode = 'P0001', hint = 'limit=2';
    end if;
  elsif tg_table_name = 'mods' then
    select count(*) into n from public.mods
      where vehicle_id = new.vehicle_id and deleted_at is null and inherited_at is null;
    if n >= 20 then
      raise exception 'plan_limit_mods' using errcode = 'P0001', hint = 'limit=20';
    end if;
  end if;
  return new;
end $$;

-- ================================================================ 1. history that keeps its edits

create table public.record_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  entry_type text not null check (entry_type in ('mod', 'maintenance', 'dyno')),
  entry_id uuid not null,
  changed text[] not null,
  -- the record fields as they were before the edit (never costs or notes)
  snapshot jsonb not null,
  edited_at timestamptz not null default now(),
  inherited_at timestamptz
);
create index record_revisions_entry_idx on public.record_revisions (entry_type, entry_id, edited_at);
revoke all on public.record_revisions from anon, authenticated;
grant select on public.record_revisions to authenticated;
alter table public.record_revisions enable row level security;
create policy record_revisions_own on public.record_revisions for select to authenticated using (owner_id = auth.uid());

-- The fields a buyer relies on, per entry type. Costs, notes and plans are private and never tracked.
create function app_private.record_fields(p_type text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_type
    when 'mod' then array['name', 'category', 'brand', 'part_number', 'installed_on', 'installed_by', 'status',
                          'compliance', 'carb_eo']
    when 'maintenance' then array['title', 'done_on', 'odometer']
    else array['measured_on', 'dyno', 'correction', 'shop', 'whp', 'wtq', 'fuel'] end
$$;

-- Edits within 24 hours of an entry going on the record are free (typos); after that the old version is kept.
create function app_private.log_record_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_type text := case tg_table_name when 'mods' then 'mod' when 'maintenance_records' then 'maintenance' else 'dyno' end;
  v_on_record timestamptz;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  diff text[] := '{}';
  k text;
begin
  if new.deleted_at is not null then return new; end if; -- a removal shows as "removed", not as an edit
  if v_type = 'mod' then
    if (o ->> 'status') <> 'complete' then return new; end if; -- a plan isn't on the record yet
    v_on_record := (o ->> 'status_changed_at')::timestamptz;
  else
    v_on_record := (o ->> 'created_at')::timestamptz;
  end if;
  if v_on_record > now() - interval '24 hours' then return new; end if;
  foreach k in array app_private.record_fields(v_type) loop
    if (o -> k) is distinct from (n -> k) then diff := diff || k; end if;
  end loop;
  if cardinality(diff) = 0 then return new; end if;
  insert into public.record_revisions (owner_id, vehicle_id, entry_type, entry_id, changed, snapshot)
  select (n ->> 'owner_id')::uuid, (n ->> 'vehicle_id')::uuid, v_type, (n ->> 'id')::uuid, diff,
         jsonb_object_agg(f, o -> f)
  from unnest(app_private.record_fields(v_type)) f;
  return new;
end $$;
create trigger mods_record_revision after update on public.mods
  for each row execute function app_private.log_record_revision();
create trigger maintenance_record_revision after update on public.maintenance_records
  for each row execute function app_private.log_record_revision();
create trigger dyno_results_record_revision after update on public.dyno_results
  for each row execute function app_private.log_record_revision();
revoke all on function app_private.log_record_revision() from public, anon, authenticated;

create function app_private.entry_version(p_type text, p_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.record_revisions where entry_type = p_type and entry_id = p_id
$$;

-- ================================================================ 3. shop confirmation

create table public.record_confirmations (
  id uuid primary key default gen_random_uuid(),
  -- the car owner (so they can read and export it); the shop is named below
  owner_id uuid not null references public.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  entry_type text not null check (entry_type in ('mod', 'maintenance')),
  entry_id uuid not null,
  -- how many edits the entry had when the shop answered: a later edit means the shop hasn't seen the current text
  version integer not null,
  decision text not null check (decision in ('confirmed', 'declined')),
  via text not null check (via in ('shop_account', 'link')),
  business_id uuid references public.businesses (id) on delete set null,
  -- a Dynorex shop's page name, or what the person who opened the link typed (Dynorex doesn't check who they are)
  shop_name text not null check (char_length(shop_name) between 2 and 80 and shop_name !~ '[\x01-\x1F\x7F]'),
  shop_city text check (char_length(shop_city) <= 80 and shop_city !~ '[\x01-\x1F\x7F]'),
  odometer integer check (odometer between 0 and 2000000),
  note text check (char_length(note) <= 280 and note !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  at timestamptz not null default now(),
  inherited_at timestamptz
);
create index record_confirmations_entry_idx on public.record_confirmations (entry_type, entry_id, at desc);
revoke all on public.record_confirmations from anon, authenticated;
grant select on public.record_confirmations to authenticated;
alter table public.record_confirmations enable row level security;
create policy record_confirmations_own on public.record_confirmations for select to authenticated
  using (owner_id = auth.uid());

create table app_private.confirm_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  entry_type text not null,
  entry_id uuid not null,
  version integer not null,
  -- a Dynorex shop (answers in the app) or null with a token (a link anyone can open once)
  business_id uuid references public.businesses (id) on delete cascade,
  token text unique check (token ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  closed_at timestamptz,
  check ((business_id is null) <> (token is null))
);
create index confirm_requests_business_idx on app_private.confirm_requests (business_id) where closed_at is null;
create index confirm_requests_entry_idx on app_private.confirm_requests (entry_type, entry_id) where closed_at is null;

-- Why a shop can't be asked about this entry, or null when it can. Mirrors confirmBlock in src/domain/record.ts.
create function app_private.record_confirm_block(p_type text, p_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare m public.mods; r public.maintenance_records; v_vehicle uuid;
begin
  if p_type = 'mod' then
    select * into m from public.mods where id = p_id;
    if not found or m.deleted_at is not null then return 'not_found'; end if;
    if m.inherited_at is not null then return 'inherited_entry'; end if;
    if m.status <> 'complete' then return 'not_finished'; end if;
    if m.category in ('engine', 'exhaust', 'electronics')
       and coalesce(m.compliance, 'unknown') not in ('carb_eo', 'stock', 'not_emissions_related') then
      return 'emissions';
    end if;
    v_vehicle := m.vehicle_id;
  elsif p_type = 'maintenance' then
    select * into r from public.maintenance_records where id = p_id;
    if not found or r.deleted_at is not null then return 'not_found'; end if;
    if r.inherited_at is not null then return 'inherited_entry'; end if;
    v_vehicle := r.vehicle_id;
  else
    return 'not_found';
  end if;
  if exists (select 1 from public.vehicles v where v.id = v_vehicle and v.sold_at is not null) then return 'vehicle_sold'; end if;
  if exists (select 1 from public.record_confirmations c
             where c.entry_type = p_type and c.entry_id = p_id and c.decision = 'confirmed'
               and c.version = app_private.entry_version(p_type, p_id)) then
    return 'already_confirmed';
  end if;
  return null;
end $$;

create function app_private.my_entry_vehicle(p_type text, p_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select m.vehicle_id from public.mods m where p_type = 'mod' and m.id = p_id and m.owner_id = auth.uid()),
    (select r.vehicle_id from public.maintenance_records r
      where p_type = 'maintenance' and r.id = p_id and r.owner_id = auth.uid()))
$$;

create function app_private.entry_title(p_type text, p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select m.name from public.mods m where p_type = 'mod' and m.id = p_id),
    (select r.title from public.maintenance_records r where p_type = 'maintenance' and r.id = p_id))
$$;

-- Ask a shop to confirm. With p_business: a Dynorex shop, told in the app; returns the request id. Without: a
-- one-time link; returns its token (the same one while it's open and the entry hasn't changed).
create function public.request_record_confirmation(p_type text, p_id uuid, p_business uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_vehicle uuid := app_private.my_entry_vehicle(p_type, p_id);
  v_block text;
  v_version integer;
  v_token text;
  v_req uuid;
  b public.businesses;
begin
  if auth.uid() is null then raise exception 'sign_in_required' using errcode = 'P0001'; end if;
  if v_vehicle is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_block := app_private.record_confirm_block(p_type, p_id);
  if v_block is not null then raise exception '%', v_block using errcode = 'P0001'; end if;
  v_version := app_private.entry_version(p_type, p_id);

  if p_business is null then
    select token into v_token from app_private.confirm_requests
    where entry_type = p_type and entry_id = p_id and token is not null and closed_at is null
      and expires_at > now() and version = v_version;
    if v_token is not null then return v_token; end if;
    perform public.enforce_rate_limit('record_confirm', 30, 86400);
    update app_private.confirm_requests set closed_at = now()
      where entry_type = p_type and entry_id = p_id and token is not null and closed_at is null;
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into app_private.confirm_requests (owner_id, vehicle_id, entry_type, entry_id, version, token)
      values (auth.uid(), v_vehicle, p_type, p_id, v_version, v_token);
    return v_token;
  end if;

  select * into b from public.businesses
    where id = p_business and deleted_at is null and hidden_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if b.owner_id = auth.uid() then raise exception 'own_business' using errcode = 'P0001'; end if;
  if public.is_blocked_with(b.owner_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.enforce_rate_limit('record_confirm', 30, 86400);
  update app_private.confirm_requests set closed_at = now()
    where entry_type = p_type and entry_id = p_id and business_id is not null and closed_at is null;
  insert into app_private.confirm_requests (owner_id, vehicle_id, entry_type, entry_id, version, business_id)
    values (auth.uid(), v_vehicle, p_type, p_id, v_version, p_business) returning id into v_req;
  if public.notification_enabled(b.owner_id, 'record_confirm_request') then
    insert into public.notifications (recipient_id, actor_id, category, entity_type, entity_id, title, body)
    values (b.owner_id, auth.uid(), 'record_confirm_request', 'business', b.id::text, 'Confirm a job',
            left(format('A customer asked %s to confirm: %s.', b.name, app_private.entry_title(p_type, p_id)), 200));
  end if;
  return v_req::text;
end $$;

-- Open requests for one of your cars, to show "waiting on" and to copy a link again.
create function public.my_confirm_requests(p_vehicle uuid)
returns table (entry_type text, entry_id uuid, business_name text, token text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.entry_type, r.entry_id, b.name, r.token, r.expires_at
  from app_private.confirm_requests r
  left join public.businesses b on b.id = r.business_id
  where r.vehicle_id = p_vehicle and r.owner_id = auth.uid() and r.closed_at is null and r.expires_at > now()
    and r.version = app_private.entry_version(r.entry_type, r.entry_id)
$$;

-- What a shop is shown about a job: the car and the work, never the owner's VIN, costs, notes or name.
create function app_private.confirm_job(r app_private.confirm_requests) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'car', (select jsonb_build_object('year', v.year, 'make', v.make, 'model', v.model, 'trim', v.trim_level)
            from public.vehicles v where v.id = r.vehicle_id),
    'entry_type', r.entry_type,
    'entry', case r.entry_type
      when 'mod' then (select jsonb_build_object('title', m.name, 'category', m.category, 'brand', m.brand,
                         'part_number', m.part_number, 'carb_eo', m.carb_eo, 'compliance', m.compliance,
                         'installed_by', m.installed_by, 'date', m.installed_on)
                       from public.mods m where m.id = r.entry_id)
      else (select jsonb_build_object('title', x.title, 'date', x.done_on, 'odometer', x.odometer)
            from public.maintenance_records x where x.id = r.entry_id) end)
$$;

create function app_private.confirm_status(r app_private.confirm_requests) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when r.closed_at is not null then 'closed'
    when r.expires_at <= now() then 'expired'
    when r.version <> app_private.entry_version(r.entry_type, r.entry_id)
      or exists (select 1 from public.vehicles v where v.id = r.vehicle_id and (v.sold_at is not null or v.deleted_at is not null))
      or not exists (select 1 from public.mods m where r.entry_type = 'mod' and m.id = r.entry_id and m.deleted_at is null
                     union all
                     select 1 from public.maintenance_records x
                     where r.entry_type = 'maintenance' and x.id = r.entry_id and x.deleted_at is null) then 'changed'
    else 'open' end
$$;

-- Records the shop's answer and tells the owner. Returns a status, never raises for a stale request.
create function app_private.record_confirm_answer(r app_private.confirm_requests, p_decision text, p_via text,
  p_shop_name text, p_shop_city text, p_odometer integer, p_note text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_status text := app_private.confirm_status(r);
begin
  if v_status <> 'open' then return v_status; end if;
  if p_decision not in ('confirmed', 'declined') then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  if p_decision = 'confirmed' and app_private.record_confirm_block(r.entry_type, r.entry_id) is not null then
    return 'not_allowed';
  end if;
  insert into public.record_confirmations (owner_id, vehicle_id, entry_type, entry_id, version, decision, via, business_id,
                                           shop_name, shop_city, odometer, note)
  values (r.owner_id, r.vehicle_id, r.entry_type, r.entry_id, r.version, p_decision, p_via, r.business_id,
          btrim(p_shop_name), nullif(btrim(coalesce(p_shop_city, '')), ''), p_odometer, nullif(btrim(coalesce(p_note, '')), ''));
  update app_private.confirm_requests set closed_at = now() where id = r.id;
  if public.notification_enabled(r.owner_id, 'record_confirm_answer') then
    insert into public.notifications (recipient_id, category, entity_type, entity_id, title, body)
    values (r.owner_id, 'record_confirm_answer', 'vehicle', r.vehicle_id::text,
            case p_decision when 'confirmed' then 'A shop confirmed your work' else 'A shop declined to confirm' end,
            left(format('%s answered about %s.', btrim(p_shop_name), app_private.entry_title(r.entry_type, r.entry_id)), 200));
  end if;
  return 'ok';
end $$;

-- A Dynorex shop's inbox: jobs customers asked it to confirm.
create function public.shop_confirm_requests()
returns table (request_id uuid, requested_at timestamptz, customer text, job jsonb, status text)
language sql stable security definer set search_path = '' as $$
  select r.id, r.created_at, u.username, app_private.confirm_job(r), app_private.confirm_status(r)
  from app_private.confirm_requests r
  join public.businesses b on b.id = r.business_id and b.owner_id = auth.uid() and b.deleted_at is null
  left join public.users u on u.id = r.owner_id and u.deleted_at is null
  where r.closed_at is null and r.expires_at > now() and not public.is_blocked_with(r.owner_id)
  order by r.created_at desc
$$;

create function public.answer_record_confirmation(p_request uuid, p_decision text, p_odometer integer, p_note text)
returns text
language plpgsql security definer set search_path = '' as $$
declare r app_private.confirm_requests; b public.businesses;
begin
  select * into r from app_private.confirm_requests where id = p_request for update;
  if not found then return 'not_found'; end if;
  select * into b from public.businesses where id = r.business_id and owner_id = auth.uid() and deleted_at is null;
  if not found then return 'not_found'; end if;
  return app_private.record_confirm_answer(r, p_decision, 'shop_account', b.name, b.location_text, p_odometer, p_note);
end $$;

-- The one-time link: what the shop sees, and its answer. No account needed.
create function public.confirm_link_view(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r app_private.confirm_requests;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('status', 'not_found'); end if;
  select * into r from app_private.confirm_requests where token = p_token;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  return app_private.confirm_job(r) || jsonb_build_object('status', app_private.confirm_status(r));
end $$;

create function public.confirm_by_link(p_token text, p_decision text, p_shop_name text, p_shop_city text,
  p_odometer integer, p_note text) returns text
language plpgsql security definer set search_path = '' as $$
declare r app_private.confirm_requests;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return 'not_found'; end if;
  select * into r from app_private.confirm_requests where token = p_token for update;
  if not found then return 'not_found'; end if;
  if char_length(btrim(coalesce(p_shop_name, ''))) < 2 then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  return app_private.record_confirm_answer(r, p_decision, 'link', p_shop_name, p_shop_city, p_odometer, p_note);
end $$;

-- ================================================================ 4. the record (owner view and buyer view)

-- Every entry on a car's record. Mods are on it once finished (or once a finished mod was reopened); anything
-- removed more than 24 hours after going on the record stays, marked removed. Never costs, notes or photos.
create function app_private.record_json(p_vehicle uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with conf as (
    select distinct on (c.entry_type, c.entry_id) c.*
    from public.record_confirmations c where c.vehicle_id = p_vehicle
    order by c.entry_type, c.entry_id, c.at desc
  ), revs as (
    select x.entry_type, x.entry_id, count(*)::integer as version,
           jsonb_agg(jsonb_build_object('at', x.edited_at, 'changed', x.changed) order by x.edited_at) as list
    from public.record_revisions x where x.vehicle_id = p_vehicle group by x.entry_type, x.entry_id
  ), files as (
    select coalesce(f.mod_id, f.maintenance_id) as entry_id,
           jsonb_agg(jsonb_build_object('uploaded_at', f.created_at, 'sha256', f.sha256) order by f.created_at) as list
    from public.receipts f where f.vehicle_id = p_vehicle and f.deleted_at is null
    group by coalesce(f.mod_id, f.maintenance_id)
  ), entries as (
    select 'mod' as type, m.id, m.name as title, m.category::text as category, m.brand, m.part_number, m.compliance,
           m.carb_eo, m.installed_by, coalesce(m.installed_on, m.status_changed_at::date) as date, null::integer as odometer,
           null::numeric as whp, null::numeric as wtq, null::text as dyno, null::text as correction,
           m.created_at as logged_at, m.deleted_at as removed_at, m.status <> 'complete' as reopened,
           m.inherited_at, false as has_sheet
    from public.mods m
    where m.vehicle_id = p_vehicle
      and (m.status = 'complete' or exists (select 1 from public.record_revisions x
                                            where x.entry_type = 'mod' and x.entry_id = m.id))
      and (m.deleted_at is null or (m.status = 'complete' and m.deleted_at > m.status_changed_at + interval '24 hours'))
    union all
    select 'maintenance', r.id, r.title, null, null, null, null, null, null, r.done_on, r.odometer, null, null, null, null,
           r.created_at, r.deleted_at, false, r.inherited_at, false
    from public.maintenance_records r
    where r.vehicle_id = p_vehicle and (r.deleted_at is null or r.deleted_at > r.created_at + interval '24 hours')
    union all
    select 'dyno', d.id, 'Dyno run', null, null, null, null, null, d.shop, d.measured_on, null, d.whp, d.wtq,
           d.dyno::text, d.correction::text, d.created_at, d.deleted_at, false, d.inherited_at, d.sheet_path is not null
    from public.dyno_results d
    where d.vehicle_id = p_vehicle and (d.deleted_at is null or d.deleted_at > d.created_at + interval '24 hours')
  )
  select jsonb_build_object(
    'car', jsonb_build_object('year', v.year, 'make', v.make, 'model', v.model, 'trim', v.trim_level),
    'odometer', v.odometer, 'odometer_unit', v.odometer_unit,
    'owners', v.previous_owners + 1,
    'owner_since', coalesce(v.received_at, v.created_at),
    'sold_at', v.sold_at,
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
          'type', e.type, 'id', e.id, 'title', e.title, 'category', e.category, 'brand', e.brand,
          'part_number', e.part_number, 'compliance', e.compliance, 'carb_eo', e.carb_eo,
          'installed_by', e.installed_by, 'date', e.date, 'odometer', e.odometer, 'whp', e.whp, 'wtq', e.wtq,
          'dyno', e.dyno, 'correction', e.correction, 'logged_at', e.logged_at, 'removed_at', e.removed_at,
          'reopened', e.reopened, 'earlier_owner', e.inherited_at is not null, 'has_sheet', e.has_sheet,
          'version', coalesce(rv.version, 0), 'revisions', coalesce(rv.list, '[]'::jsonb),
          'receipts', coalesce(fl.list, '[]'::jsonb),
          'confirmation', case when c.id is null then null else jsonb_build_object(
            'decision', c.decision, 'via', c.via, 'shop_name', c.shop_name, 'shop_city', c.shop_city,
            'odometer', c.odometer, 'note', c.note, 'at', c.at, 'version', c.version) end)
        order by e.date desc, e.logged_at desc)
      from entries e
      left join revs rv on rv.entry_type = e.type and rv.entry_id = e.id
      left join files fl on fl.entry_id = e.id
      left join conf c on c.entry_type = e.type and c.entry_id = e.id), '[]'::jsonb))
  from public.vehicles v where v.id = p_vehicle
$$;

-- Your own car's record (a car you sold too: your read-only copy).
create function public.my_build_record(p_vehicle uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select app_private.record_json(v.id) from public.vehicles v
  where v.id = p_vehicle and v.owner_id = auth.uid() and v.deleted_at is null
$$;

-- What a buyer's link shows. Same token as the service-history link (D-61); never the VIN or who owns it.
create function public.build_record(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s app_private.history_shares;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into s from app_private.history_shares where token = p_token and expires_at > now();
  if not found then return null; end if;
  if not exists (select 1 from public.vehicles v where v.id = s.vehicle_id and v.owner_id = s.owner_id
                 and v.deleted_at is null and v.hidden_at is null and v.sold_at is null) then
    return null;
  end if;
  return app_private.record_json(s.vehicle_id) || jsonb_build_object('expires_at', s.expires_at);
end $$;

-- A buyer types the VIN off the car and hears only "match" or "no match". 10 checks an hour per link.
create table app_private.record_vin_checks (
  token text not null,
  at timestamptz not null default now()
);
create index record_vin_checks_idx on app_private.record_vin_checks (token, at);

create function public.check_record_vin(p_token text, p_vin text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare s app_private.history_shares; v_vin text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return 'not_found'; end if;
  select * into s from app_private.history_shares where token = p_token and expires_at > now();
  if not found then return 'not_found'; end if;
  delete from app_private.record_vin_checks where at < now() - interval '1 day';
  if (select count(*) from app_private.record_vin_checks where token = p_token and at > now() - interval '1 hour') >= 10 then
    return 'too_many';
  end if;
  insert into app_private.record_vin_checks (token) values (p_token);
  select vin into v_vin from public.vehicles where id = s.vehicle_id and owner_id = s.owner_id and deleted_at is null;
  if v_vin is null then return 'no_vin_on_record'; end if;
  return case when v_vin = upper(regexp_replace(coalesce(p_vin, ''), '[^A-Za-z0-9]', '', 'g')) then 'match' else 'no_match' end;
end $$;

-- Making a buyer's link now also locks the VIN.
create or replace function public.create_history_share(p_vehicle uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if auth.uid() is null then raise exception 'sign_in_required' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.vehicles v where v.id = p_vehicle and v.owner_id = auth.uid()
                 and v.deleted_at is null and v.sold_at is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.enforce_rate_limit('history_share', 10, 86400);
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into app_private.history_shares (vehicle_id, owner_id, token) values (p_vehicle, auth.uid(), v_token)
    on conflict (vehicle_id) do update set token = excluded.token, owner_id = excluded.owner_id,
      created_at = now(), expires_at = now() + interval '90 days';
  update public.vehicles set vin_locked_at = coalesce(vin_locked_at, now()) where id = p_vehicle and vin is not null;
  return v_token;
end $$;

-- ================================================================ 5. handing the record to the buyer

create table app_private.vehicle_transfers (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  owner_id uuid not null references public.users (id) on delete cascade,
  code_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  failed_attempts smallint not null default 0,
  closed_at timestamptz,
  claimed_by uuid references public.users (id) on delete set null,
  new_vehicle_id uuid
);

create function app_private.transfer_hash(p_code text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to('dynorex-transfer:' || p_code, 'UTF8')), 'hex')
$$;

-- An 8-character code (no look-alikes), shown once. The buyer also needs the VIN off the car.
create function public.start_vehicle_transfer(p_vehicle uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8'));
  v_code text := '';
  v public.vehicles;
begin
  if auth.uid() is null then raise exception 'sign_in_required' using errcode = 'P0001'; end if;
  select * into v from public.vehicles where id = p_vehicle and owner_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v.sold_at is not null then raise exception 'vehicle_sold' using errcode = 'P0001'; end if;
  if v.vin is null then raise exception 'vin_required' using errcode = 'P0001'; end if;
  perform public.enforce_rate_limit('vehicle_transfer', 10, 86400);
  for i in 0..7 loop
    v_code := v_code || substr(alphabet, get_byte(b, i) % 31 + 1, 1);
  end loop;
  v_code := substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4);
  update app_private.vehicle_transfers set closed_at = now() where vehicle_id = p_vehicle and closed_at is null;
  insert into app_private.vehicle_transfers (vehicle_id, owner_id, code_hash)
    values (p_vehicle, auth.uid(), app_private.transfer_hash(v_code));
  update public.vehicles set vin_locked_at = coalesce(vin_locked_at, now()) where id = p_vehicle;
  return v_code;
end $$;

create function public.cancel_vehicle_transfer(p_vehicle uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update app_private.vehicle_transfers set closed_at = now()
    where vehicle_id = p_vehicle and owner_id = auth.uid() and closed_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;

create function public.my_vehicle_transfer(p_vehicle uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select t.expires_at from app_private.vehicle_transfers t
  where t.vehicle_id = p_vehicle and t.owner_id = auth.uid() and t.closed_at is null and t.expires_at > now()
$$;

-- Copies one entry type of the seller's record into the buyer's new car, with its receipts' details, edits and
-- shop confirmations. Copies are marked inherited and are read-only.
create function app_private.copy_record(p_from uuid, p_to uuid, p_owner uuid, p_sold timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.mods;
  r public.maintenance_records;
  d public.dyno_results;
  v_new uuid;
  v_type text;
  v_old uuid;
begin
  for m in select * from public.mods x where x.vehicle_id = p_from
             and (x.status = 'complete' or exists (select 1 from public.record_revisions y
                                                   where y.entry_type = 'mod' and y.entry_id = x.id)) loop
    insert into public.mods (owner_id, vehicle_id, name, category, brand, part_number, status, spec_deltas, installed_on,
                             installed_by, compliance, carb_eo, status_changed_at, created_at, deleted_at, inherited_at)
    values (p_owner, p_to, m.name, m.category, m.brand, m.part_number, m.status, m.spec_deltas, m.installed_on,
            m.installed_by, m.compliance, m.carb_eo, m.status_changed_at, m.created_at, m.deleted_at,
            coalesce(m.inherited_at, p_sold))
    returning id into v_new;
    insert into public.receipts (owner_id, vehicle_id, mod_id, storage_path, mime, bytes, width, height, created_at, sha256, inherited_at)
      select p_owner, p_to, v_new, f.storage_path, f.mime, f.bytes, f.width, f.height, f.created_at, f.sha256,
             coalesce(f.inherited_at, p_sold)
      from public.receipts f where f.mod_id = m.id and f.deleted_at is null;
    v_type := 'mod'; v_old := m.id;
    insert into public.record_revisions (owner_id, vehicle_id, entry_type, entry_id, changed, snapshot, edited_at, inherited_at)
      select p_owner, p_to, v_type, v_new, y.changed, y.snapshot, y.edited_at, coalesce(y.inherited_at, p_sold)
      from public.record_revisions y where y.entry_type = v_type and y.entry_id = v_old;
    insert into public.record_confirmations (owner_id, vehicle_id, entry_type, entry_id, version, decision, via, business_id,
                                             shop_name, shop_city, odometer, note, at, inherited_at)
      select p_owner, p_to, v_type, v_new, c.version, c.decision, c.via, c.business_id, c.shop_name, c.shop_city,
             c.odometer, c.note, c.at, coalesce(c.inherited_at, p_sold)
      from public.record_confirmations c where c.entry_type = v_type and c.entry_id = v_old;
  end loop;

  for r in select * from public.maintenance_records x where x.vehicle_id = p_from loop
    insert into public.maintenance_records (owner_id, vehicle_id, title, done_on, odometer, created_at, deleted_at, inherited_at)
    values (p_owner, p_to, r.title, r.done_on, r.odometer, r.created_at, r.deleted_at, coalesce(r.inherited_at, p_sold))
    returning id into v_new;
    insert into public.receipts (owner_id, vehicle_id, maintenance_id, storage_path, mime, bytes, width, height, created_at, sha256, inherited_at)
      select p_owner, p_to, v_new, f.storage_path, f.mime, f.bytes, f.width, f.height, f.created_at, f.sha256,
             coalesce(f.inherited_at, p_sold)
      from public.receipts f where f.maintenance_id = r.id and f.deleted_at is null;
    v_type := 'maintenance'; v_old := r.id;
    insert into public.record_revisions (owner_id, vehicle_id, entry_type, entry_id, changed, snapshot, edited_at, inherited_at)
      select p_owner, p_to, v_type, v_new, y.changed, y.snapshot, y.edited_at, coalesce(y.inherited_at, p_sold)
      from public.record_revisions y where y.entry_type = v_type and y.entry_id = v_old;
    insert into public.record_confirmations (owner_id, vehicle_id, entry_type, entry_id, version, decision, via, business_id,
                                             shop_name, shop_city, odometer, note, at, inherited_at)
      select p_owner, p_to, v_type, v_new, c.version, c.decision, c.via, c.business_id, c.shop_name, c.shop_city,
             c.odometer, c.note, c.at, coalesce(c.inherited_at, p_sold)
      from public.record_confirmations c where c.entry_type = v_type and c.entry_id = v_old;
  end loop;

  for d in select * from public.dyno_results x where x.vehicle_id = p_from loop
    insert into public.dyno_results (owner_id, vehicle_id, measured_on, dyno, correction, shop, whp, wtq, fuel, sheet_path,
                                     created_at, deleted_at, inherited_at)
    values (p_owner, p_to, d.measured_on, d.dyno, d.correction, d.shop, d.whp, d.wtq, d.fuel, d.sheet_path, d.created_at,
            d.deleted_at, coalesce(d.inherited_at, p_sold))
    returning id into v_new;
    insert into public.record_revisions (owner_id, vehicle_id, entry_type, entry_id, changed, snapshot, edited_at, inherited_at)
      select p_owner, p_to, 'dyno', v_new, y.changed, y.snapshot, y.edited_at, coalesce(y.inherited_at, p_sold)
      from public.record_revisions y where y.entry_type = 'dyno' and y.entry_id = d.id;
  end loop;
end $$;
revoke all on function app_private.copy_record(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;

-- Returns {status}, never raises for a wrong code or VIN, so failed attempts are counted (a raise would undo them).
create function public.claim_vehicle_transfer(p_code text, p_vin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t app_private.vehicle_transfers;
  v public.vehicles;
  v_me uuid := auth.uid();
  v_now timestamptz := now();
  v_raw text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_code text := substr(v_raw, 1, 4) || '-' || substr(v_raw, 5);
  v_new uuid;
begin
  if v_me is null then raise exception 'sign_in_required' using errcode = 'P0001'; end if;
  begin
    perform public.enforce_rate_limit('vehicle_claim', 10, 3600);
  exception when others then
    return jsonb_build_object('status', 'rate_limited');
  end;
  select * into t from app_private.vehicle_transfers
    where code_hash = app_private.transfer_hash(v_code) and closed_at is null and expires_at > v_now for update;
  if not found then return jsonb_build_object('status', 'code_invalid'); end if;
  select * into v from public.vehicles where id = t.vehicle_id and deleted_at is null and sold_at is null;
  if not found then return jsonb_build_object('status', 'code_invalid'); end if;
  if v.owner_id = v_me then return jsonb_build_object('status', 'own_car'); end if;
  if v.vin is distinct from upper(regexp_replace(coalesce(p_vin, ''), '[^A-Za-z0-9]', '', 'g')) then
    update app_private.vehicle_transfers set failed_attempts = failed_attempts + 1,
      closed_at = case when failed_attempts + 1 >= 5 then v_now end where id = t.id;
    return jsonb_build_object('status', 'vin_mismatch');
  end if;

  -- the buyer's new car (their own plan limit applies)
  begin
    insert into public.vehicles (owner_id, year, make, model, trim_level, vin, odometer, odometer_unit, visibility,
                                 previous_owners, received_at, vin_locked_at)
    values (v_me, v.year, v.make, v.model, v.trim_level, v.vin, v.odometer, v.odometer_unit, 'private',
            least(v.previous_owners + 1, 100), v_now, v_now)
    returning id into v_new;
  exception when others then
    return jsonb_build_object('status', case when sqlerrm like '%plan_limit_vehicles%' then 'plan_limit' else 'failed' end);
  end;
  -- copies don't count against the buyer's rate or mod limits: run them as a trusted server path
  perform set_config('request.jwt.claim.sub', '', true);
  perform app_private.copy_record(v.id, v_new, v_me, v_now);
  perform set_config('request.jwt.claim.sub', v_me::text, true);

  update public.vehicles set sold_at = v_now where id = v.id;
  update app_private.vehicle_transfers set closed_at = v_now, claimed_by = v_me, new_vehicle_id = v_new where id = t.id;
  delete from app_private.history_shares where vehicle_id = v.id;
  update app_private.confirm_requests set closed_at = v_now where vehicle_id = v.id and closed_at is null;
  return jsonb_build_object('status', 'ok', 'vehicle_id', v_new);
end $$;

-- ================================================================ grants

revoke all on function
  app_private.record_fields(text), app_private.entry_version(text, uuid), app_private.record_confirm_block(text, uuid),
  app_private.my_entry_vehicle(text, uuid), app_private.entry_title(text, uuid),
  app_private.confirm_job(app_private.confirm_requests), app_private.confirm_status(app_private.confirm_requests),
  app_private.record_confirm_answer(app_private.confirm_requests, text, text, text, text, integer, text),
  app_private.record_json(uuid), app_private.transfer_hash(text)
  from public, anon, authenticated;
revoke all on function
  public.request_record_confirmation(text, uuid, uuid), public.my_confirm_requests(uuid),
  public.shop_confirm_requests(), public.answer_record_confirmation(uuid, text, integer, text),
  public.confirm_link_view(text), public.confirm_by_link(text, text, text, text, integer, text),
  public.my_build_record(uuid), public.build_record(text), public.check_record_vin(text, text),
  public.start_vehicle_transfer(uuid), public.cancel_vehicle_transfer(uuid), public.my_vehicle_transfer(uuid),
  public.claim_vehicle_transfer(text, text)
  from public, anon, authenticated;
grant execute on function
  public.request_record_confirmation(text, uuid, uuid), public.my_confirm_requests(uuid),
  public.shop_confirm_requests(), public.answer_record_confirmation(uuid, text, integer, text),
  public.my_build_record(uuid), public.start_vehicle_transfer(uuid), public.cancel_vehicle_transfer(uuid),
  public.my_vehicle_transfer(uuid), public.claim_vehicle_transfer(text, text)
  to authenticated;
-- the only new functions open without an account: the buyer's record, its VIN check and the shop's link
grant execute on function
  public.build_record(text), public.check_record_vin(text, text),
  public.confirm_link_view(text), public.confirm_by_link(text, text, text, text, integer, text)
  to anon, authenticated;
