-- D-72: more for motorcycles and e-bikes.
--  * Fix: D-71's new columns were never granted, and vehicles grants writes column by column (phase 1), so the app
--    could not save a motorcycle or an e-bike. Granted here, with the new columns below.
--  * Engine size (cc) for motorcycles; class (1, 2 or 3, the US e-bike classes) and a private frame serial number for
--    e-bikes (their VIN equivalent: never in a public view, exported with the rest of the owner's data).

alter table public.vehicles
  add column engine_cc integer check (engine_cc is null or engine_cc between 20 and 10000),
  add column ebike_class smallint check (ebike_class is null or ebike_class between 1 and 3),
  add column frame_serial text check (frame_serial is null or frame_serial ~ '^[A-Za-z0-9-]{3,40}$');

alter table public.vehicles
  drop constraint vehicles_ebike_fields,
  add constraint vehicles_ebike_fields check (
    kind = 'ebike' or (motor_w is null and battery_wh is null and range_mi is null and top_speed_mph is null
                       and ebike_class is null and frame_serial is null)
  ),
  add constraint vehicles_engine_cc_motorcycle check (kind = 'motorcycle' or engine_cc is null);

grant insert (kind, motor_w, battery_wh, range_mi, top_speed_mph, engine_cc, ebike_class, frame_serial)
  on public.vehicles to authenticated;
grant update (kind, motor_w, battery_wh, range_mi, top_speed_mph, engine_cc, ebike_class, frame_serial)
  on public.vehicles to authenticated;

-- engine size and class are public spec facts (never the frame serial); new columns go at the end
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
         v.engine_cc, v.ebike_class
  from public.builds b
  join public.vehicles v on v.id = b.vehicle_id and v.deleted_at is null and v.hidden_at is null
    and v.visibility = 'public'
  join public.users u on u.id = b.owner_id and u.deleted_at is null and u.hidden_at is null
    and u.username is not null
  where b.deleted_at is null and b.visibility = 'public' and not public.is_blocked_with(b.owner_id);
