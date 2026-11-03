-- Factory stock specs (owner decision D-55): when an owner leaves stock numbers blank, the factory figures for
-- their car fill in and become the baseline for estimates. The owner's own numbers always win.
-- Rows mirror src/domain/stockSpecs.ts (a unit test keeps them in sync); names are squashed (letters/digits only).

create table app_private.stock_specs (
  id serial primary key,
  make text not null,
  names text[] not null,
  except_names text[] not null default '{}',
  year_from smallint not null,
  year_to smallint not null check (year_to >= year_from),
  label text not null,
  hp numeric(6,1) not null check (hp > 0),
  torque_lbft numeric(6,1) not null check (torque_lbft > 0),
  weight_lb numeric(7,1) check (weight_lb > 100),
  zero_to_sixty_s numeric(5,2) check (zero_to_sixty_s > 0)
);
-- private: the app reads it only through lookup_stock_specs() and the fill trigger (both SECURITY DEFINER)
revoke all on app_private.stock_specs from public, anon, authenticated;

insert into app_private.stock_specs (make, names, except_names, year_from, year_to, label, hp, torque_lbft, weight_lb, zero_to_sixty_s) values
  ('Subaru', array['wrx', 'imprezawrx']::text[], array[]::text[], 2015, 2021, 'Subaru WRX', 268, 258, 3267, 5.4),
  ('Subaru', array['wrx', 'imprezawrx']::text[], array[]::text[], 2022, 2024, 'Subaru WRX', 271, 258, 3320, null),
  ('Subaru', array['wrxsti', 'sti', 'imprezawrxsti']::text[], array[]::text[], 2015, 2018, 'Subaru WRX STI', 305, 290, 3391, 4.6),
  ('Subaru', array['wrxsti', 'sti', 'imprezawrxsti']::text[], array[]::text[], 2019, 2021, 'Subaru WRX STI', 310, 290, 3391, null),
  ('Subaru', array['brz']::text[], array[]::text[], 2013, 2016, 'Subaru BRZ', 200, 151, 2776, null),
  ('Subaru', array['brz']::text[], array[]::text[], 2017, 2020, 'Subaru BRZ', 205, 156, 2798, null),
  ('Subaru', array['brz']::text[], array[]::text[], 2022, 2024, 'Subaru BRZ', 228, 184, 2815, null),
  ('Toyota', array['gr86', 'gr86', '86']::text[], array[]::text[], 2022, 2024, 'Toyota GR86', 228, 184, 2811, null),
  ('Toyota', array['86', 'gt86']::text[], array[]::text[], 2017, 2020, 'Toyota 86', 205, 156, 2774, null),
  ('Scion', array['frs']::text[], array[]::text[], 2013, 2016, 'Scion FR-S', 200, 151, 2758, null),
  ('Toyota', array['corollagts', 'ae86', 'sprintertrueno']::text[], array[]::text[], 1985, 1987, 'Toyota Corolla GT-S (AE86)', 112, 97, 2350, null),
  ('Toyota', array['supra']::text[], array[]::text[], 1993, 1998, 'Toyota Supra', 220, 210, 3210, null),
  ('Toyota', array['supraturbo', 'supratwinturbo']::text[], array[]::text[], 1993, 1998, 'Toyota Supra Turbo', 320, 315, 3505, null),
  ('Toyota', array['supra', 'grsupra']::text[], array[]::text[], 2020, 2020, 'Toyota GR Supra 3.0', 335, 365, 3397, null),
  ('Toyota', array['supra', 'grsupra']::text[], array[]::text[], 2021, 2024, 'Toyota GR Supra 3.0', 382, 368, 3400, null),
  ('Toyota', array['grcorolla']::text[], array[]::text[], 2023, 2024, 'Toyota GR Corolla', 300, 273, 3249, null),
  ('Mazda', array['mx5miata', 'miata', 'mx5']::text[], array[]::text[], 1990, 1993, 'Mazda MX-5 Miata (NA 1.6)', 116, 100, 2116, null),
  ('Mazda', array['mx5miata', 'miata', 'mx5']::text[], array[]::text[], 1994, 1997, 'Mazda MX-5 Miata (NA 1.8)', 128, 110, 2293, null),
  ('Mazda', array['mx5miata', 'miata', 'mx5']::text[], array[]::text[], 1999, 2000, 'Mazda MX-5 Miata (NB)', 140, 119, 2299, 8),
  ('Mazda', array['mx5miata', 'miata', 'mx5']::text[], array[]::text[], 2001, 2005, 'Mazda MX-5 Miata (NB)', 142, 125, 2387, null),
  ('Mazda', array['mx5miata', 'miata', 'mx5']::text[], array[]::text[], 2006, 2015, 'Mazda MX-5 Miata (NC)', 167, 140, 2480, null),
  ('Mazda', array['mx5miata', 'miata', 'mx5']::text[], array[]::text[], 2016, 2018, 'Mazda MX-5 Miata (ND)', 155, 148, 2332, null),
  ('Mazda', array['mx5miata', 'miata', 'mx5']::text[], array[]::text[], 2019, 2024, 'Mazda MX-5 Miata (ND2)', 181, 151, 2341, null),
  ('Mazda', array['rx7']::text[], array[]::text[], 1993, 1995, 'Mazda RX-7 (FD)', 255, 217, 2800, null),
  ('Mazda', array['rx8']::text[], array[]::text[], 2004, 2008, 'Mazda RX-8', 238, 159, 3029, null),
  ('Honda', array['civicsi']::text[], array[]::text[], 2017, 2020, 'Honda Civic Si', 205, 192, 2889, null),
  ('Honda', array['civictyper', 'civictyper']::text[], array[]::text[], 2017, 2021, 'Honda Civic Type R', 306, 295, 3117, null),
  ('Honda', array['civictyper', 'civictyper']::text[], array[]::text[], 2023, 2024, 'Honda Civic Type R', 315, 310, 3188, null),
  ('Honda', array['s2000']::text[], array[]::text[], 2000, 2003, 'Honda S2000', 240, 153, 2809, null),
  ('Honda', array['s2000']::text[], array[]::text[], 2004, 2009, 'Honda S2000', 237, 162, 2864, null),
  ('Acura', array['integratyper', 'integratyper']::text[], array[]::text[], 1997, 2001, 'Acura Integra Type R', 195, 130, 2639, null),
  ('Nissan', array['350z']::text[], array[]::text[], 2003, 2004, 'Nissan 350Z', 287, 274, 3188, null),
  ('Nissan', array['350z']::text[], array[]::text[], 2007, 2008, 'Nissan 350Z', 306, 268, 3333, null),
  ('Nissan', array['370z']::text[], array['370znismo']::text[], 2009, 2020, 'Nissan 370Z', 332, 270, 3232, null),
  ('Nissan', array['gtr']::text[], array['gtrnismo', 'gtrtrack']::text[], 2009, 2011, 'Nissan GT-R', 480, 430, 3829, null),
  ('Nissan', array['gtr']::text[], array['gtrnismo', 'gtrtrack']::text[], 2013, 2016, 'Nissan GT-R', 545, 463, 3829, null),
  ('Nissan', array['gtr']::text[], array['gtrnismo', 'gtrtrack']::text[], 2017, 2024, 'Nissan GT-R', 565, 467, 3933, 2.9),
  ('Nissan', array['skylinegtr', 'gtr', 'gtrr33']::text[], array[]::text[], 1995, 1998, 'Nissan Skyline GT-R (R33)', 276, 271, 3390, 5),
  ('Nissan', array['skylinegtr', 'gtr', 'gtrr34']::text[], array[]::text[], 1999, 2002, 'Nissan Skyline GT-R (R34)', 276, 289, 3440, null),
  ('Mitsubishi', array['lancerevolution', 'lancerevo', 'evo', 'evolution']::text[], array[]::text[], 2003, 2005, 'Mitsubishi Lancer Evolution VIII', 271, 273, 3263, null),
  ('Mitsubishi', array['lancerevolution', 'lancerevo', 'evo', 'evolution']::text[], array[]::text[], 2006, 2006, 'Mitsubishi Lancer Evolution IX', 286, 289, 3285, null),
  ('Mitsubishi', array['lancerevolution', 'lancerevo', 'evo', 'evolution']::text[], array[]::text[], 2008, 2015, 'Mitsubishi Lancer Evolution X', 291, 300, 3517, 4.9),
  ('Ford', array['mustang', 'mustangecoboost']::text[], array['mustangshelby', 'mustanggt350', 'mustanggt500', 'mustangbullitt', 'mustangmach']::text[], 2015, 2017, 'Ford Mustang EcoBoost', 310, 320, 3524, null),
  ('Ford', array['mustanggt']::text[], array[]::text[], 2011, 2012, 'Ford Mustang GT', 412, 390, 3605, null),
  ('Ford', array['mustanggt']::text[], array['mustanggt350', 'mustanggt500']::text[], 2015, 2017, 'Ford Mustang GT', 435, 400, 3705, null),
  ('Ford', array['mustanggt']::text[], array['mustanggt350', 'mustanggt500']::text[], 2018, 2023, 'Ford Mustang GT', 460, 420, 3805, 4.3),
  ('Ford', array['focusrs']::text[], array[]::text[], 2016, 2018, 'Ford Focus RS', 350, 350, 3434, null),
  ('Ford', array['focusst']::text[], array[]::text[], 2013, 2018, 'Ford Focus ST', 252, 270, 3223, null),
  ('Ford', array['fiestast']::text[], array[]::text[], 2014, 2019, 'Ford Fiesta ST', 197, 202, 2720, null),
  ('Ford', array['bronco']::text[], array['broncosport', 'broncoraptor', 'bronco27']::text[], 2021, 2024, 'Ford Bronco 2.3', 300, 325, 4500, 6.5),
  ('Chevrolet', array['camaross']::text[], array[]::text[], 2016, 2024, 'Chevrolet Camaro SS', 455, 455, 3685, null),
  ('Chevrolet', array['corvette', 'corvettestingray']::text[], array['corvettez06', 'corvettezr1', 'corvettegrandsport', 'corvetteeray', 'corvettestingrayz06']::text[], 2014, 2019, 'Chevrolet Corvette Stingray (C7)', 455, 460, 3298, 3.8),
  ('Chevrolet', array['corvette', 'corvettestingray']::text[], array['corvettez06', 'corvettezr1', 'corvettegrandsport', 'corvetteeray', 'corvettestingrayz06']::text[], 2020, 2024, 'Chevrolet Corvette Stingray (C8)', 490, 465, 3535, 2.9),
  ('Volkswagen', array['golfgti', 'gti']::text[], array[]::text[], 2015, 2017, 'Volkswagen Golf GTI (Mk7)', 210, 258, 3021, null),
  ('Volkswagen', array['golfgti', 'gti']::text[], array[]::text[], 2018, 2021, 'Volkswagen Golf GTI (Mk7.5)', 228, 258, 3031, null),
  ('Volkswagen', array['golfr']::text[], array[]::text[], 2015, 2019, 'Volkswagen Golf R (Mk7)', 292, 280, 3340, null),
  ('BMW', array['m3']::text[], array['m3csl']::text[], 2001, 2006, 'BMW M3 (E46)', 333, 262, 3415, null),
  ('BMW', array['m3']::text[], array[]::text[], 2008, 2013, 'BMW M3 (E92)', 414, 295, 3704, null),
  ('BMW', array['m2']::text[], array[]::text[], 2016, 2018, 'BMW M2', 365, 343, 3450, null),
  ('Hyundai', array['velostern']::text[], array[]::text[], 2019, 2022, 'Hyundai Veloster N', 275, 260, 3106, null),
  ('Hyundai', array['elantran']::text[], array[]::text[], 2022, 2024, 'Hyundai Elantra N', 276, 289, 3186, null),
  ('Dodge', array['challengerhellcat', 'challengersrthellcat']::text[], array['challengerhellcatredeye', 'challengersrthellcatredeye']::text[], 2015, 2018, 'Dodge Challenger SRT Hellcat', 707, 650, 4448, null),
  ('Porsche', array['911carrera']::text[], array['911carreras', '911carreragts', '911carrera4s']::text[], 2020, 2024, 'Porsche 911 Carrera (992)', 379, 331, 3354, null);

-- which stock numbers came from the table (shown as "factory spec", not "your number") and what matched.
-- Set only by the trigger below (not in the client's insert/update grants). Private like the other baseline fields.
alter table public.vehicles
  add column baseline_looked_up text[] not null default '{}'
    check (baseline_looked_up <@ array['baseline_hp', 'baseline_torque_lbft', 'baseline_weight_lb', 'baseline_zero_to_sixty_s']),
  add column baseline_lookup_label text check (char_length(baseline_lookup_label) <= 100);

create function app_private.squash_name(p text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(coalesce(p, ''), '[^a-zA-Z0-9]', '', 'g'))
$$;

create function app_private.make_key(p text) returns text
language sql immutable set search_path = '' as $$
  select case app_private.squash_name(p) when 'chevy' then 'chevrolet' when 'vw' then 'volkswagen' else app_private.squash_name(p) end
$$;

-- Same rule as matchStockSpec(): make + year fit, model+trim starts with a name, no "except" name; longest name wins.
create function app_private.match_stock_spec(p_year integer, p_make text, p_model text, p_trim text)
returns app_private.stock_specs
language sql stable set search_path = '' as $$
  with t as (select app_private.squash_name(coalesce(p_model, '') || ' ' || coalesce(p_trim, '')) as target)
  select s.*
  from app_private.stock_specs s, t,
       lateral (select max(char_length(n)) as len from unnest(s.names) n where n <> '' and t.target like n || '%') m
  where p_year between s.year_from and s.year_to
    and app_private.make_key(s.make) = app_private.make_key(p_make)
    and m.len is not null
    and not exists (select 1 from unnest(s.except_names) e where t.target like e || '%')
  order by m.len desc, s.id
  limit 1
$$;

create function app_private.stock_spec_label(s app_private.stock_specs) returns text
language sql immutable set search_path = '' as $$
  select case when s.year_from = s.year_to then s.year_from::text else s.year_from || '–' || s.year_to end || ' ' || s.label
$$;

-- For the vehicle form: what would fill in for this car (null when we have nothing; never a guess).
create function public.lookup_stock_specs(p_year integer, p_make text, p_model text, p_trim text default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s app_private.stock_specs;
begin
  s := app_private.match_stock_spec(p_year, p_make, p_model, p_trim);
  if s.id is null then return null; end if;
  return jsonb_build_object('label', app_private.stock_spec_label(s), 'hp', s.hp, 'torque_lbft', s.torque_lbft,
    'weight_lb', s.weight_lb, 'zero_to_sixty_s', s.zero_to_sixty_s);
end $$;

-- Fill blank stock numbers from the table. A field stays "looked up" while the owner hasn't changed it, so
-- changing the car (year/model/trim) refreshes it; a number the owner types is theirs.
create function public.fill_vehicle_baseline() returns trigger
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

create trigger vehicles_fill_baseline
  before insert or update of year, make, model, trim_level, baseline_hp, baseline_torque_lbft, baseline_weight_lb,
    baseline_zero_to_sixty_s
  on public.vehicles for each row execute function public.fill_vehicle_baseline();

revoke all on function app_private.squash_name(text), app_private.make_key(text),
  app_private.stock_spec_label(app_private.stock_specs), app_private.match_stock_spec(integer, text, text, text)
  from public, anon, authenticated;
revoke all on function public.fill_vehicle_baseline() from public, anon, authenticated;
-- the one public door: read-only reference answers (reviewed in the schema audit)
revoke all on function public.lookup_stock_specs(integer, text, text, text) from public;
grant execute on function public.lookup_stock_specs(integer, text, text, text) to anon, authenticated;

-- existing vehicles with blank stock numbers get factory figures now
update public.vehicles set make = make
where deleted_at is null
  and (baseline_hp is null or baseline_torque_lbft is null or baseline_weight_lb is null or baseline_zero_to_sixty_s is null);