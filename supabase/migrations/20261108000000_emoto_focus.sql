-- D-73: the e-bike kind becomes the e-moto kind (light electric motorcycles: Sur-Ron, Talaria, E Ride Pro, Stark).
-- The stored value stays 'ebike' so nothing saved changes; the app calls it an e-moto.
--  * motor_w is now the PEAK power, which for e-motos runs from about 6 kW to 60 kW (a Stark Varg), so the old
--    20,000 W ceiling goes up to 100,000 W.
--  * battery_v: pack voltage (60 V to 72 V conversions are the most common e-moto upgrade; a Varg runs 420 V).
--  * street_legal: plated for the road, or off-road only (replaces the pedal-bike class, which stays stored).

alter table public.vehicles drop constraint if exists vehicles_motor_w_check;
alter table public.vehicles
  add constraint vehicles_motor_w_check check (motor_w is null or motor_w between 1 and 100000),
  add column battery_v smallint check (battery_v is null or battery_v between 12 and 800),
  add column street_legal boolean;

alter table public.vehicles
  drop constraint vehicles_ebike_fields,
  add constraint vehicles_ebike_fields check (
    kind = 'ebike' or (motor_w is null and battery_wh is null and range_mi is null and top_speed_mph is null
                       and ebike_class is null and frame_serial is null and battery_v is null
                       and street_legal is null)
  );

grant insert (battery_v, street_legal) on public.vehicles to authenticated;
grant update (battery_v, street_legal) on public.vehicles to authenticated;

-- both are public spec facts; new columns go at the end
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
         v.battery_v, v.street_legal
  from public.builds b
  join public.vehicles v on v.id = b.vehicle_id and v.deleted_at is null and v.hidden_at is null
    and v.visibility = 'public'
  join public.users u on u.id = b.owner_id and u.deleted_at is null and u.hidden_at is null
    and u.username is not null
  where b.deleted_at is null and b.visibility = 'public' and not public.is_blocked_with(b.owner_id);
