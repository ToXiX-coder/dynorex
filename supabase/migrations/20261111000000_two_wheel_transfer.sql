-- D-74: handing a motorcycle or e-moto to its buyer.
-- E-motos have no VIN (D-71): the buyer's check and the claim match the frame number instead. A claimed vehicle
-- keeps its kind and its two-wheel details instead of arriving as a car.

-- What identifies the vehicle to a buyer: the VIN, or for an e-moto the frame number. Letters and digits only,
-- upper case, so "abc-123" and "ABC 123" match.
create function app_private.vehicle_ident(v public.vehicles) returns text
language sql immutable set search_path = '' as $$
  select nullif(upper(regexp_replace(coalesce(case when v.kind = 'ebike' then v.frame_serial else v.vin end, ''),
                                     '[^A-Za-z0-9]', '', 'g')), '')
$$;
revoke all on function app_private.vehicle_ident(public.vehicles) from public, anon, authenticated;

create or replace function public.check_record_vin(p_token text, p_vin text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare s app_private.history_shares; v public.vehicles; v_ident text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return 'not_found'; end if;
  select * into s from app_private.history_shares where token = p_token and expires_at > now();
  if not found then return 'not_found'; end if;
  delete from app_private.record_vin_checks where at < now() - interval '1 day';
  if (select count(*) from app_private.record_vin_checks where token = p_token and at > now() - interval '1 hour') >= 10 then
    return 'too_many';
  end if;
  insert into app_private.record_vin_checks (token) values (p_token);
  select * into v from public.vehicles where id = s.vehicle_id and owner_id = s.owner_id and deleted_at is null;
  if not found then return 'not_found'; end if;
  v_ident := app_private.vehicle_ident(v);
  if v_ident is null then return 'no_vin_on_record'; end if;
  return case when v_ident = upper(regexp_replace(coalesce(p_vin, ''), '[^A-Za-z0-9]', '', 'g')) then 'match' else 'no_match' end;
end $$;

-- Returns {status}, never raises for a wrong code or VIN, so failed attempts are counted (a raise would undo them).
create or replace function public.claim_vehicle_transfer(p_code text, p_vin text) returns jsonb
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
  if app_private.vehicle_ident(v) is null
     or app_private.vehicle_ident(v) <> upper(regexp_replace(coalesce(p_vin, ''), '[^A-Za-z0-9]', '', 'g')) then
    update app_private.vehicle_transfers set failed_attempts = failed_attempts + 1,
      closed_at = case when failed_attempts + 1 >= 5 then v_now end where id = t.id;
    return jsonb_build_object('status', 'vin_mismatch');
  end if;

  -- the buyer's new vehicle (their own plan limit applies), same kind and two-wheel details
  begin
    insert into public.vehicles (owner_id, year, make, model, trim_level, vin, odometer, odometer_unit, visibility,
                                 previous_owners, received_at, vin_locked_at, kind, engine_cc, motor_w, battery_wh,
                                 battery_v, range_mi, top_speed_mph, ebike_class, frame_serial, street_legal)
    values (v_me, v.year, v.make, v.model, v.trim_level, v.vin, v.odometer, v.odometer_unit, 'private',
            least(v.previous_owners + 1, 100), v_now, v_now, v.kind, v.engine_cc, v.motor_w, v.battery_wh,
            v.battery_v, v.range_mi, v.top_speed_mph, v.ebike_class, v.frame_serial, v.street_legal)
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

-- ================================================================ e-moto battery log
-- A battery check is a maintenance entry with two readings a used-e-moto buyer asks for first: charge cycles (from
-- the BMS or charger app) and the pack's voltage at full charge. Both are the owner's readings, never "verified".
alter table public.maintenance_records
  add column battery_cycles integer check (battery_cycles between 0 and 20000),
  add column battery_full_v numeric(5, 1) check (battery_full_v between 10 and 900);
grant insert (battery_cycles, battery_full_v) on public.maintenance_records to authenticated;
grant update (battery_cycles, battery_full_v) on public.maintenance_records to authenticated;

-- the mod columns are needed by the record copy below
alter table public.mods
  add column sets_motor_w integer check (sets_motor_w between 1 and 100000),
  add column sets_battery_v smallint check (sets_battery_v between 12 and 800),
  add column sets_battery_wh integer check (sets_battery_wh between 50 and 50000);
grant insert (sets_motor_w, sets_battery_v, sets_battery_wh) on public.mods to authenticated;
grant update (sets_motor_w, sets_battery_v, sets_battery_wh) on public.mods to authenticated;

-- the shared record says what kind of vehicle it is, so a buyer's check asks for a VIN or a frame number
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
           m.inherited_at, false as has_sheet, null::integer as battery_cycles, null::numeric as battery_full_v
    from public.mods m
    where m.vehicle_id = p_vehicle
      and (m.status = 'complete' or exists (select 1 from public.record_revisions x
                                            where x.entry_type = 'mod' and x.entry_id = m.id))
      and (m.deleted_at is null or (m.status = 'complete' and m.deleted_at > m.status_changed_at + interval '24 hours'))
    union all
    select 'maintenance', r.id, r.title, null, null, null, null, null, null, r.done_on, r.odometer, null, null, null, null,
           r.created_at, r.deleted_at, false, r.inherited_at, false, r.battery_cycles, r.battery_full_v
    from public.maintenance_records r
    where r.vehicle_id = p_vehicle and (r.deleted_at is null or r.deleted_at > r.created_at + interval '24 hours')
    union all
    select 'dyno', d.id, 'Dyno run', null, null, null, null, null, d.shop, d.measured_on, null, d.whp, d.wtq,
           d.dyno::text, d.correction::text, d.created_at, d.deleted_at, false, d.inherited_at, d.sheet_path is not null,
           null, null
    from public.dyno_results d
    where d.vehicle_id = p_vehicle and (d.deleted_at is null or d.deleted_at > d.created_at + interval '24 hours')
  )
  select jsonb_build_object(
    'car', jsonb_build_object('year', v.year, 'make', v.make, 'model', v.model, 'trim', v.trim_level, 'kind', v.kind),
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
          'battery_cycles', e.battery_cycles, 'battery_full_v', e.battery_full_v,
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

-- A transfer code needs what the buyer will type: the VIN, or an e-moto's frame number.
create or replace function public.start_vehicle_transfer(p_vehicle uuid) returns text
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
  if app_private.vehicle_ident(v) is null then raise exception 'vin_required' using errcode = 'P0001'; end if;
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

-- A buyer's link also locks an e-moto's frame number, like a VIN.
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
  update public.vehicles set vin_locked_at = coalesce(vin_locked_at, now())
    where id = p_vehicle and (vin is not null or frame_serial is not null);
  return v_token;
end $$;

-- Once locked, neither the VIN nor the frame number can change (and a locked vehicle can't change kind).
create or replace function app_private.vehicle_record_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.vin_locked_at is not null
     and (new.vin, new.frame_serial, new.kind) is distinct from (old.vin, old.frame_serial, old.kind) then
    raise exception 'vin_locked' using errcode = 'P0001';
  end if;
  if old.sold_at is not null and new.deleted_at is null
     and (new.year, new.make, new.model, new.trim_level, new.odometer, new.odometer_unit)
         is distinct from (old.year, old.make, old.model, old.trim_level, old.odometer, old.odometer_unit) then
    raise exception 'vehicle_sold' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- NHTSA's recall lookup doesn't cover e-motos (the app hides the card for them): stop asking about them.
create or replace function public.recall_targets() returns table (make text, model text, model_year integer)
language sql stable security definer set search_path = '' as $$
  select distinct min(v.make), min(v.model), v.year
  from public.vehicles v
  where v.deleted_at is null and v.year is not null and v.kind <> 'ebike'
  group by app_private.car_key(v.make), app_private.car_key(v.model), v.year
$$;

-- ================================================================ runs for two wheels
-- A motorcycle or e-moto weighs less than the old 1,000 lb floor (a 403 lb MT-07 couldn't save a run), and an
-- e-moto is timed 0-30 mph, the number its riders compare (D-74).
alter table public.perf_runs drop constraint perf_runs_weight_lb_check;
alter table public.perf_runs add constraint perf_runs_weight_lb_check check (weight_lb between 100 and 12000);
alter table public.perf_runs add column zero_thirty_s numeric(5, 2) check (zero_thirty_s between 0.5 and 20);
alter table public.perf_runs drop constraint perf_runs_check;
alter table public.perf_runs add constraint perf_runs_measured_check
  check (zero_sixty_s is not null or quarter_s is not null or zero_thirty_s is not null);
grant insert (zero_thirty_s) on public.perf_runs to authenticated;

create or replace view public.public_perf_runs with (security_barrier = true) as
  select r.id as run_id, r.vehicle_id, r.ran_at, r.zero_sixty_s, r.quarter_s, r.trap_mph, r.est_whp,
         r.sample_hz, r.quality, r.zero_thirty_s
  from public.perf_runs r
  join public.public_builds pb on pb.vehicle_id = r.vehicle_id
  where r.deleted_at is null and r.shared;

-- ================================================================ e-moto mods that change the numbers
-- A controller or a battery doesn't add to an e-moto's numbers, it replaces them: "after this mod: 18 kW peak",
-- "a 72V, 3,600 Wh pack". Counted once the mod is complete; the newest complete one wins. Stock stays on the vehicle.
-- (the columns themselves are added above, before the record copy)

create or replace view public.public_builds with (security_barrier = true) as
  select b.id as build_id, b.vehicle_id, u.username as owner_username, b.title, b.description,
         b.updated_at,
         v.year, v.make, v.model, v.trim_level, v.nickname,
         (v.hero_path is not null) as has_hero,
         (select count(*) from public.build_follows bf where bf.build_id = b.id) as followers_count,
         (select count(*) from public.mods m
            where m.vehicle_id = b.vehicle_id and m.deleted_at is null and m.hidden_at is null) as mods_count,
         greatest(b.updated_at,
                  (select max(m.created_at) from public.mods m
                     where m.vehicle_id = b.vehicle_id and m.deleted_at is null and m.hidden_at is null))
           as last_activity_at,
         v.kind, v.motor_w, v.battery_wh, v.range_mi, v.top_speed_mph,
         v.engine_cc, v.ebike_class,
         v.battery_v, v.street_legal,
         -- what an e-moto runs now: each number from its newest complete mod that sets it (null: stock applies)
         (select m.sets_motor_w from public.mods m where m.vehicle_id = v.id and v.kind = 'ebike'
            and m.status = 'complete' and m.deleted_at is null and m.hidden_at is null and m.sets_motor_w is not null
            order by coalesce(m.installed_on, m.status_changed_at::date) desc, m.status_changed_at desc limit 1) as mod_motor_w,
         (select m.sets_battery_v from public.mods m where m.vehicle_id = v.id and v.kind = 'ebike'
            and m.status = 'complete' and m.deleted_at is null and m.hidden_at is null and m.sets_battery_v is not null
            order by coalesce(m.installed_on, m.status_changed_at::date) desc, m.status_changed_at desc limit 1) as mod_battery_v,
         (select m.sets_battery_wh from public.mods m where m.vehicle_id = v.id and v.kind = 'ebike'
            and m.status = 'complete' and m.deleted_at is null and m.hidden_at is null and m.sets_battery_wh is not null
            order by coalesce(m.installed_on, m.status_changed_at::date) desc, m.status_changed_at desc limit 1) as mod_battery_wh
  from public.builds b
  join public.vehicles v on v.id = b.vehicle_id and v.deleted_at is null and v.hidden_at is null
    and v.visibility = 'public'
  join public.users u on u.id = b.owner_id and u.deleted_at is null and u.hidden_at is null
    and u.username is not null
  where b.deleted_at is null and b.visibility = 'public' and not public.is_blocked_with(b.owner_id);

-- A transfer also carries an e-moto's mod figures and battery readings. Otherwise unchanged from 20261027000000_god_mode.sql.
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
                             deleted_at, inherited_at, sets_motor_w, sets_battery_v, sets_battery_wh)
    values (p_owner, p_to, m.name, m.category, m.brand, m.part_number, m.status, m.spec_deltas, m.installed_on,
            m.installed_by, m.installed_odometer, m.compliance, m.carb_eo, m.status_changed_at, m.created_at,
            m.deleted_at, coalesce(m.inherited_at, p_sold), m.sets_motor_w, m.sets_battery_v, m.sets_battery_wh)
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
    insert into public.maintenance_records (owner_id, vehicle_id, title, done_on, odometer, created_at, deleted_at, inherited_at,
                                            battery_cycles, battery_full_v)
    values (p_owner, p_to, r.title, r.done_on, r.odometer, r.created_at, r.deleted_at, coalesce(r.inherited_at, p_sold),
            r.battery_cycles, r.battery_full_v)
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
