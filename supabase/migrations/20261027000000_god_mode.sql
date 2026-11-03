-- D-68 (owner, 2026-10-25, "god mode" round): mileage at install on mods, a private build budget per car, a
-- gallery photo as the car's cover, and the rate limit for receipt scanning.

-- ================================================================ 1. mileage at install (mods)

alter table public.mods
  add column installed_odometer integer check (installed_odometer between 0 and 2000000);
grant insert (installed_odometer), update (installed_odometer) on public.mods to authenticated;

-- A reading is a record field: changing it more than a day after the mod went on the record keeps the old one.
create or replace function app_private.record_fields(p_type text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_type
    when 'mod' then array['name', 'category', 'brand', 'part_number', 'installed_on', 'installed_by', 'status',
                          'compliance', 'carb_eo', 'installed_odometer']
    when 'maintenance' then array['title', 'done_on', 'odometer']
    else array['measured_on', 'dyno', 'correction', 'shop', 'whp', 'wtq', 'fuel'] end
$$;

-- A reading moves the car's odometer up, never down, like the service log (D-61).
create function app_private.bump_vehicle_odometer_from_mod() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.installed_odometer is not null and new.deleted_at is null and new.inherited_at is null then
    update public.vehicles v set odometer = new.installed_odometer
      where v.id = new.vehicle_id and v.owner_id = new.owner_id and v.deleted_at is null and v.sold_at is null
        and v.odometer_unit = 'mi' and (v.odometer is null or v.odometer < new.installed_odometer);
  end if;
  return new;
end $$;
create trigger mods_bump_odometer after insert or update of installed_odometer on public.mods
  for each row execute function app_private.bump_vehicle_odometer_from_mod();
revoke all on function app_private.bump_vehicle_odometer_from_mod() from public, anon, authenticated;

-- A shop asked to confirm a mod sees its reading too.
create or replace function app_private.confirm_job(r app_private.confirm_requests) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'car', (select jsonb_build_object('year', v.year, 'make', v.make, 'model', v.model, 'trim', v.trim_level)
            from public.vehicles v where v.id = r.vehicle_id),
    'entry_type', r.entry_type,
    'entry', case r.entry_type
      when 'mod' then (select jsonb_build_object('title', m.name, 'category', m.category, 'brand', m.brand,
                         'part_number', m.part_number, 'carb_eo', m.carb_eo, 'compliance', m.compliance,
                         'installed_by', m.installed_by, 'date', m.installed_on, 'odometer', m.installed_odometer)
                       from public.mods m where m.id = r.entry_id)
      else (select jsonb_build_object('title', x.title, 'date', x.done_on, 'odometer', x.odometer)
            from public.maintenance_records x where x.id = r.entry_id) end)
$$;

-- The record (owner and buyer views) carries a mod's reading in the same `odometer` field as service entries, so
-- the backwards-mileage flag covers mods too. Otherwise unchanged from 20261026000000_build_record.sql.
create or replace function app_private.record_json(p_vehicle uuid) returns jsonb
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
           m.carb_eo, m.installed_by, coalesce(m.installed_on, m.status_changed_at::date) as date,
           m.installed_odometer as odometer,
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

-- A transfer carries the reading to the buyer's copy. Otherwise unchanged from 20261026000000_build_record.sql.
create or replace function app_private.copy_record(p_from uuid, p_to uuid, p_owner uuid, p_sold timestamptz) returns void
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
                             installed_by, installed_odometer, compliance, carb_eo, status_changed_at, created_at,
                             deleted_at, inherited_at)
    values (p_owner, p_to, m.name, m.category, m.brand, m.part_number, m.status, m.spec_deltas, m.installed_on,
            m.installed_by, m.installed_odometer, m.compliance, m.carb_eo, m.status_changed_at, m.created_at,
            m.deleted_at, coalesce(m.inherited_at, p_sold))
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

-- ================================================================ 2. build budget (private)

-- What the owner plans to spend on the car, in minor units of their currency. Never on any public view, the record
-- or the buyer's link (all of those list their columns), like costs (D-24).
alter table public.vehicles
  add column budget_minor bigint check (budget_minor between 0 and 100000000000),
  add column budget_currency text check (budget_currency ~ '^[A-Z]{3}$');
alter table public.vehicles add constraint vehicles_budget_pair
  check ((budget_minor is null) = (budget_currency is null));
grant update (budget_minor, budget_currency) on public.vehicles to authenticated;

-- ================================================================ 3. a gallery photo as the cover

-- Points the car's cover at one of its own gallery photos (same private file, same signing path). hero_path stays
-- server-written: the app can't set it directly (phase 3).
create function public.set_cover_photo(p_photo uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  p public.vehicle_photos;
  n integer;
begin
  select * into p from public.vehicle_photos where id = p_photo and owner_id = auth.uid() and deleted_at is null;
  if p.id is null then return false; end if;
  update public.vehicles set hero_path = p.storage_path, updated_at = now()
    where id = p.vehicle_id and owner_id = auth.uid() and deleted_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.set_cover_photo(uuid) from public, anon;
grant execute on function public.set_cover_photo(uuid) to authenticated;

-- Removing the photo that's the cover takes the cover away too (the car shows its drawing again), so a public page
-- never points at a removed photo.
create or replace function public.soft_delete_vehicle_photo(p_photo uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
  v_path text;
  v_vehicle uuid;
begin
  update public.vehicle_photos set deleted_at = now() where id = p_photo and owner_id = auth.uid() and deleted_at is null
    returning storage_path, vehicle_id into v_path, v_vehicle;
  get diagnostics n = row_count;
  if n > 0 then
    update public.vehicles set hero_path = null where id = v_vehicle and owner_id = auth.uid() and hero_path = v_path;
  end if;
  return n > 0;
end $$;

-- ================================================================ 4. receipt scan rate limit

-- Checked by the receipt-scan Edge Function as the signed-in user before every model call (each scan costs money).
create function public.receipt_scan_allow() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign_in_required' using errcode = 'P0001';
  end if;
  perform public.enforce_rate_limit('receipt_scan_hour', 10, 3600);
  perform public.enforce_rate_limit('receipt_scan_day', 30, 86400);
  return true;
end $$;
revoke all on function public.receipt_scan_allow() from public, anon;
grant execute on function public.receipt_scan_allow() to authenticated;
