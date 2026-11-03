-- Dynorex Phase 1: core identity and Build tables.
-- Tables: users, vehicles, builds, mods, mod_photos, follows, build_follows, notifications.
--
-- Rules applied throughout:
--  * RLS is enabled on every table. Nothing is default-open.
--  * Supabase grants broad table rights to anon/authenticated by default; we revoke them and
--    grant only specific columns, so server-only columns (reputation, business_badge, featured,
--    owner_id, ids, timestamps) cannot be written by clients even if a policy were wrong.
--  * Child rows carry owner_id and use composite foreign keys (parent_id, owner_id) so a row can
--    never point at a parent owned by someone else (parent/child substitution).
--  * Public reads happen only through the public_* views, which are built from an allow-list of
--    columns. VIN, odometer, costs, storage paths and owner ids are never in a public view.
--  * Soft delete: deleted_at hides rows from every policy and view; deletion goes through
--    security-definer functions that check ownership.

-- ---------------------------------------------------------------- types

create type public.visibility as enum ('public', 'friends_only', 'private');
create type public.mod_category as enum (
  'engine', 'suspension', 'exhaust', 'aero', 'interior', 'wheels', 'exterior', 'electronics', 'safety'
);
create type public.mod_status as enum ('planned', 'in_progress', 'complete');
create type public.build_goal as enum (
  'daily_driver', 'track_build', 'show_car', 'off_road', 'jdm_build', 'restomod', 'stance_build', 'just_browsing'
);
create type public.notification_category as enum (
  'new_follower', 'build_update', 'event_reminder', 'marketplace_offer_received',
  'marketplace_offer_accepted', 'marketplace_sale_complete', 'subscription_expiring',
  'subscription_expired', 'build_of_the_week'
);
create type public.odometer_unit as enum ('mi', 'km');
create type public.spec_source as enum ('user_reported', 'external');
create type public.vehicle_data_source as enum ('manual', 'nhtsa');
create type public.photo_role as enum ('before', 'after', 'gallery');

-- ---------------------------------------------------------------- helpers

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- True when the CURRENT user has confirmed their email. Reads auth.users, so it is security definer
-- with a fixed search_path; it only ever answers for auth.uid().
create function public.current_user_verified() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select u.email_confirmed_at is not null from auth.users u where u.id = auth.uid()),
    false)
$$;
revoke all on function public.current_user_verified() from public, anon;
grant execute on function public.current_user_verified() to authenticated;

-- Reserved names cannot be usernames (routes, brand, staff-looking names).
create function public.is_reserved_username(name text) returns boolean
language sql immutable as $$
  select name = any (array[
    'admin','administrator','root','support','help','staff','mod','moderator','dynorex','dynorexplus',
    'torq','official','team','security','settings','discover','build','builds','garage','u','v',
    'api','app','www','login','signup','account','me','null','undefined','events','marketplace','route'
  ])
$$;

-- ---------------------------------------------------------------- users (profile)

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  -- stored lowercase; case-insensitive uniqueness by construction
  username text not null unique
    check (username ~ '^[a-z0-9_]{3,20}$' and not public.is_reserved_username(username)),
  display_name text check (char_length(display_name) between 1 and 40),
  bio text check (char_length(bio) <= 280),
  general_location text check (char_length(general_location) <= 60),
  years_experience smallint check (years_experience between 0 and 80),
  avatar_path text check (avatar_path is null or avatar_path ~ '^[0-9a-f-]{36}/avatar/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  build_goal public.build_goal,
  onboarding_step smallint not null default 0 check (onboarding_step between 0 and 3),
  onboarding_completed_at timestamptz,
  onboarding_skipped_at timestamptz,
  default_visibility public.visibility not null default 'private',
  -- server-calculated / admin-controlled: no client column grants below
  reputation integer not null default 0 check (reputation >= 0),
  business_badge boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger users_updated_at before update on public.users
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- vehicles

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  year smallint not null check (year between 1886 and 2100),
  make text not null check (char_length(make) between 1 and 50),
  model text not null check (char_length(model) between 1 and 50),
  trim_level text check (char_length(trim_level) <= 50),
  nickname text check (char_length(nickname) <= 60),
  -- PRIVATE. Never in a public view, share, notification, log or analytics event.
  vin text check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  odometer integer check (odometer between 0 and 2000000),
  odometer_unit public.odometer_unit not null default 'mi',
  description text check (char_length(description) <= 2000),
  -- Baseline specs are user-reported (or external) inputs, not measurements. Units are fixed:
  -- hp, lb-ft, lb, seconds.
  baseline_hp numeric(6,1) check (baseline_hp > 0 and baseline_hp < 5000),
  baseline_torque_lbft numeric(6,1) check (baseline_torque_lbft > 0 and baseline_torque_lbft < 5000),
  baseline_weight_lb numeric(7,1) check (baseline_weight_lb > 100 and baseline_weight_lb < 20000),
  baseline_zero_to_sixty_s numeric(5,2) check (baseline_zero_to_sixty_s > 0 and baseline_zero_to_sixty_s < 60),
  baseline_source public.spec_source,
  data_source public.vehicle_data_source not null default 'manual',
  nhtsa_make_id integer,
  nhtsa_model_id integer,
  hero_path text,
  visibility public.visibility not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, owner_id),
  check (hero_path is null or hero_path like owner_id::text || '/%')
);
create index vehicles_owner_idx on public.vehicles (owner_id, created_at desc) where deleted_at is null;
create index vehicles_public_idx on public.vehicles (created_at desc) where deleted_at is null and visibility = 'public';
create trigger vehicles_updated_at before update on public.vehicles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- builds (one build per vehicle)

create table public.builds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  vehicle_id uuid not null unique,
  title text not null check (char_length(title) between 1 and 80),
  description text check (char_length(description) <= 2000),
  visibility public.visibility not null default 'private',
  featured boolean not null default false, -- admin only
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, owner_id),
  foreign key (vehicle_id, owner_id) references public.vehicles (id, owner_id) on delete cascade
);
create index builds_owner_idx on public.builds (owner_id) where deleted_at is null;
create index builds_public_idx on public.builds (updated_at desc) where deleted_at is null and visibility = 'public';
create trigger builds_updated_at before update on public.builds
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- mods

create table public.mods (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  vehicle_id uuid not null,
  name text not null check (char_length(name) between 1 and 120),
  category public.mod_category not null,
  brand text check (char_length(brand) <= 80),
  part_number text check (char_length(part_number) <= 80),
  -- Money in integer minor units (cents). Never floating point.
  cost_minor bigint check (cost_minor between 0 and 100000000000),
  currency char(3) check (currency in ('USD','CAD','GBP','EUR','AUD','NZD','JPY','MXN')),
  status public.mod_status not null default 'planned',
  -- Typed contract validated by the app/server (schema_version 1). DB checks the outer shape.
  spec_deltas jsonb not null default '{"schema_version":1}'::jsonb
    check (jsonb_typeof(spec_deltas) = 'object' and (spec_deltas ->> 'schema_version') = '1'),
  notes text check (char_length(notes) <= 4000),
  installed_on date check (installed_on between date '1900-01-01' and date '2100-12-31'),
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, owner_id),
  check ((cost_minor is null) = (currency is null)),
  foreign key (vehicle_id, owner_id) references public.vehicles (id, owner_id) on delete cascade
);
create index mods_vehicle_timeline_idx on public.mods (vehicle_id, created_at desc) where deleted_at is null;
create index mods_owner_idx on public.mods (owner_id);
create trigger mods_updated_at before update on public.mods
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- mod_photos

create table public.mod_photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  mod_id uuid not null,
  storage_path text not null unique,
  role public.photo_role not null default 'gallery',
  position smallint not null default 0 check (position between 0 and 11),
  mime text not null check (mime in ('image/jpeg','image/png','image/webp')),
  bytes integer not null check (bytes between 1 and 10485760),
  width integer check (width between 1 and 8000),
  height integer check (height between 1 and 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (mod_id, owner_id) references public.mods (id, owner_id) on delete cascade,
  check (storage_path like owner_id::text || '/%')
);
create unique index mod_photos_position_uq on public.mod_photos (mod_id, position) where deleted_at is null;
create index mod_photos_owner_idx on public.mod_photos (owner_id);
create trigger mod_photos_updated_at before update on public.mod_photos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- follows (user -> user)

create table public.follows (
  follower_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  followee_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id, created_at desc);

-- ---------------------------------------------------------------- build_follows (user -> build)

create table public.build_follows (
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  build_id uuid not null references public.builds (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, build_id)
);
create index build_follows_build_idx on public.build_follows (build_id, created_at desc);

-- ---------------------------------------------------------------- notifications (server-written)

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users (id) on delete cascade,
  category public.notification_category not null,
  entity_type text not null check (entity_type in ('user','build','mod','event','listing','subscription','botw')),
  entity_id text not null check (char_length(entity_id) between 1 and 64),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 200),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

-- ---------------------------------------------------------------- publishing gate
-- Public content needs a verified email. Enforced here so direct API calls can't skip it.

create function public.enforce_verified_publish() returns trigger
language plpgsql as $$
begin
  -- Applies to client roles. Trusted server code (service_role, migrations, seed) is not an end user.
  if current_user in ('anon', 'authenticated')
     and new.visibility = 'public'
     and (tg_op = 'INSERT' or old.visibility is distinct from 'public')
     and not public.current_user_verified() then
    raise exception 'email_not_verified' using errcode = 'P0001',
      hint = 'Verify your email before making anything public.';
  end if;
  return new;
end $$;
create trigger vehicles_verified_publish before insert or update of visibility on public.vehicles
  for each row execute function public.enforce_verified_publish();
create trigger builds_verified_publish before insert or update of visibility on public.builds
  for each row execute function public.enforce_verified_publish();

-- friends_only needs accepted relationships, which don't exist yet. Refuse it rather than
-- quietly treating a follow as friendship (handoff spec 6.3).
alter table public.vehicles add constraint vehicles_no_friends_only_yet check (visibility <> 'friends_only');
alter table public.builds add constraint builds_no_friends_only_yet check (visibility <> 'friends_only');
alter table public.users add constraint users_no_friends_only_yet check (default_visibility <> 'friends_only');

-- ---------------------------------------------------------------- public-safe views
-- These run with the view owner's rights (they read past owner-only RLS), so they ARE the
-- authorization for public reads. Each one is an explicit column allow-list plus the effective
-- visibility rule: a child is public only if it and every parent are public and not deleted.
-- No VIN, odometer, cost, notes, spec inputs, storage paths or owner UUIDs.

create view public.public_profiles with (security_barrier = true) as
  select u.id as user_id, u.username, u.display_name, u.bio, u.general_location,
         u.years_experience, u.build_goal, u.reputation, u.business_badge
  from public.users u
  where u.deleted_at is null;

create view public.public_vehicles with (security_barrier = true) as
  select v.id as vehicle_id, u.username as owner_username, v.year, v.make, v.model,
         v.trim_level, v.nickname, v.created_at
  from public.vehicles v
  join public.users u on u.id = v.owner_id and u.deleted_at is null
  where v.deleted_at is null and v.visibility = 'public';

create view public.public_builds with (security_barrier = true) as
  select b.id as build_id, b.vehicle_id, u.username as owner_username, b.title, b.description,
         b.updated_at
  from public.builds b
  join public.vehicles v on v.id = b.vehicle_id and v.deleted_at is null and v.visibility = 'public'
  join public.users u on u.id = b.owner_id and u.deleted_at is null
  where b.deleted_at is null and b.visibility = 'public';

create view public.public_mods with (security_barrier = true) as
  select m.id as mod_id, m.vehicle_id, pb.build_id, m.name, m.category, m.brand, m.part_number,
         m.status, m.installed_on, m.created_at
  from public.mods m
  join public.public_builds pb on pb.vehicle_id = m.vehicle_id
  where m.deleted_at is null;

revoke all on public.public_profiles, public.public_vehicles, public.public_builds, public.public_mods
  from anon, authenticated;
grant select on public.public_profiles, public.public_vehicles, public.public_builds, public.public_mods
  to anon, authenticated;

-- ---------------------------------------------------------------- owner-checked soft delete

create function public.soft_delete_vehicle(p_vehicle_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  update public.vehicles set deleted_at = now()
    where id = p_vehicle_id and owner_id = auth.uid() and deleted_at is null;
  get diagnostics n = row_count;
  if n = 0 then
    return false; -- same answer for "missing" and "not yours"
  end if;
  update public.builds set deleted_at = now() where vehicle_id = p_vehicle_id and deleted_at is null;
  update public.mod_photos set deleted_at = now()
    where deleted_at is null and mod_id in (select id from public.mods where vehicle_id = p_vehicle_id);
  update public.mods set deleted_at = now() where vehicle_id = p_vehicle_id and deleted_at is null;
  return true;
end $$;

create function public.soft_delete_mod(p_mod_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  update public.mods set deleted_at = now()
    where id = p_mod_id and owner_id = auth.uid() and deleted_at is null;
  get diagnostics n = row_count;
  if n = 0 then
    return false;
  end if;
  update public.mod_photos set deleted_at = now() where mod_id = p_mod_id and deleted_at is null;
  return true;
end $$;

revoke all on function public.soft_delete_vehicle(uuid), public.soft_delete_mod(uuid) from public, anon;
grant execute on function public.soft_delete_vehicle(uuid), public.soft_delete_mod(uuid) to authenticated;

-- ---------------------------------------------------------------- privileges

revoke all on public.users, public.vehicles, public.builds, public.mods, public.mod_photos,
  public.follows, public.build_follows, public.notifications from anon, authenticated;

grant select on public.users to authenticated;
grant insert (id, username, display_name, bio, general_location, years_experience, build_goal, default_visibility)
  on public.users to authenticated;
grant update (username, display_name, bio, general_location, years_experience, avatar_path, build_goal,
  onboarding_step, onboarding_completed_at, onboarding_skipped_at, default_visibility)
  on public.users to authenticated;

grant select on public.vehicles to authenticated;
grant insert (year, make, model, trim_level, nickname, vin, odometer, odometer_unit, description,
  baseline_hp, baseline_torque_lbft, baseline_weight_lb, baseline_zero_to_sixty_s, baseline_source,
  data_source, nhtsa_make_id, nhtsa_model_id, hero_path, visibility) on public.vehicles to authenticated;
grant update (year, make, model, trim_level, nickname, vin, odometer, odometer_unit, description,
  baseline_hp, baseline_torque_lbft, baseline_weight_lb, baseline_zero_to_sixty_s, baseline_source,
  data_source, nhtsa_make_id, nhtsa_model_id, hero_path, visibility) on public.vehicles to authenticated;

grant select on public.builds to authenticated;
grant insert (vehicle_id, title, description, visibility) on public.builds to authenticated;
grant update (title, description, visibility) on public.builds to authenticated;

grant select on public.mods to authenticated;
grant insert (vehicle_id, name, category, brand, part_number, cost_minor, currency, status, spec_deltas,
  notes, installed_on) on public.mods to authenticated;
grant update (name, category, brand, part_number, cost_minor, currency, status, spec_deltas, notes,
  installed_on) on public.mods to authenticated;

grant select on public.mod_photos to authenticated;
grant insert (mod_id, storage_path, role, position, mime, bytes, width, height) on public.mod_photos to authenticated;
grant update (role, position) on public.mod_photos to authenticated;

grant select, insert (followee_id), delete on public.follows to authenticated;
grant select, insert (build_id), delete on public.build_follows to authenticated;

grant select, update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------- row-level security

alter table public.users enable row level security;
alter table public.vehicles enable row level security;
alter table public.builds enable row level security;
alter table public.mods enable row level security;
alter table public.mod_photos enable row level security;
alter table public.follows enable row level security;
alter table public.build_follows enable row level security;
alter table public.notifications enable row level security;

-- users: you see and edit only your own row. Other people's profiles come from public_profiles.
create policy users_select_own on public.users for select to authenticated
  using (id = auth.uid() and deleted_at is null);
create policy users_insert_own on public.users for insert to authenticated
  with check (id = auth.uid());
create policy users_update_own on public.users for update to authenticated
  using (id = auth.uid() and deleted_at is null) with check (id = auth.uid());

-- vehicles / builds / mods / mod_photos: owner-only. owner_id defaults to auth.uid() and the
-- check forbids anything else; composite FKs bind children to the same owner.
create policy vehicles_owner_select on public.vehicles for select to authenticated
  using (owner_id = auth.uid() and deleted_at is null);
create policy vehicles_owner_insert on public.vehicles for insert to authenticated
  with check (owner_id = auth.uid());
create policy vehicles_owner_update on public.vehicles for update to authenticated
  using (owner_id = auth.uid() and deleted_at is null) with check (owner_id = auth.uid());

create policy builds_owner_select on public.builds for select to authenticated
  using (owner_id = auth.uid() and deleted_at is null);
create policy builds_owner_insert on public.builds for insert to authenticated
  with check (owner_id = auth.uid());
create policy builds_owner_update on public.builds for update to authenticated
  using (owner_id = auth.uid() and deleted_at is null) with check (owner_id = auth.uid());

create policy mods_owner_select on public.mods for select to authenticated
  using (owner_id = auth.uid() and deleted_at is null);
create policy mods_owner_insert on public.mods for insert to authenticated
  with check (owner_id = auth.uid());
create policy mods_owner_update on public.mods for update to authenticated
  using (owner_id = auth.uid() and deleted_at is null) with check (owner_id = auth.uid());

create policy mod_photos_owner_select on public.mod_photos for select to authenticated
  using (owner_id = auth.uid() and deleted_at is null);
create policy mod_photos_owner_insert on public.mod_photos for insert to authenticated
  with check (owner_id = auth.uid());
create policy mod_photos_owner_update on public.mod_photos for update to authenticated
  using (owner_id = auth.uid() and deleted_at is null) with check (owner_id = auth.uid());

-- No DELETE policies on content tables: deletion is soft and goes through the functions below.

-- follows: you can see edges you are part of, create your own, remove your own.
create policy follows_select_mine on public.follows for select to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid());
create policy follows_insert_mine on public.follows for insert to authenticated
  with check (
    follower_id = auth.uid()
    and exists (select 1 from public.public_profiles p where p.user_id = followee_id)
  );
create policy follows_delete_mine on public.follows for delete to authenticated
  using (follower_id = auth.uid());

-- build_follows: only public builds can be followed.
create policy build_follows_select on public.build_follows for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.builds b where b.id = build_id and b.owner_id = auth.uid()));
create policy build_follows_insert on public.build_follows for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.public_builds pb where pb.build_id = build_follows.build_id));
create policy build_follows_delete on public.build_follows for delete to authenticated
  using (user_id = auth.uid());

-- notifications: read and mark-read your own. Inserts come only from trusted server code.
create policy notifications_select_own on public.notifications for select to authenticated
  using (recipient_id = auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
