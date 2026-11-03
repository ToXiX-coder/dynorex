-- D-71: motorcycles and e-bikes join cars. Every existing vehicle is a car (the column defaults to it), so nothing
-- that is already stored changes meaning. Motorcycles use the car's spec fields; e-bikes add their own (motor power,
-- battery, range, top speed) and skip VIN, 0-60 and the factory-spec lookup, which only knows cars.

create type public.vehicle_kind as enum ('car', 'motorcycle', 'ebike');

alter table public.vehicles
  add column kind public.vehicle_kind not null default 'car',
  add column motor_w integer check (motor_w is null or motor_w between 1 and 20000),
  add column battery_wh integer check (battery_wh is null or battery_wh between 1 and 10000),
  add column range_mi numeric(5, 1) check (range_mi is null or (range_mi > 0 and range_mi <= 500)),
  add column top_speed_mph numeric(5, 1) check (top_speed_mph is null or (top_speed_mph > 0 and top_speed_mph <= 300));

-- the e-bike numbers belong to e-bikes only, and an e-bike has a frame serial rather than a 17-character VIN
alter table public.vehicles
  add constraint vehicles_ebike_fields check (
    kind = 'ebike' or (motor_w is null and battery_wh is null and range_mi is null and top_speed_mph is null)
  ),
  add constraint vehicles_ebike_no_vin check (kind <> 'ebike' or vin is null);

-- An e-bike weighs 40-80 lb, under the 100 lb floor every car and motorcycle keeps. Only e-bikes get the lower one.
alter table public.vehicles drop constraint if exists vehicles_baseline_weight_lb_check;
alter table public.vehicles
  add constraint vehicles_baseline_weight_lb_check check (
    baseline_weight_lb > case when kind = 'ebike' then 10 else 100 end and baseline_weight_lb < 20000
  );

-- Mod categories for two wheels. Cars keep their nine; each kind picks its own set in the app
-- (src/domain/vehicleKind.ts). New enum values can't be used in the transaction that adds them, and nothing below does.
alter type public.mod_category add value if not exists 'brakes';
alter type public.mod_category add value if not exists 'controls';
alter type public.mod_category add value if not exists 'luggage';
alter type public.mod_category add value if not exists 'motor';
alter type public.mod_category add value if not exists 'battery';
alter type public.mod_category add value if not exists 'drivetrain';
alter type public.mod_category add value if not exists 'cockpit';

-- The factory-spec table only knows cars: a motorcycle or e-bike keeps exactly the numbers its owner typed.
create or replace function public.fill_vehicle_baseline() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s app_private.stock_specs;
  looked text[] := '{}';
  mine boolean := false;
  f text;
  cur numeric;
  prev numeric;
  was_looked boolean;
  spec_val numeric;
begin
  if new.kind <> 'car' then
    -- drop any car numbers looked up before the owner switched the type, keep the ones they typed
    if tg_op = 'UPDATE' then
      foreach f in array old.baseline_looked_up loop
        if (to_jsonb(new) ->> f) is not distinct from (to_jsonb(old) ->> f) then
          new := jsonb_populate_record(new, jsonb_build_object(f, null));
        end if;
      end loop;
    end if;
    new.baseline_looked_up := '{}';
    new.baseline_lookup_label := null;
    new.baseline_source := case
      when coalesce(new.baseline_hp, new.baseline_torque_lbft, new.baseline_weight_lb, new.baseline_zero_to_sixty_s)
           is not null then 'user_reported'::public.spec_source end;
    return new;
  end if;
  s := app_private.match_stock_spec(new.year, new.make, new.model, new.trim_level);
  foreach f in array array['baseline_hp', 'baseline_torque_lbft', 'baseline_weight_lb', 'baseline_zero_to_sixty_s'] loop
    cur := (to_jsonb(new) ->> f)::numeric;
    prev := case when tg_op = 'UPDATE' then (to_jsonb(old) ->> f)::numeric end;
    was_looked := tg_op = 'UPDATE' and f = any(old.baseline_looked_up);
    spec_val := case f when 'baseline_hp' then s.hp when 'baseline_torque_lbft' then s.torque_lbft
                       when 'baseline_weight_lb' then s.weight_lb else s.zero_to_sixty_s end;
    if cur is null or (was_looked and cur is not distinct from prev) then
      cur := spec_val;
      if spec_val is not null then looked := looked || f; end if;
    else
      mine := true;
    end if;
    new := jsonb_populate_record(new, jsonb_build_object(f, cur));
  end loop;
  new.baseline_looked_up := looked;
  new.baseline_lookup_label := case when cardinality(looked) > 0 then app_private.stock_spec_label(s) end;
  new.baseline_source := case when mine then 'user_reported'::public.spec_source
                              when cardinality(looked) > 0 then 'external'::public.spec_source end;
  return new;
end $$;
revoke all on function public.fill_vehicle_baseline() from public, anon, authenticated;

drop trigger vehicles_fill_baseline on public.vehicles;
create trigger vehicles_fill_baseline
  before insert or update of kind, year, make, model, trim_level, baseline_hp, baseline_torque_lbft,
    baseline_weight_lb, baseline_zero_to_sixty_s
  on public.vehicles for each row execute function public.fill_vehicle_baseline();

-- The spec estimate, unchanged except that an e-bike's weight is sane from 10 lb (mirrors src/domain/specs.ts).
create or replace function public.vehicle_spec_estimate(p_vehicle_id uuid)
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
           case when v.kind = 'ebike' then 10 else 100 end as wt_floor,
           done.n, pend.hp as php, pend.tq as ptq, pend.wt as pwt, pend.zs as pzs
    from v, done, pend
  ),
  checked as (
    select *,
      case when hp is null then 'unknown' when hp <= 0 or hp >= 5000 then 'invalid' else 'estimate' end as hs,
      case when tq is null then 'unknown' when tq <= 0 or tq >= 5000 then 'invalid' else 'estimate' end as ts,
      case when wt is null then 'unknown' when wt <= wt_floor or wt >= 20000 then 'invalid' else 'estimate' end as ws,
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

-- Public builds carry the type and the e-bike numbers (owner-entered stock specs, nothing private). New columns go at
-- the end so every function that returns setof public_builds keeps working unchanged.
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
         v.kind, v.motor_w, v.battery_wh, v.range_mi, v.top_speed_mph
  from public.builds b
  join public.vehicles v on v.id = b.vehicle_id and v.deleted_at is null and v.hidden_at is null
    and v.visibility = 'public'
  join public.users u on u.id = b.owner_id and u.deleted_at is null and u.hidden_at is null
    and u.username is not null
  where b.deleted_at is null and b.visibility = 'public' and not public.is_blocked_with(b.owner_id);
