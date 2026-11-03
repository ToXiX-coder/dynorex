-- Dynorex Phase 2: profiles at sign-up, username gate, blocks, mutes, reports, moderation audit,
-- server-side write rate limits.

-- ---------------------------------------------------------------- profile created at sign-up
-- Sign-up collects only email + password, so the profile row is created by a trigger with no
-- username. The app asks for a username right after email verification. Clients can no longer
-- insert profile rows themselves.

alter table public.users alter column username drop not null;
drop policy users_insert_own on public.users;
revoke insert on public.users from authenticated;

create function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Plain text only: no control characters in user-written profile text.
alter table public.users
  add constraint users_text_clean check (
    coalesce(display_name, '') !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
    and coalesce(bio, '') !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
    and coalesce(general_location, '') !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
  );

create function public.current_user_has_username() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select u.username is not null from public.users u where u.id = auth.uid()), false)
$$;
revoke all on function public.current_user_has_username() from public, anon;
grant execute on function public.current_user_has_username() to authenticated;

-- Answers only "is this name free and allowed". Usernames are public anyway (public_profiles).
create function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_username ~ '^[a-z0-9_]{3,20}$'
     and not public.is_reserved_username(p_username)
     and not exists (select 1 from public.users u where u.username = p_username)
$$;
revoke all on function public.username_available(text) from public, anon;
grant execute on function public.username_available(text) to authenticated;

-- Publishing now also needs a username (a public build must have a public owner name).
create or replace function public.enforce_verified_publish() returns trigger
language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated')
     and new.visibility = 'public'
     and (tg_op = 'INSERT' or old.visibility is distinct from 'public') then
    if not public.current_user_verified() then
      raise exception 'email_not_verified' using errcode = 'P0001',
        hint = 'Verify your email before making anything public.';
    end if;
    if not public.current_user_has_username() then
      raise exception 'username_required' using errcode = 'P0001',
        hint = 'Pick a username before making anything public.';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- rate limits (server-side)
-- Counts recent actions per user in a private table clients can't see. Spec section 13 limits.
-- Raises 'rate_limited'; the app shows the "Slow down" copy. (PostgREST returns HTTP 400 for this,
-- not 429; Edge Functions that wrap writes return 429 + Retry-After.)

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table app_private.rate_events (
  user_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index rate_events_lookup on app_private.rate_events (user_id, action, created_at desc);

create function public.enforce_rate_limit(p_action text, p_max integer, p_window_seconds integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if auth.uid() is null then
    return; -- trusted server paths (no end user) are not rate limited here
  end if;
  delete from app_private.rate_events
    where user_id = auth.uid() and created_at < now() - interval '1 day';
  select count(*) into n from app_private.rate_events
    where user_id = auth.uid() and action = p_action
      and created_at > now() - make_interval(secs => p_window_seconds);
  if n >= p_max then
    raise exception 'rate_limited' using errcode = 'P0001',
      hint = format('retry_after=%s', p_window_seconds);
  end if;
  insert into app_private.rate_events (user_id, action) values (auth.uid(), p_action);
end $$;
revoke all on function public.enforce_rate_limit(text, integer, integer) from public, anon, authenticated;

-- Security definer, so current_user here is the owner; enforce_rate_limit itself skips calls with no
-- signed-in user (seed, service role, migrations).
create function public.rate_limit_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.enforce_rate_limit(tg_argv[0], tg_argv[1]::integer, tg_argv[2]::integer);
  return new;
end $$;

create trigger vehicles_rate_limit before insert on public.vehicles
  for each row execute function public.rate_limit_trigger('vehicle_add', '10', '3600');
create trigger mods_rate_limit before insert on public.mods
  for each row execute function public.rate_limit_trigger('mod_add', '50', '3600');
create trigger mod_photos_rate_limit before insert on public.mod_photos
  for each row execute function public.rate_limit_trigger('photo_upload', '20', '3600');
create trigger follows_rate_limit before insert on public.follows
  for each row execute function public.rate_limit_trigger('follow', '100', '3600');

-- ---------------------------------------------------------------- blocks

create table public.blocks (
  blocker_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  blocked_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

-- True when the current user and `other` have blocked each other in either direction.
create function public.is_blocked_with(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = other)
       or (b.blocker_id = other and b.blocked_id = auth.uid())
  )
$$;
revoke all on function public.is_blocked_with(uuid) from public;
grant execute on function public.is_blocked_with(uuid) to anon, authenticated;

-- A block removes every follow between the two people, both ways.
create function public.apply_block() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.follows
    where (follower_id = new.blocker_id and followee_id = new.blocked_id)
       or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  delete from public.build_follows bf using public.builds b
    where bf.build_id = b.id
      and ((bf.user_id = new.blocker_id and b.owner_id = new.blocked_id)
        or (bf.user_id = new.blocked_id and b.owner_id = new.blocker_id));
  return new;
end $$;
create trigger blocks_apply after insert on public.blocks
  for each row execute function public.apply_block();

-- ---------------------------------------------------------------- mutes (hide only; no access change)

create table public.mutes (
  muter_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  muted_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id <> muted_id)
);

-- ---------------------------------------------------------------- reports

create type public.report_target as enum ('user', 'vehicle', 'build', 'mod');
create type public.report_reason as enum (
  'spam', 'harassment', 'hate', 'sexual_content', 'violence', 'impersonation', 'scam', 'unsafe_activity', 'other'
);
create type public.report_status as enum ('open', 'reviewing', 'actioned', 'dismissed');

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  -- kept (as null) if the reporter deletes their account, so moderation history survives
  reporter_id uuid default auth.uid() references public.users (id) on delete set null,
  target_type public.report_target not null,
  target_id uuid not null,
  reason public.report_reason not null,
  details text check (char_length(details) <= 1000),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reports_status_idx on public.reports (status, created_at);
create index reports_reporter_idx on public.reports (reporter_id, created_at desc);
create trigger reports_updated_at before update on public.reports
  for each row execute function public.set_updated_at();
create trigger reports_rate_limit before insert on public.reports
  for each row execute function public.rate_limit_trigger('report', '10', '3600');

-- ---------------------------------------------------------------- moderation audit (server only)

create table public.admin_moderation (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid not null,
  action text not null check (action in (
    'dismiss_report', 'hide_content', 'restore_content', 'warn_user', 'suspend_user', 'unsuspend_user',
    'grant_business_badge', 'revoke_business_badge', 'feature_build', 'unfeature_build'
  )),
  target_type text not null check (target_type in ('user', 'vehicle', 'build', 'mod', 'report')),
  target_id uuid not null,
  report_id uuid references public.reports (id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 2000),
  prior_state jsonb,
  result_state jsonb,
  created_at timestamptz not null default now()
);
create index admin_moderation_target_idx on public.admin_moderation (target_type, target_id, created_at desc);

-- Audit rows are append-only for everyone, including the service role.
create function public.forbid_change() returns trigger
language plpgsql as $$
begin
  raise exception 'append_only' using errcode = 'P0001';
end $$;
create trigger admin_moderation_append_only before update or delete on public.admin_moderation
  for each row execute function public.forbid_change();

-- ---------------------------------------------------------------- privileges and RLS

revoke all on public.blocks, public.mutes, public.reports, public.admin_moderation from anon, authenticated;

grant select, insert (blocked_id), delete on public.blocks to authenticated;
grant select, insert (muted_id), delete on public.mutes to authenticated;
-- reporters see the status of their own reports, never moderator details
grant select (id, target_type, target_id, reason, status, created_at) on public.reports to authenticated;
grant insert (target_type, target_id, reason, details) on public.reports to authenticated;
-- admin_moderation: no client grants at all

alter table public.blocks enable row level security;
alter table public.mutes enable row level security;
alter table public.reports enable row level security;
alter table public.admin_moderation enable row level security;

-- The blocked person never learns who blocked them: only the blocker can read the row.
create policy blocks_select_own on public.blocks for select to authenticated using (blocker_id = auth.uid());
-- (the foreign key guarantees the blocked user exists; RLS would hide their row from this check)
create policy blocks_insert_own on public.blocks for insert to authenticated
  with check (blocker_id = auth.uid());
create policy blocks_delete_own on public.blocks for delete to authenticated using (blocker_id = auth.uid());

create policy mutes_select_own on public.mutes for select to authenticated using (muter_id = auth.uid());
create policy mutes_insert_own on public.mutes for insert to authenticated with check (muter_id = auth.uid());
create policy mutes_delete_own on public.mutes for delete to authenticated using (muter_id = auth.uid());

create policy reports_select_own on public.reports for select to authenticated using (reporter_id = auth.uid());
create policy reports_insert_own on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and public.current_user_verified());

-- Following needs a username, and is impossible between blocked people.
drop policy follows_insert_mine on public.follows;
create policy follows_insert_mine on public.follows for insert to authenticated
  with check (
    follower_id = auth.uid()
    and public.current_user_has_username()
    and not public.is_blocked_with(followee_id)
    and exists (select 1 from public.public_profiles p where p.user_id = followee_id)
  );

drop policy build_follows_insert on public.build_follows;
create policy build_follows_insert on public.build_follows for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.current_user_has_username()
    and exists (select 1 from public.public_builds pb where pb.build_id = build_follows.build_id)
  );

-- ---------------------------------------------------------------- public views: hide unnamed and blocked
-- Same columns as Phase 1; adds "has a username" and "not blocked either way with the viewer".

create or replace view public.public_profiles with (security_barrier = true) as
  select u.id as user_id, u.username, u.display_name, u.bio, u.general_location,
         u.years_experience, u.build_goal, u.reputation, u.business_badge
  from public.users u
  where u.deleted_at is null and u.username is not null and not public.is_blocked_with(u.id);

create or replace view public.public_vehicles with (security_barrier = true) as
  select v.id as vehicle_id, u.username as owner_username, v.year, v.make, v.model,
         v.trim_level, v.nickname, v.created_at
  from public.vehicles v
  join public.users u on u.id = v.owner_id and u.deleted_at is null and u.username is not null
  where v.deleted_at is null and v.visibility = 'public' and not public.is_blocked_with(v.owner_id);

create or replace view public.public_builds with (security_barrier = true) as
  select b.id as build_id, b.vehicle_id, u.username as owner_username, b.title, b.description,
         b.updated_at
  from public.builds b
  join public.vehicles v on v.id = b.vehicle_id and v.deleted_at is null and v.visibility = 'public'
  join public.users u on u.id = b.owner_id and u.deleted_at is null and u.username is not null
  where b.deleted_at is null and b.visibility = 'public' and not public.is_blocked_with(b.owner_id);
