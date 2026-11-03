-- Dynorex Phase 3: Build core.
-- Spec-delta validation, server-side spec estimates and cost totals, free-plan limits (atomic),
-- idempotent creates, mod status timestamps, wishlist, private media storage, server-only photo rows.

-- ---------------------------------------------------------------- spec deltas: typed contract
-- schema_version 1:
--   { "schema_version": 1,
--     "hp":            { "delta": number, "unit": "hp" | "kw" },
--     "torque":        { "delta": number, "unit": "lb-ft" | "nm" },
--     "weight":        { "delta": number, "unit": "lb" | "kg" },
--     "zero_to_sixty": { "delta": number, "unit": "s" } }
-- Every field is optional. Sign convention: positive = more (more power, more weight, slower 0-60).

create function public.valid_spec_deltas(d jsonb) returns boolean
language plpgsql immutable as $$
declare
  k text;
  v jsonb;
  units text[];
  lim numeric;
begin
  if jsonb_typeof(d) <> 'object' or (d ->> 'schema_version') is distinct from '1' then
    return false;
  end if;
  for k, v in select * from jsonb_each(d) loop
    continue when k = 'schema_version';
    case k
      when 'hp' then units := array['hp', 'kw']; lim := 2000;
      when 'torque' then units := array['lb-ft', 'nm']; lim := 2000;
      when 'weight' then units := array['lb', 'kg']; lim := 5000;
      when 'zero_to_sixty' then units := array['s']; lim := 30;
      else return false; -- unknown keys are rejected
    end case;
    if jsonb_typeof(v) <> 'object'
       or jsonb_typeof(v -> 'delta') <> 'number'
       or not ((v ->> 'unit') = any (units))
       or abs((v ->> 'delta')::numeric) > lim
       or exists (select 1 from jsonb_object_keys(v) x where x not in ('delta', 'unit')) then
      return false;
    end if;
  end loop;
  return true;
end $$;

alter table public.mods drop constraint mods_spec_deltas_check;
alter table public.mods add constraint mods_spec_deltas_valid check (public.valid_spec_deltas(spec_deltas));

-- ---------------------------------------------------------------- idempotent creates
-- The app generates client_ref once per draft; retries and offline replays can't create duplicates.

alter table public.vehicles add column client_ref uuid;
alter table public.mods add column client_ref uuid;
create unique index vehicles_client_ref_uq on public.vehicles (owner_id, client_ref) where client_ref is not null;
create unique index mods_client_ref_uq on public.mods (owner_id, client_ref) where client_ref is not null;
grant insert (client_ref) on public.vehicles to authenticated;
grant insert (client_ref) on public.mods to authenticated;

-- status_changed_at is server-maintained
create function public.touch_mod_status() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end $$;
create trigger mods_status_changed before update of status on public.mods
  for each row execute function public.touch_mod_status();

-- ---------------------------------------------------------------- photos and hero images: server-only writes
-- Clients upload into their own storage folder; the register-photo Edge Function checks the file
-- (type by magic bytes, size, no EXIF/GPS) and then records it. Clients can't write these directly.

revoke insert on public.mod_photos from authenticated;
revoke update (hero_path) on public.vehicles from authenticated;
revoke insert (hero_path) on public.vehicles from authenticated;
-- clients may still reorder / change role of their own photos, and soft-delete via function below

create function public.soft_delete_mod_photo(p_photo_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.mod_photos set deleted_at = now()
    where id = p_photo_id and owner_id = auth.uid() and deleted_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.soft_delete_mod_photo(uuid) from public, anon;
grant execute on function public.soft_delete_mod_photo(uuid) to authenticated;

-- Rate limit check usable by Edge Functions acting for a known user (service role only).
create function public.enforce_rate_limit_for(p_user uuid, p_action text, p_max integer, p_window_seconds integer)
returns void language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  select count(*) into n from app_private.rate_events
    where user_id = p_user and action = p_action
      and created_at > now() - make_interval(secs => p_window_seconds);
  if n >= p_max then
    raise exception 'rate_limited' using errcode = 'P0001', hint = format('retry_after=%s', p_window_seconds);
  end if;
  insert into app_private.rate_events (user_id, action) values (p_user, p_action);
end $$;
revoke all on function public.enforce_rate_limit_for(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.enforce_rate_limit_for(uuid, text, integer, integer) to service_role;

-- photo uploads are now limited in register-photo via enforce_rate_limit_for
drop trigger mod_photos_rate_limit on public.mod_photos;

-- ---------------------------------------------------------------- free-plan limits (atomic)
-- Free: 2 vehicles, 20 mods per vehicle (handoff spec 8.1). Dynorex+ (Phase 5) lifts them.
-- Until store billing exists, user_has_plus() only honours staff/tester overrides set by the service role.

create table app_private.plan_overrides (
  user_id uuid primary key references public.users (id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);

create function public.user_has_plus(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app_private.plan_overrides o where o.user_id = p_user)
$$;
revoke all on function public.user_has_plus(uuid) from public, anon, authenticated;

create function public.enforce_plan_limits() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if auth.uid() is null or public.user_has_plus(new.owner_id) then
    return new; -- trusted server path, or Dynorex+
  end if;
  -- serialise concurrent creates by the same owner so two requests can't both pass the count
  perform pg_advisory_xact_lock(hashtext(tg_table_name || ':' || new.owner_id::text));
  if tg_table_name = 'vehicles' then
    select count(*) into n from public.vehicles where owner_id = new.owner_id and deleted_at is null;
    if n >= 2 then
      raise exception 'plan_limit_vehicles' using errcode = 'P0001', hint = 'limit=2';
    end if;
  elsif tg_table_name = 'mods' then
    select count(*) into n from public.mods where vehicle_id = new.vehicle_id and deleted_at is null;
    if n >= 20 then
      raise exception 'plan_limit_mods' using errcode = 'P0001', hint = 'limit=20';
    end if;
  end if;
  return new;
end $$;

create trigger vehicles_plan_limit before insert on public.vehicles
  for each row execute function public.enforce_plan_limits();
create trigger mods_plan_limit before insert on public.mods
  for each row execute function public.enforce_plan_limits();

-- So the app can explain limits before someone hits them.
create function public.my_plan() returns table (plus boolean, vehicle_limit integer, mods_per_vehicle_limit integer)
language sql stable security definer set search_path = '' as $$
  select public.user_has_plus(auth.uid()),
         case when public.user_has_plus(auth.uid()) then null else 2 end,
         case when public.user_has_plus(auth.uid()) then null else 20 end
$$;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- ---------------------------------------------------------------- spec estimates (server-side)
-- Current estimate = baseline + deltas of COMPLETE mods only. Planned / in-progress deltas are
-- reported separately and never change the current estimate. Missing baseline -> 'unknown'.
-- Results that leave a sane range -> 'invalid' (shown as "check your numbers", never as a value).
-- Units: hp, lb-ft, lb, seconds. kW and Nm and kg deltas are converted. Rounding: hp, torque and
-- weight to whole numbers; 0-60 and lb/hp to one decimal; half away from zero.
-- Mirrors src/domain/specs.ts exactly (tests compare both).

create function public.delta_in_base_unit(d jsonb, field text) returns numeric
language sql immutable as $$
  select case
    when d -> field is null then 0
    when field = 'hp' and d -> field ->> 'unit' = 'kw' then (d -> field ->> 'delta')::numeric * 1.341022
    when field = 'torque' and d -> field ->> 'unit' = 'nm' then (d -> field ->> 'delta')::numeric * 0.737562
    when field = 'weight' and d -> field ->> 'unit' = 'kg' then (d -> field ->> 'delta')::numeric * 2.204623
    else (d -> field ->> 'delta')::numeric
  end
$$;

create function public.vehicle_spec_estimate(p_vehicle_id uuid)
returns table (
  hp numeric, hp_status text,
  torque_lbft numeric, torque_status text,
  weight_lb numeric, weight_status text,
  zero_to_sixty_s numeric, zero_to_sixty_status text,
  lb_per_hp numeric, lb_per_hp_status text,
  completed_mods_counted integer,
  pending_hp_delta numeric, pending_torque_delta numeric, pending_weight_delta numeric, pending_zero_to_sixty_delta numeric
)
language sql stable security invoker set search_path = '' as $$
  with v as (
    select * from public.vehicles where id = p_vehicle_id and deleted_at is null
  ),
  done as (
    select coalesce(sum(public.delta_in_base_unit(m.spec_deltas, 'hp')), 0) as hp,
           coalesce(sum(public.delta_in_base_unit(m.spec_deltas, 'torque')), 0) as tq,
           coalesce(sum(public.delta_in_base_unit(m.spec_deltas, 'weight')), 0) as wt,
           coalesce(sum(public.delta_in_base_unit(m.spec_deltas, 'zero_to_sixty')), 0) as zs,
           count(*)::integer as n
    from public.mods m
    where m.vehicle_id = p_vehicle_id and m.deleted_at is null and m.status = 'complete'
  ),
  pend as (
    select coalesce(sum(public.delta_in_base_unit(m.spec_deltas, 'hp')), 0) as hp,
           coalesce(sum(public.delta_in_base_unit(m.spec_deltas, 'torque')), 0) as tq,
           coalesce(sum(public.delta_in_base_unit(m.spec_deltas, 'weight')), 0) as wt,
           coalesce(sum(public.delta_in_base_unit(m.spec_deltas, 'zero_to_sixty')), 0) as zs
    from public.mods m
    where m.vehicle_id = p_vehicle_id and m.deleted_at is null and m.status in ('planned', 'in_progress')
  ),
  raw as (
    select v.baseline_hp + done.hp as hp,
           v.baseline_torque_lbft + done.tq as tq,
           v.baseline_weight_lb + done.wt as wt,
           v.baseline_zero_to_sixty_s + done.zs as zs,
           done.n, pend.hp as php, pend.tq as ptq, pend.wt as pwt, pend.zs as pzs
    from v, done, pend
  ),
  checked as (
    select *,
      case when hp is null then 'unknown' when hp <= 0 or hp >= 5000 then 'invalid' else 'estimate' end as hs,
      case when tq is null then 'unknown' when tq <= 0 or tq >= 5000 then 'invalid' else 'estimate' end as ts,
      case when wt is null then 'unknown' when wt <= 100 or wt >= 20000 then 'invalid' else 'estimate' end as ws,
      case when zs is null then 'unknown' when zs <= 0 or zs >= 60 then 'invalid' else 'estimate' end as zss
    from raw
  )
  select
    case when hs = 'estimate' then round(hp, 0) end, hs,
    case when ts = 'estimate' then round(tq, 0) end, ts,
    case when ws = 'estimate' then round(wt, 0) end, ws,
    case when zss = 'estimate' then round(zs, 1) end, zss,
    case when hs = 'estimate' and ws = 'estimate' then round(wt / hp, 1) end,
    case when hs = 'estimate' and ws = 'estimate' then 'estimate'
         when hs = 'invalid' or ws = 'invalid' then 'invalid' else 'unknown' end,
    n, round(php, 1), round(ptq, 1), round(pwt, 1), round(pzs, 2)
  from checked
$$;
revoke all on function public.vehicle_spec_estimate(uuid) from public, anon;
grant execute on function public.vehicle_spec_estimate(uuid) to authenticated;

-- ---------------------------------------------------------------- cost totals (server-side)
-- Money is integer minor units; currencies are never added together.
-- Spent = complete + in_progress (money already committed). Planned = planned.

create function public.vehicle_cost_summary(p_vehicle_id uuid)
returns table (currency text, category public.mod_category, spent_minor bigint, planned_minor bigint, mods integer)
language sql stable security invoker set search_path = '' as $$
  select m.currency::text, m.category,
         coalesce(sum(m.cost_minor) filter (where m.status in ('complete', 'in_progress')), 0)::bigint,
         coalesce(sum(m.cost_minor) filter (where m.status = 'planned'), 0)::bigint,
         count(*)::integer
  from public.mods m
  where m.vehicle_id = p_vehicle_id and m.deleted_at is null and m.cost_minor is not null
  group by m.currency, m.category
  order by m.currency, m.category
$$;
revoke all on function public.vehicle_cost_summary(uuid) from public, anon;
grant execute on function public.vehicle_cost_summary(uuid) to authenticated;

-- ---------------------------------------------------------------- wishlist

create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  vehicle_id uuid,
  name text not null check (char_length(name) between 1 and 120),
  -- https only, no credentials in the URL, sane length
  url text check (url is null or (url ~ '^https://[^/@\s]+(/[^\s]*)?$' and char_length(url) <= 2048)),
  price_minor bigint check (price_minor between 0 and 100000000000),
  currency char(3) check (currency in ('USD','CAD','GBP','EUR','AUD','NZD','JPY','MXN')),
  notes text check (char_length(notes) <= 1000),
  -- set only by trusted server code once an affiliate programme exists (never by clients)
  is_affiliate boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((price_minor is null) = (currency is null)),
  foreign key (vehicle_id, owner_id) references public.vehicles (id, owner_id) on delete cascade
);
create index wishlist_owner_idx on public.wishlist_items (owner_id, created_at desc) where deleted_at is null;
create trigger wishlist_updated_at before update on public.wishlist_items
  for each row execute function public.set_updated_at();

revoke all on public.wishlist_items from anon, authenticated;
grant select on public.wishlist_items to authenticated;
grant insert (vehicle_id, name, url, price_minor, currency, notes) on public.wishlist_items to authenticated;
grant update (vehicle_id, name, url, price_minor, currency, notes) on public.wishlist_items to authenticated;
alter table public.wishlist_items enable row level security;
create policy wishlist_owner_select on public.wishlist_items for select to authenticated
  using (owner_id = auth.uid() and deleted_at is null);
create policy wishlist_owner_insert on public.wishlist_items for insert to authenticated
  with check (owner_id = auth.uid());
create policy wishlist_owner_update on public.wishlist_items for update to authenticated
  using (owner_id = auth.uid() and deleted_at is null) with check (owner_id = auth.uid());

create function public.soft_delete_wishlist_item(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.wishlist_items set deleted_at = now() where id = p_id and owner_id = auth.uid() and deleted_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.soft_delete_wishlist_item(uuid) from public, anon;
grant execute on function public.soft_delete_wishlist_item(uuid) to authenticated;

-- ---------------------------------------------------------------- private media storage
-- Bucket is private: files are only reachable through short-lived signed URLs created for their owner.
-- Paths: <owner uuid>/<file uuid>.<ext>. 10 MB max, JPEG/PNG/WebP only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-media', 'vehicle-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "vehicle-media: owners upload to their own folder" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vehicle-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  );
create policy "vehicle-media: owners read their own files" on storage.objects for select to authenticated
  using (bucket_id = 'vehicle-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "vehicle-media: owners delete their own files" on storage.objects for delete to authenticated
  using (bucket_id = 'vehicle-media' and (storage.foldername(name))[1] = auth.uid()::text);
-- no update policy: files are immutable; replace = upload new + register + delete old
