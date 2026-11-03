-- Dynorex Phase 4: sharing and social.
-- Public build pages (server projection + specs), publish/share checks, build follows, notifications
-- (in-app inbox, preferences, push tokens, push queue), Discover (trending / new / for you / nearby),
-- search, home feed, moderation hand-off, and Build of the Week (schema only, switched off).
--
-- The visibility rule stays in ONE place: the public_* views. Every public read below goes through
-- them, so blocks, moderation hides, deletion and private parents apply to feeds, search, Discover,
-- notifications and media the same way they apply to detail pages.

-- ---------------------------------------------------------------- moderation hides (server only)
-- Set only by apply_moderation(); no client column grants, so owners can't un-hide themselves.

alter table public.users add column hidden_at timestamptz;
alter table public.vehicles add column hidden_at timestamptz;
alter table public.mods add column hidden_at timestamptz;

-- ---------------------------------------------------------------- public views, v2
-- Same columns as before, in the same order, with new columns appended. New rule: moderation-hidden
-- rows and owners are excluded. Counts are computed here (view owner rights) so clients never need
-- to read other people's follow rows.

create or replace view public.public_profiles with (security_barrier = true) as
  select u.id as user_id, u.username, u.display_name, u.bio, u.general_location,
         u.years_experience, u.build_goal, u.reputation, u.business_badge,
         (select count(*) from public.follows f where f.followee_id = u.id) as followers_count,
         (select count(*) from public.follows f where f.follower_id = u.id) as following_count
  from public.users u
  where u.deleted_at is null and u.hidden_at is null and u.username is not null
    and not public.is_blocked_with(u.id);

create or replace view public.public_vehicles with (security_barrier = true) as
  select v.id as vehicle_id, u.username as owner_username, v.year, v.make, v.model,
         v.trim_level, v.nickname, v.created_at,
         (v.hero_path is not null) as has_hero
  from public.vehicles v
  join public.users u on u.id = v.owner_id and u.deleted_at is null and u.hidden_at is null
    and u.username is not null
  where v.deleted_at is null and v.hidden_at is null and v.visibility = 'public'
    and not public.is_blocked_with(v.owner_id);

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
           as last_activity_at
  from public.builds b
  join public.vehicles v on v.id = b.vehicle_id and v.deleted_at is null and v.hidden_at is null
    and v.visibility = 'public'
  join public.users u on u.id = b.owner_id and u.deleted_at is null and u.hidden_at is null
    and u.username is not null
  where b.deleted_at is null and b.visibility = 'public' and not public.is_blocked_with(b.owner_id);

create or replace view public.public_mods with (security_barrier = true) as
  select m.id as mod_id, m.vehicle_id, pb.build_id, m.name, m.category, m.brand, m.part_number,
         m.status, m.installed_on, m.created_at
  from public.mods m
  join public.public_builds pb on pb.vehicle_id = m.vehicle_id
  where m.deleted_at is null and m.hidden_at is null;

-- Photo ids only. Storage paths stay private; the public-media Edge Function signs them after it has
-- re-checked this view as the caller.
create view public.public_mod_photos with (security_barrier = true) as
  select p.id as photo_id, p.mod_id, pm.vehicle_id, p.role, p.position, p.width, p.height
  from public.mod_photos p
  join public.public_mods pm on pm.mod_id = p.mod_id
  where p.deleted_at is null;

revoke all on public.public_mod_photos from anon, authenticated;
grant select on public.public_mod_photos to anon, authenticated;

-- ---------------------------------------------------------------- publishing a build
-- One build per vehicle. The vehicle's visibility is the single sharing switch: publish_build()
-- creates the build row if needed and sets both. It runs as the caller, so RLS, the verified-email
-- and username publish gate, and ownership all apply.

create function public.publish_build(p_vehicle_id uuid, p_public boolean) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_title text;
  v_vis public.visibility := case when p_public then 'public' else 'private' end;
  v_build uuid;
begin
  select left(coalesce(nullif(trim(v.nickname), ''), v.year || ' ' || v.make || ' ' || v.model), 80)
    into v_title from public.vehicles v where v.id = p_vehicle_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.vehicles set visibility = v_vis where id = p_vehicle_id and visibility is distinct from v_vis;
  insert into public.builds (vehicle_id, title, visibility) values (p_vehicle_id, v_title, v_vis)
    on conflict (vehicle_id) do update set visibility = excluded.visibility
    returning id into v_build;
  return v_build;
end $$;
revoke all on function public.publish_build(uuid, boolean) from public, anon;
grant execute on function public.publish_build(uuid, boolean) to authenticated;

-- Keep an existing build in step when the vehicle form changes visibility. Making the vehicle private
-- always hides the build; making it public re-publishes a build that already exists.
create function public.sync_build_visibility() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.builds set visibility = new.visibility
    where vehicle_id = new.id and deleted_at is null and visibility is distinct from new.visibility;
  return new;
end $$;
create trigger vehicles_sync_build_visibility after update of visibility on public.vehicles
  for each row execute function public.sync_build_visibility();

-- Share check: the link is only handed out for a build that is public right now (as this viewer
-- sees it). 30 per hour per signed-in user. Returns the canonical path; the app adds the domain.
create function public.share_build_link(p_vehicle_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform public.enforce_rate_limit('share_link', 30, 3600);
  if not exists (select 1 from public.public_builds pb where pb.vehicle_id = p_vehicle_id) then
    raise exception 'not_shareable' using errcode = 'P0001',
      hint = 'Only public builds can be shared.';
  end if;
  return '/build/' || p_vehicle_id::text;
end $$;
revoke all on function public.share_build_link(uuid) from public;
grant execute on function public.share_build_link(uuid) to anon, authenticated;

-- What a public page should say. 'gone' only for something that WAS public and has been deleted;
-- private, hidden, blocked and never-existed all answer 'not_found', so existence never leaks.
create function public.public_build_status(p_vehicle_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.public_builds pb where pb.vehicle_id = p_vehicle_id) then 'public'
    when exists (select 1 from public.vehicles v
                 where v.id = p_vehicle_id and v.deleted_at is not null and v.visibility = 'public'
                   and v.hidden_at is null) then 'gone'
    else 'not_found'
  end
$$;
revoke all on function public.public_build_status(uuid) from public;
grant execute on function public.public_build_status(uuid) to anon, authenticated;

-- Spec estimate for a public build: the same server formula, current estimate only (pending changes
-- and baseline inputs stay private). Empty for anything that isn't public to this viewer.
create function public.public_build_specs(p_vehicle_id uuid)
returns table (
  hp numeric, hp_status text, torque_lbft numeric, torque_status text, weight_lb numeric, weight_status text,
  zero_to_sixty_s numeric, zero_to_sixty_status text, lb_per_hp numeric, lb_per_hp_status text,
  completed_mods_counted integer
)
language sql stable security definer set search_path = '' as $$
  select e.hp, e.hp_status, e.torque_lbft, e.torque_status, e.weight_lb, e.weight_status,
         e.zero_to_sixty_s, e.zero_to_sixty_status, e.lb_per_hp, e.lb_per_hp_status, e.completed_mods_counted
  from public.vehicle_spec_estimate(p_vehicle_id) e
  where exists (select 1 from public.public_builds pb where pb.vehicle_id = p_vehicle_id)
$$;
revoke all on function public.public_build_specs(uuid) from public;
grant execute on function public.public_build_specs(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- build follows
-- 100 follows per hour, shared with user follows. You can't follow your own build.

create trigger build_follows_rate_limit before insert on public.build_follows
  for each row execute function public.rate_limit_trigger('follow', '100', '3600');

drop policy build_follows_insert on public.build_follows;
create policy build_follows_insert on public.build_follows for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.current_user_has_username()
    and exists (select 1 from public.public_builds pb where pb.build_id = build_follows.build_id)
    and not exists (select 1 from public.builds b where b.id = build_follows.build_id and b.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------- notifications
-- Written only by the triggers below (server side). Payloads hold public facts only: a public
-- username and a public build title. Never a VIN, cost, note, location, token or private name.

alter table public.notifications
  add column actor_id uuid references public.users (id) on delete cascade,
  add column push_sent_at timestamptz;
create index notifications_push_pending_idx on public.notifications (created_at) where push_sent_at is null;
create index notifications_dedupe_idx on public.notifications (recipient_id, category, entity_id, created_at desc);

-- People you've blocked (or who blocked you) disappear from your inbox too.
drop policy notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated
  using (recipient_id = auth.uid() and (actor_id is null or not public.is_blocked_with(actor_id)));

create function public.mark_all_notifications_read() returns integer
language sql security invoker set search_path = '' as $$
  with u as (
    update public.notifications set read_at = now() where recipient_id = auth.uid() and read_at is null returning 1
  ) select count(*)::integer from u
$$;
revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- Preferences: one row per category the person has changed; no row = on.
create table public.notification_prefs (
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  category public.notification_category not null,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);
revoke all on public.notification_prefs from anon, authenticated;
grant select on public.notification_prefs to authenticated;
alter table public.notification_prefs enable row level security;
create policy notification_prefs_own on public.notification_prefs for select to authenticated
  using (user_id = auth.uid());

create function public.set_notification_pref(p_category public.notification_category, p_enabled boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign_in_required' using errcode = 'P0001';
  end if;
  insert into public.notification_prefs (user_id, category, enabled) values (auth.uid(), p_category, p_enabled)
    on conflict (user_id, category) do update set enabled = excluded.enabled, updated_at = now();
  return p_enabled;
end $$;
revoke all on function public.set_notification_pref(public.notification_category, boolean) from public, anon;
grant execute on function public.set_notification_pref(public.notification_category, boolean) to authenticated;

create function public.notification_enabled(p_user uuid, p_category public.notification_category)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.enabled from public.notification_prefs p
                   where p.user_id = p_user and p.category = p_category), true)
$$;
revoke all on function public.notification_enabled(uuid, public.notification_category) from public, anon, authenticated;

-- New follower. One per follower per day, so unfollow/refollow can't spam someone.
create function public.notify_new_follower() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  select u.username into v_name from public.users u
    where u.id = new.follower_id and u.username is not null and u.deleted_at is null and u.hidden_at is null;
  if v_name is null
     or not public.notification_enabled(new.followee_id, 'new_follower')
     or exists (select 1 from public.mutes m where m.muter_id = new.followee_id and m.muted_id = new.follower_id)
     or exists (select 1 from public.notifications n
                where n.recipient_id = new.followee_id and n.category = 'new_follower'
                  and n.actor_id = new.follower_id and n.created_at > now() - interval '1 day') then
    return new;
  end if;
  insert into public.notifications (recipient_id, actor_id, category, entity_type, entity_id, title, body)
    values (new.followee_id, new.follower_id, 'new_follower', 'user', v_name,
            'New follower', format('@%s started following you.', v_name));
  return new;
end $$;
create trigger follows_notify after insert on public.follows
  for each row execute function public.notify_new_follower();

-- Build update: a mod added to a PUBLIC build tells that build's followers, at most once per build per
-- hour per follower. The mod's own name, cost and notes are not included.
create function public.notify_build_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_build uuid;
  v_title text;
  v_owner text;
begin
  select b.id, b.title, u.username into v_build, v_title, v_owner
  from public.builds b
  join public.vehicles v on v.id = b.vehicle_id
  join public.users u on u.id = b.owner_id
  where b.vehicle_id = new.vehicle_id
    and b.deleted_at is null and b.visibility = 'public'
    and v.deleted_at is null and v.hidden_at is null and v.visibility = 'public'
    and u.deleted_at is null and u.hidden_at is null and u.username is not null;
  if v_build is null then
    return new;
  end if;
  insert into public.notifications (recipient_id, actor_id, category, entity_type, entity_id, title, body)
  select bf.user_id, new.owner_id, 'build_update', 'build', new.vehicle_id::text, 'Build update',
         format('@%s added a mod to %s.', v_owner, v_title)
  from public.build_follows bf
  where bf.build_id = v_build
    and bf.user_id <> new.owner_id
    and public.notification_enabled(bf.user_id, 'build_update')
    and not exists (select 1 from public.mutes m where m.muter_id = bf.user_id and m.muted_id = new.owner_id)
    and not exists (select 1 from public.blocks k
                    where (k.blocker_id = bf.user_id and k.blocked_id = new.owner_id)
                       or (k.blocker_id = new.owner_id and k.blocked_id = bf.user_id))
    and not exists (select 1 from public.notifications n
                    where n.recipient_id = bf.user_id and n.category = 'build_update'
                      and n.entity_id = new.vehicle_id::text and n.created_at > now() - interval '1 hour');
  return new;
end $$;
create trigger mods_notify_build_update after insert on public.mods
  for each row execute function public.notify_build_update();

-- ---------------------------------------------------------------- push tokens and push queue
-- Tokens live in app_private: clients can only register/unregister their own through these functions.
-- A token moves to whoever registered it last (shared device, new account).

create table app_private.push_tokens (
  token text primary key check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$'),
  user_id uuid not null references public.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_tokens_user_idx on app_private.push_tokens (user_id);

create function public.register_push_token(p_token text, p_platform text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign_in_required' using errcode = 'P0001';
  end if;
  perform public.enforce_rate_limit('push_token', 20, 3600);
  insert into app_private.push_tokens (token, user_id, platform) values (p_token, auth.uid(), p_platform)
    on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
  return true;
end $$;
create function public.unregister_push_token(p_token text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from app_private.push_tokens where token = p_token and user_id = auth.uid();
  get diagnostics n = row_count;
  return n > 0;
end $$;
create function public.my_push_status() returns table (devices integer)
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from app_private.push_tokens where user_id = auth.uid()
$$;
revoke all on function public.register_push_token(text, text), public.unregister_push_token(text),
  public.my_push_status() from public, anon;
grant execute on function public.register_push_token(text, text), public.unregister_push_token(text),
  public.my_push_status() to authenticated;

-- The push-dispatch Edge Function (service role) claims unsent notifications in batches. Each row is
-- claimed once (skip locked), so overlapping runs never double-send. Notifications older than a day
-- are never pushed.
create function public.claim_pending_pushes(p_limit integer default 100)
returns table (notification_id uuid, token text, title text, body text, category text, entity_type text, entity_id text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with picked as (
    select n.id from public.notifications n
    where n.push_sent_at is null and n.created_at > now() - interval '1 day'
    order by n.created_at
    limit least(greatest(p_limit, 1), 500)
    for update skip locked
  ), claimed as (
    update public.notifications n set push_sent_at = now()
    from picked where n.id = picked.id
    returning n.id, n.recipient_id, n.title, n.body, n.category, n.entity_type, n.entity_id, n.read_at
  )
  select c.id, t.token, c.title, c.body, c.category::text, c.entity_type, c.entity_id
  from claimed c join app_private.push_tokens t on t.user_id = c.recipient_id
  where c.read_at is null;
end $$;
create function public.drop_push_token(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from app_private.push_tokens where token = p_token
$$;
revoke all on function public.claim_pending_pushes(integer), public.drop_push_token(text) from public, anon, authenticated;
grant execute on function public.claim_pending_pushes(integer), public.drop_push_token(text) to service_role;

-- ---------------------------------------------------------------- home feed
-- Recent public mods from builds you follow and from people you follow, minus anyone you've muted.
-- Runs as the caller: it can only see public views and your own follow/mute rows.

create function public.home_feed(p_page integer default 0)
returns table (mod_id uuid, vehicle_id uuid, build_title text, owner_username text, mod_name text,
               category public.mod_category, status public.mod_status, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select pm.mod_id, pm.vehicle_id, pb.title, pb.owner_username, pm.name, pm.category, pm.status, pm.created_at
  from public.public_mods pm
  join public.public_builds pb on pb.build_id = pm.build_id
  join public.public_profiles owner on owner.username = pb.owner_username
  where (pb.build_id in (select bf.build_id from public.build_follows bf where bf.user_id = auth.uid())
         or owner.user_id in (select f.followee_id from public.follows f where f.follower_id = auth.uid()))
    and owner.user_id not in (select m.muted_id from public.mutes m where m.muter_id = auth.uid())
  order by pm.created_at desc, pm.mod_id
  limit 20 offset least(greatest(p_page, 0), 50) * 20
$$;
revoke all on function public.home_feed(integer) from public, anon;
grant execute on function public.home_feed(integer) to authenticated;

-- ---------------------------------------------------------------- discover
-- Ranking happens here, from server data only; the client picks a mode and a page, nothing else.
--   new      most recent activity
--   trending 3 x follows in the last 7 days + public mods added in the last 14 days + 0.25 x followers
--   for_you  builds by owners with the same build goal as you first, then trending
-- Muted owners and your own builds are left out.

create function public.discover_builds(p_mode text default 'trending', p_page integer default 0)
returns setof public.public_builds
language plpgsql stable security definer set search_path = '' as $$
declare
  v_goal public.build_goal;
begin
  if p_mode not in ('trending', 'new', 'for_you') then
    raise exception 'invalid_mode' using errcode = '22023';
  end if;
  select u.build_goal into v_goal from public.users u where u.id = auth.uid();
  return query
  select pb.*
  from public.public_builds pb
  join public.users o on o.username = pb.owner_username
  where o.id is distinct from auth.uid()
    and not exists (select 1 from public.mutes m where m.muter_id = auth.uid() and m.muted_id = o.id)
  order by
    case when p_mode = 'for_you' and v_goal is not null and v_goal <> 'just_browsing' and o.build_goal = v_goal
         then 0 else 1 end,
    case when p_mode = 'new' then 0
         else -(3 * (select count(*) from public.build_follows bf
                     where bf.build_id = pb.build_id and bf.created_at > now() - interval '7 days')
                + (select count(*) from public.public_mods pm
                   where pm.build_id = pb.build_id and pm.created_at > now() - interval '14 days')
                + 0.25 * pb.followers_count)
    end,
    pb.last_activity_at desc nulls last,
    pb.build_id
  limit 20 offset least(greatest(p_page, 0), 50) * 20;
end $$;
revoke all on function public.discover_builds(text, integer) from public;
grant execute on function public.discover_builds(text, integer) to anon, authenticated;

-- ---------------------------------------------------------------- nearby (opt-in, coarse)
-- The device rounds its position to a 0.5-degree grid cell (roughly 55 km) and sends ONLY the cell
-- numbers. No coordinates are stored or returned. Nearby shows public builds from people who also
-- opted in and are within one cell, with no distance and no ordering by distance, and only when at
-- least 3 other owners qualify (otherwise the app falls back to trending). Regions expire after 30
-- days, can be cleared at any time, and can be set at most 10 times a day to slow down probing.

create table app_private.user_regions (
  user_id uuid primary key references public.users (id) on delete cascade,
  cell_lat smallint not null check (cell_lat between -180 and 179),
  cell_lon smallint not null check (cell_lon between -360 and 359),
  share_builds boolean not null default false,
  updated_at timestamptz not null default now()
);

create function public.set_my_region(p_cell_lat integer, p_cell_lon integer, p_share_builds boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign_in_required' using errcode = 'P0001';
  end if;
  perform public.enforce_rate_limit('region', 10, 86400);
  insert into app_private.user_regions (user_id, cell_lat, cell_lon, share_builds)
    values (auth.uid(), p_cell_lat, p_cell_lon, p_share_builds)
    on conflict (user_id) do update set cell_lat = excluded.cell_lat, cell_lon = excluded.cell_lon,
      share_builds = excluded.share_builds, updated_at = now();
  return true;
end $$;
create function public.clear_my_region() returns boolean
language sql security definer set search_path = '' as $$
  with d as (delete from app_private.user_regions where user_id = auth.uid() returning 1)
  select count(*) > 0 from d
$$;
-- Whether nearby is on for me; never returns the cell.
create function public.my_region() returns table (enabled boolean, share_builds boolean, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select true, r.share_builds, r.updated_at from app_private.user_regions r
  where r.user_id = auth.uid() and r.updated_at > now() - interval '30 days'
$$;

create function public.nearby_builds(p_page integer default 0)
returns setof public.public_builds
language plpgsql stable security definer set search_path = '' as $$
declare
  me app_private.user_regions;
  v_owners uuid[];
begin
  select * into me from app_private.user_regions r
    where r.user_id = auth.uid() and r.updated_at > now() - interval '30 days';
  if not found then
    return;
  end if;
  select array_agg(r.user_id) into v_owners
    from app_private.user_regions r
    join public.users o on o.id = r.user_id
    where r.share_builds and r.user_id <> auth.uid() and r.updated_at > now() - interval '30 days'
      and abs(r.cell_lat - me.cell_lat) <= 1 and abs(r.cell_lon - me.cell_lon) <= 1
      and exists (select 1 from public.public_builds pb where pb.owner_username = o.username)
      and not exists (select 1 from public.mutes m where m.muter_id = auth.uid() and m.muted_id = r.user_id);
  if coalesce(cardinality(v_owners), 0) < 3 then
    return;
  end if;
  return query
  select pb.* from public.public_builds pb
  join public.users o on o.username = pb.owner_username
  where o.id = any (v_owners)
  order by pb.last_activity_at desc nulls last, pb.build_id
  limit 20 offset least(greatest(p_page, 0), 50) * 20;
end $$;
revoke all on function public.set_my_region(integer, integer, boolean), public.clear_my_region(),
  public.my_region(), public.nearby_builds(integer) from public, anon;
grant execute on function public.set_my_region(integer, integer, boolean), public.clear_my_region(),
  public.my_region(), public.nearby_builds(integer) to authenticated;

-- ---------------------------------------------------------------- search
-- Full-text (simple dictionary, prefix matching) over the PUBLIC views only, so a private build can
-- never match. Signed-in only, 60 queries a minute. Query text is reduced to at most 5 alphanumeric
-- words before it reaches tsquery, so it can't inject operators.
-- Ranking: exact match first, then more followers, then most recent.

-- Text is reduced to lowercase alphanumeric words on both sides (index and query), so "SB-100",
-- "sb 100" and "sb100"-style prefixes all tokenise the same way.
create function public.search_doc(t text) returns tsvector
language sql immutable parallel safe set search_path = '' as $$
  select to_tsvector('simple'::regconfig, regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', ' ', 'g'))
$$;

create index vehicles_search_idx on public.vehicles
  using gin (public.search_doc(make || ' ' || model || ' ' || year::text));
create index builds_search_idx on public.builds using gin (public.search_doc(title));
create index users_search_idx on public.users
  using gin (public.search_doc(coalesce(username, '') || ' ' || coalesce(display_name, '')));
create index mods_search_idx on public.mods
  using gin (public.search_doc(name || ' ' || coalesce(brand, '') || ' ' || coalesce(part_number, '')));

create function public.search_public(p_query text)
returns table (kind text, id uuid, vehicle_id uuid, label text, sublabel text, has_hero boolean,
               exact boolean, followers bigint, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_words text[];
  v_q text;
  v_ts tsquery;
begin
  if auth.uid() is null then
    raise exception 'sign_in_required' using errcode = 'P0001';
  end if;
  select array_agg(w) into v_words from (
    select left(m[1], 30) as w from regexp_matches(lower(coalesce(p_query, '')), '[a-z0-9]+', 'g') as m limit 5
  ) s;
  v_q := array_to_string(v_words, ' ');
  if v_q is null or char_length(v_q) < 2 then
    return;
  end if;
  perform public.enforce_rate_limit('search', 60, 60);
  v_ts := to_tsquery('simple', (select string_agg(w || ':*', ' & ') from unnest(v_words) w));

  return query
  (select 'build'::text, pb.build_id, pb.vehicle_id, pb.title,
          pb.year || ' ' || pb.make || ' ' || pb.model || ' · @' || pb.owner_username,
          pb.has_hero,
          (lower(pb.make) = v_q or lower(pb.model) = v_q or pb.owner_username = v_q or lower(pb.title) = v_q
           or lower(pb.make || ' ' || pb.model) = v_q or pb.year::text = v_q),
          pb.followers_count, pb.last_activity_at
   from public.public_builds pb
   join public.users o on o.username = pb.owner_username
   where public.search_doc(pb.title || ' ' || pb.make || ' ' || pb.model || ' ' || pb.year::text || ' '
                           || pb.owner_username) @@ v_ts
     and not exists (select 1 from public.mutes m where m.muter_id = auth.uid() and m.muted_id = o.id)
   order by 7 desc, 8 desc, 9 desc nulls last
   limit 10)
  union all
  (select 'user'::text, p.user_id, null::uuid, '@' || p.username, coalesce(p.display_name, ''), false,
          (p.username = v_q or lower(coalesce(p.display_name, '')) = v_q),
          p.followers_count, null::timestamptz
   from public.public_profiles p
   where public.search_doc(p.username || ' ' || coalesce(p.display_name, '')) @@ v_ts
     and not exists (select 1 from public.mutes m where m.muter_id = auth.uid() and m.muted_id = p.user_id)
   order by 7 desc, 8 desc
   limit 10)
  union all
  (select 'mod'::text, pm.mod_id, pm.vehicle_id, pm.name,
          pb.title || ' · @' || pb.owner_username,
          pb.has_hero,
          (lower(pm.name) = v_q or lower(coalesce(pm.brand, '')) = v_q or lower(coalesce(pm.part_number, '')) = v_q),
          pb.followers_count, pm.created_at
   from public.public_mods pm
   join public.public_builds pb on pb.build_id = pm.build_id
   join public.users o on o.username = pb.owner_username
   where public.search_doc(pm.name || ' ' || coalesce(pm.brand, '') || ' ' || coalesce(pm.part_number, '')) @@ v_ts
     and not exists (select 1 from public.mutes m where m.muter_id = auth.uid() and m.muted_id = o.id)
   order by 7 desc, 8 desc, 9 desc
   limit 10);
end $$;
revoke all on function public.search_public(text) from public, anon;
grant execute on function public.search_public(text) to authenticated;

-- ---------------------------------------------------------------- moderation hand-off
-- Reports land in public.reports (Phase 2). Moderators act through this one function, called by
-- trusted server code with the service role. Every action writes an append-only audit row with the
-- state before and after. Only people listed in app_private.moderators can be named as moderator.

create table app_private.moderators (
  user_id uuid primary key references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create function public.apply_moderation(
  p_moderator uuid, p_action text, p_target_type text, p_target_id uuid, p_report_id uuid, p_reason text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_prior jsonb;
  v_result jsonb;
  v_vehicle uuid;
  v_hide timestamptz := case when p_action = 'hide_content' then now() end;
  v_audit uuid;
begin
  if not exists (select 1 from app_private.moderators m where m.user_id = p_moderator) then
    raise exception 'not_a_moderator' using errcode = '42501';
  end if;
  if p_action not in ('hide_content', 'restore_content', 'dismiss_report') then
    raise exception 'unsupported_action' using errcode = '22023';
  end if;

  if p_action = 'dismiss_report' then
    select jsonb_build_object('status', r.status) into v_prior from public.reports r where r.id = p_report_id;
    if v_prior is null then
      raise exception 'report_not_found' using errcode = 'P0002';
    end if;
    update public.reports set status = 'dismissed' where id = p_report_id;
    v_result := jsonb_build_object('status', 'dismissed');
    p_target_type := 'report';
    p_target_id := p_report_id;
  else
    case p_target_type
      when 'user' then
        select jsonb_build_object('hidden_at', u.hidden_at) into v_prior from public.users u where u.id = p_target_id;
        update public.users set hidden_at = v_hide where id = p_target_id;
      when 'vehicle', 'build' then
        v_vehicle := case when p_target_type = 'vehicle' then p_target_id
                          else (select b.vehicle_id from public.builds b where b.id = p_target_id) end;
        select jsonb_build_object('hidden_at', v.hidden_at) into v_prior from public.vehicles v where v.id = v_vehicle;
        update public.vehicles set hidden_at = v_hide where id = v_vehicle;
      when 'mod' then
        select jsonb_build_object('hidden_at', m.hidden_at) into v_prior from public.mods m where m.id = p_target_id;
        update public.mods set hidden_at = v_hide where id = p_target_id;
      else
        raise exception 'unsupported_target' using errcode = '22023';
    end case;
    if v_prior is null then
      raise exception 'target_not_found' using errcode = 'P0002';
    end if;
    v_result := jsonb_build_object('hidden', p_action = 'hide_content');
    if p_report_id is not null then
      update public.reports set status = 'actioned' where id = p_report_id;
    end if;
  end if;

  insert into public.admin_moderation (moderator_id, action, target_type, target_id, report_id, reason,
                                       prior_state, result_state)
    values (p_moderator, p_action, p_target_type, p_target_id, p_report_id, p_reason, v_prior, v_result)
    returning id into v_audit;
  return v_audit;
end $$;
revoke all on function public.apply_moderation(uuid, text, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.apply_moderation(uuid, text, text, uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------- Build of the Week (OFF)
-- Schema and the server selection boundary only. Selection refuses to run until an operator turns
-- the 'build_of_the_week' setting on, which must wait for anti-fraud review and an owner for the
-- weekly process. Clients can never write selections; the public view is empty while it's off.

create table app_private.feature_settings (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into app_private.feature_settings (key, enabled) values ('build_of_the_week', false);

create table public.build_of_the_week (
  week_start date primary key check (extract(isodow from week_start) = 1),
  build_id uuid not null references public.builds (id) on delete cascade,
  selected_by uuid not null,
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);
revoke all on public.build_of_the_week from anon, authenticated;
alter table public.build_of_the_week enable row level security;
-- no policies: only server code (service role) touches the table

create function public.select_build_of_the_week(p_week date, p_build uuid, p_moderator uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce((select s.enabled from app_private.feature_settings s where s.key = 'build_of_the_week'), false) then
    raise exception 'botw_disabled' using errcode = 'P0001';
  end if;
  if not exists (select 1 from app_private.moderators m where m.user_id = p_moderator) then
    raise exception 'not_a_moderator' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.builds b
    join public.vehicles v on v.id = b.vehicle_id
    join public.users u on u.id = b.owner_id
    where b.id = p_build and b.deleted_at is null and b.visibility = 'public'
      and v.deleted_at is null and v.hidden_at is null and v.visibility = 'public'
      and u.deleted_at is null and u.hidden_at is null and u.username is not null
  ) then
    raise exception 'build_not_public' using errcode = 'P0001';
  end if;
  insert into public.build_of_the_week (week_start, build_id, selected_by, reason)
    values (p_week, p_build, p_moderator, p_reason);
  insert into public.admin_moderation (moderator_id, action, target_type, target_id, reason, result_state)
    values (p_moderator, 'feature_build', 'build', p_build, p_reason, jsonb_build_object('week_start', p_week));
end $$;
revoke all on function public.select_build_of_the_week(date, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.select_build_of_the_week(date, uuid, uuid, text) to service_role;

create view public.public_build_of_the_week with (security_barrier = true) as
  select w.week_start, pb.build_id, pb.vehicle_id, pb.owner_username, pb.title, pb.year, pb.make, pb.model, pb.has_hero
  from public.build_of_the_week w
  join public.public_builds pb on pb.build_id = w.build_id
  where exists (select 1 from app_private.feature_settings s where s.key = 'build_of_the_week' and s.enabled)
  order by w.week_start desc
  limit 1;
revoke all on public.public_build_of_the_week from anon, authenticated;
grant select on public.public_build_of_the_week to anon, authenticated;
