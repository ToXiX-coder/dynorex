-- Dynorex D-58: features from the competitor review (owner, 2026-10-10).
--   1. maintenance log (private, with next-due date / mileage for reminders)
--   2. group chat for events and clubs
--   3. private (invite-only) clubs, join requests, club moderators (resolves D-47)
--   4. events: meeting-place coordinates for the events map
--   5. saved items (bookmarks)
--   6. achievements, computed from public activity
--   7. a photo gallery per vehicle
-- Functions are private by default (migration 6): every grant below is deliberate.

alter type public.report_target add value if not exists 'room_message';
alter type public.club_role add value if not exists 'moderator';

-- ================================================================ 1. maintenance log (owner only, never public)

create table public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80 and title !~ '[\x01-\x1F\x7F]'),
  done_on date not null check (done_on >= date '1950-01-01'),
  odometer integer check (odometer between 0 and 2000000),
  cost_minor integer check (cost_minor between 0 and 10000000),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  notes text check (char_length(notes) <= 1000 and notes !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  -- when it's due again (either or both); the app turns these into reminders on the phone
  next_due_on date,
  next_due_odometer integer check (next_due_odometer between 0 and 2000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (done_on <= current_date + 1),
  check (next_due_on is null or next_due_on >= done_on),
  check (next_due_odometer is null or odometer is null or next_due_odometer > odometer)
);
create index maintenance_vehicle_idx on public.maintenance_records (vehicle_id, done_on desc) where deleted_at is null;
create trigger maintenance_updated_at before update on public.maintenance_records
  for each row execute function public.set_updated_at();
create trigger maintenance_rate_limit before insert on public.maintenance_records
  for each row execute function public.rate_limit_trigger('maintenance', '60', '3600');

revoke all on public.maintenance_records from anon, authenticated;
grant select on public.maintenance_records to authenticated;
grant insert (vehicle_id, title, done_on, odometer, cost_minor, currency, notes, next_due_on, next_due_odometer)
  on public.maintenance_records to authenticated;
grant update (title, done_on, odometer, cost_minor, notes, next_due_on, next_due_odometer)
  on public.maintenance_records to authenticated;
alter table public.maintenance_records enable row level security;
create policy maintenance_own_select on public.maintenance_records for select to authenticated
  using (owner_id = auth.uid() and deleted_at is null);
create policy maintenance_insert on public.maintenance_records for insert to authenticated
  with check (owner_id = auth.uid() and exists (
    select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = auth.uid() and v.deleted_at is null));
create policy maintenance_own_update on public.maintenance_records for update to authenticated
  using (owner_id = auth.uid() and deleted_at is null) with check (owner_id = auth.uid());

create function public.soft_delete_maintenance(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.maintenance_records set deleted_at = now() where id = p_id and owner_id = auth.uid() and deleted_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- ================================================================ 3. private clubs, join requests, moderators

alter table public.clubs add column visibility text not null default 'public' check (visibility in ('public', 'private'));
grant update (visibility) on public.clubs to authenticated;

create table public.club_join_requests (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
revoke all on public.club_join_requests from anon, authenticated;
grant select on public.club_join_requests to authenticated;
alter table public.club_join_requests enable row level security;
create policy club_join_requests_own on public.club_join_requests for select to authenticated using (user_id = auth.uid());

create function app_private.club_role_of(p_club uuid, p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role::text from public.club_members m where m.club_id = p_club and m.user_id = p_user
$$;
create function app_private.club_staff(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app_private.club_role_of(p_club, auth.uid()) in ('owner', 'moderator'), false)
$$;

-- Public clubs: join straight away. Private clubs: ask, and the owner or a moderator lets you in.
create function public.join_or_request_club(p_club uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_vis text;
begin
  if auth.uid() is null then raise exception 'sign_in_required' using errcode = 'P0001'; end if;
  if not public.current_user_has_username() then raise exception 'username_required' using errcode = 'P0001'; end if;
  perform public.enforce_rate_limit('club_join', 30, 3600);
  select c.visibility into v_vis from public.clubs c
    join public.public_clubs pc on pc.club_id = c.id where c.id = p_club;
  if v_vis is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.club_members m where m.club_id = p_club and m.user_id = auth.uid()) then
    return 'joined';
  end if;
  if v_vis = 'public' then
    insert into public.club_members (club_id, user_id) values (p_club, auth.uid()) on conflict do nothing;
    return 'joined';
  end if;
  insert into public.club_join_requests (club_id, user_id) values (p_club, auth.uid()) on conflict do nothing;
  return 'requested';
end $$;

-- The old join path refuses private clubs (it can't ask for approval).
create or replace function public.join_club(p_club uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.clubs c where c.id = p_club and c.visibility = 'private') then
    raise exception 'club_private' using errcode = 'P0001';
  end if;
  return public.join_or_request_club(p_club) = 'joined';
end $$;

create function public.cancel_join_request(p_club uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.club_join_requests where club_id = p_club and user_id = auth.uid();
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Where you stand with a club: owner, moderator, member, requested, or none.
create function public.my_club_status(p_club uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    app_private.club_role_of(p_club, auth.uid()),
    case when exists (select 1 from public.club_join_requests r where r.club_id = p_club and r.user_id = auth.uid())
         then 'requested' end,
    'none')
$$;

-- Members (for members only), staff first.
create function public.club_member_list(p_club uuid) returns table (username text, role text, joined_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select u.username, m.role::text, m.joined_at
  from public.club_members m
  join public.users u on u.id = m.user_id and u.deleted_at is null and u.hidden_at is null and u.username is not null
  where m.club_id = p_club and app_private.club_role_of(p_club, auth.uid()) is not null
    and not public.is_blocked_with(m.user_id)
  order by case m.role::text when 'owner' then 0 when 'moderator' then 1 else 2 end, m.joined_at
  limit 500
$$;

create function public.club_join_requests_for(p_club uuid) returns table (username text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select u.username, r.created_at
  from public.club_join_requests r
  join public.users u on u.id = r.user_id and u.deleted_at is null and u.username is not null
  where r.club_id = p_club and app_private.club_staff(p_club) and not public.is_blocked_with(r.user_id)
  order by r.created_at
  limit 200
$$;

create function public.respond_join_request(p_club uuid, p_username text, p_accept boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not app_private.club_staff(p_club) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select u.id into v_user from public.users u where u.username = p_username;
  delete from public.club_join_requests where club_id = p_club and user_id = v_user;
  if not found then return false; end if;
  if p_accept then
    insert into public.club_members (club_id, user_id) values (p_club, v_user) on conflict do nothing;
  end if;
  return true;
end $$;

-- Owner promotes a member to moderator or back.
create function public.set_club_role(p_club uuid, p_username text, p_role text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_role not in ('member', 'moderator') then raise exception 'invalid_role' using errcode = '22023'; end if;
  if coalesce(app_private.club_role_of(p_club, auth.uid()), '') <> 'owner' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.club_members m set role = p_role::public.club_role
    from public.users u
    where m.club_id = p_club and m.user_id = u.id and u.username = p_username and m.role <> 'owner';
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Owner removes anyone but themselves; moderators remove plain members.
create function public.remove_club_member(p_club uuid, p_username text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_me text := app_private.club_role_of(p_club, auth.uid());
  n integer;
begin
  if v_me is null or v_me = 'member' then raise exception 'not_found' using errcode = 'P0002'; end if;
  delete from public.club_members m using public.users u
    where m.club_id = p_club and m.user_id = u.id and u.username = p_username
      and m.role <> 'owner' and (v_me = 'owner' or m.role = 'member');
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Club staff take down a post in their club.
create function public.club_remove_post(p_post uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.posts p set deleted_at = now()
    where p.id = p_post and p.deleted_at is null and p.club_id is not null and app_private.club_staff(p.club_id);
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Clubs list shows private clubs too (name and description), marked private.
create or replace view public.public_clubs with (security_barrier = true) as
  select c.id as club_id, c.name, c.description, u.username as owner_username, c.created_at,
         (select count(*) from public.club_members m where m.club_id = c.id) as members_count,
         c.visibility
  from public.clubs c
  join public.users u on u.id = c.owner_id and u.deleted_at is null and u.hidden_at is null and u.username is not null
  where c.deleted_at is null and c.hidden_at is null and not public.is_blocked_with(c.owner_id);

-- Posts in a private club are for its members only.
create or replace view public.public_posts with (security_barrier = true) as
  select p.id as post_id, u.username as author_username, p.club_id, c.name as club_name, p.body,
         case when exists (select 1 from public.public_builds pb where pb.vehicle_id = p.build_vehicle_id)
              then p.build_vehicle_id end as build_vehicle_id,
         p.created_at,
         (select count(*) from public.post_likes l where l.post_id = p.id) as likes_count,
         (select count(*) from public.comments x where x.post_id = p.id and x.deleted_at is null and x.hidden_at is null) as comments_count
  from public.posts p
  join public.users u on u.id = p.author_id and u.deleted_at is null and u.hidden_at is null and u.username is not null
  left join public.clubs c on c.id = p.club_id
  where p.deleted_at is null and p.hidden_at is null and not public.is_blocked_with(p.author_id)
    and (p.club_id is null or (c.deleted_at is null and c.hidden_at is null
                               and (c.visibility = 'public' or exists (
                                 select 1 from public.club_members m where m.club_id = c.id and m.user_id = auth.uid()))));

-- ================================================================ 2. group chat for events and clubs

create table public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_type text not null check (room_type in ('event', 'club')),
  room_id uuid not null,
  sender_id uuid not null references public.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000 and body !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  hidden_at timestamptz
);
create index room_messages_room_idx on public.room_messages (room_type, room_id, created_at desc);
revoke all on public.room_messages from anon, authenticated;
grant select on public.room_messages to authenticated;
alter table public.room_messages enable row level security;
-- direct reads: only what you sent (rooms are read through room_messages_for())
create policy room_messages_own on public.room_messages for select to authenticated using (sender_id = auth.uid());

-- Who's in a room: an event's host and everyone who said going/interested; a club's members.
create function app_private.in_room(p_type text, p_room uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'event' then exists (
      select 1 from public.events e
      where e.id = p_room and e.deleted_at is null and e.hidden_at is null
        and (e.organizer_id = auth.uid()
             or exists (select 1 from public.event_rsvps r where r.event_id = e.id and r.user_id = auth.uid())))
    when 'club' then exists (
      select 1 from public.club_members m join public.clubs c on c.id = m.club_id
      where m.club_id = p_room and m.user_id = auth.uid() and c.deleted_at is null and c.hidden_at is null)
    else false end
$$;
-- Who can take a message down: its sender, the event host, or club staff.
create function app_private.room_staff(p_type text, p_room uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'event' then exists (select 1 from public.events e where e.id = p_room and e.organizer_id = auth.uid())
    when 'club' then app_private.club_staff(p_room)
    else false end
$$;

-- The newest 100 messages (or 100 before p_before), oldest first. Blocked people's messages are left out.
create function public.room_messages_for(p_type text, p_room uuid, p_before timestamptz default null)
returns table (message_id uuid, mine boolean, sender_username text, body text, created_at timestamptz, can_remove boolean)
language sql stable security definer set search_path = '' as $$
  select x.id, x.mine, x.username, x.body, x.created_at, x.can_remove from (
    select m.id, m.sender_id = auth.uid() as mine, u.username, m.body, m.created_at,
           (m.sender_id = auth.uid() or app_private.room_staff(p_type, p_room)) as can_remove
    from public.room_messages m
    join public.users u on u.id = m.sender_id and u.deleted_at is null and u.hidden_at is null
    where app_private.in_room(p_type, p_room)
      and m.room_type = p_type and m.room_id = p_room and m.deleted_at is null and m.hidden_at is null
      and not public.is_blocked_with(m.sender_id)
      and (p_before is null or m.created_at < p_before)
    order by m.created_at desc, m.id desc
    limit 100
  ) x order by x.created_at, x.id
$$;

create function public.send_room_message(p_type text, p_room uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not app_private.in_room(p_type, p_room) then raise exception 'not_in_room' using errcode = 'P0001'; end if;
  if not public.current_user_has_username() then raise exception 'username_required' using errcode = 'P0001'; end if;
  perform public.enforce_rate_limit('room_message', 120, 3600);
  insert into public.room_messages (room_type, room_id, sender_id, body) values (p_type, p_room, auth.uid(), trim(p_body))
    returning id into v_id;
  return v_id;
end $$;

create function public.remove_room_message(p_message uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.room_messages m set deleted_at = now()
    where m.id = p_message and m.deleted_at is null
      and (m.sender_id = auth.uid() or app_private.room_staff(m.room_type, m.room_id));
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- ================================================================ 4. events: meeting-place coordinates

-- The host's picked public meeting spot, so events can show on a map. Only set from a picked place, never
-- from anyone's own location.
alter table public.events
  add column place_lat float8 check (place_lat between -90 and 90),
  add column place_lng float8 check (place_lng between -180 and 180),
  add constraint events_place_pair check ((place_lat is null) = (place_lng is null));
grant insert (place_lat, place_lng), update (place_lat, place_lng) on public.events to authenticated;

create or replace view public.public_events with (security_barrier = true) as
  select e.id as event_id, u.username as organizer_username, e.title, e.description, e.starts_at, e.ends_at,
         e.location_text, e.capacity, e.status,
         (select count(*) from public.event_rsvps r where r.event_id = e.id and r.status = 'going') as going_count,
         (select count(*) from public.event_rsvps r where r.event_id = e.id and r.status = 'interested') as interested_count,
         e.kind,
         case when exists (select 1 from public.public_routes pr where pr.route_id = e.route_id) then e.route_id end as route_id,
         e.club_id, e.place_lat, e.place_lng
  from public.events e
  join public.users u on u.id = e.organizer_id and u.deleted_at is null and u.hidden_at is null and u.username is not null
  where e.deleted_at is null and e.hidden_at is null and not public.is_blocked_with(e.organizer_id);

-- ================================================================ 5. saved items (private bookmarks)

create table public.saves (
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  kind text not null check (kind in ('post', 'event', 'route', 'listing', 'business', 'build')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, target_id)
);
create index saves_recent_idx on public.saves (user_id, created_at desc);
create trigger saves_rate_limit before insert on public.saves
  for each row execute function public.rate_limit_trigger('save', '200', '3600');
revoke all on public.saves from anon, authenticated;
grant select, insert (kind, target_id), delete on public.saves to authenticated;
alter table public.saves enable row level security;
create policy saves_own_select on public.saves for select to authenticated using (user_id = auth.uid());
create policy saves_insert on public.saves for insert to authenticated
  with check (user_id = auth.uid() and (select count(*) from public.saves s where s.user_id = auth.uid()) < 1000);
create policy saves_delete on public.saves for delete to authenticated using (user_id = auth.uid());

-- ================================================================ 6. achievements (computed, public counts only)

-- Badges earned from activity. Nothing is stored and only yes/no comes back: almost everything counted is
-- public already; the one private input is how many events you checked in at ("Regular", 5+), never which ones.
-- Hidden or deleted accounts earn nothing.
create function public.achievements(p_username text) returns table (id text)
language sql stable security definer set search_path = '' as $$
  with u as (
    select x.id from public.users x
    where x.username = p_username and x.deleted_at is null and x.hidden_at is null and not public.is_blocked_with(x.id)
  )
  select a.id from u cross join lateral (values
    ('first_build', exists (select 1 from public.public_builds pb where pb.owner_username = p_username)),
    ('wrench_10', (select count(*) from public.public_mods pm join public.public_builds pb on pb.build_id = pm.build_id
                   where pb.owner_username = p_username and pm.status = 'complete') >= 10),
    ('road_tripper', (select count(*) from public.public_routes pr where pr.owner_username = p_username) >= 3),
    ('host', exists (select 1 from public.events e where e.organizer_id = u.id and e.deleted_at is null
                     and e.status <> 'cancelled' and e.ends_at < now())),
    ('regular', (select count(*) from public.event_checkins c where c.user_id = u.id) >= 5),
    ('club_founder', exists (select 1 from public.clubs c where c.owner_id = u.id and c.deleted_at is null)),
    ('seller', exists (select 1 from public.listings l where l.seller_id = u.id and l.status = 'sold')),
    ('shop_pro', exists (select 1 from public.service_requests r join public.businesses b on b.id = r.business_id
                         where b.owner_id = u.id and r.status = 'completed')),
    ('crowd_favorite', (select count(*) from public.post_likes l join public.posts p on p.id = l.post_id
                        where p.author_id = u.id and p.deleted_at is null) >= 25)
  ) as a(id, earned)
  where a.earned
$$;

-- ================================================================ 7. vehicle photo gallery

create table public.vehicle_photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  storage_path text not null,
  position integer not null default 0,
  mime text not null,
  bytes integer not null,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index vehicle_photos_vehicle_idx on public.vehicle_photos (vehicle_id, position) where deleted_at is null;
-- rows are written only by the register-photo Edge Function (service role)
revoke all on public.vehicle_photos from anon, authenticated;
grant select on public.vehicle_photos to authenticated;
alter table public.vehicle_photos enable row level security;
create policy vehicle_photos_own on public.vehicle_photos for select to authenticated
  using (owner_id = auth.uid() and deleted_at is null);

create view public.public_vehicle_photos with (security_barrier = true) as
  select p.id as photo_id, p.vehicle_id, p.position, p.width, p.height
  from public.vehicle_photos p
  join public.public_vehicles pv on pv.vehicle_id = p.vehicle_id
  where p.deleted_at is null;

create function public.soft_delete_vehicle_photo(p_photo uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.vehicle_photos set deleted_at = now() where id = p_photo and owner_id = auth.uid() and deleted_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- ================================================================ moderation: chat messages

alter table public.admin_moderation drop constraint admin_moderation_target_type_check;
alter table public.admin_moderation add constraint admin_moderation_target_type_check
  check (target_type in ('user', 'vehicle', 'build', 'mod', 'report', 'route', 'event', 'club', 'post', 'comment',
                         'listing', 'business', 'room_message'));

create function public.moderate_room_message(p_moderator uuid, p_message uuid, p_hide boolean, p_report_id uuid, p_reason text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_prior jsonb;
  v_audit uuid;
begin
  if not exists (select 1 from app_private.moderators m where m.user_id = p_moderator) then
    raise exception 'not_a_moderator' using errcode = '42501';
  end if;
  select jsonb_build_object('hidden_at', m.hidden_at) into v_prior from public.room_messages m where m.id = p_message;
  if v_prior is null then raise exception 'target_not_found' using errcode = 'P0002'; end if;
  update public.room_messages set hidden_at = case when p_hide then now() end where id = p_message;
  if p_report_id is not null then update public.reports set status = 'actioned' where id = p_report_id; end if;
  insert into public.admin_moderation (moderator_id, action, target_type, target_id, report_id, reason, prior_state, result_state)
    values (p_moderator, case when p_hide then 'hide_content' else 'restore_content' end, 'room_message', p_message,
            p_report_id, p_reason, v_prior, jsonb_build_object('hidden', p_hide))
    returning id into v_audit;
  return v_audit;
end $$;
revoke all on function public.moderate_room_message(uuid, uuid, boolean, uuid, text) from public, anon, authenticated;
grant execute on function public.moderate_room_message(uuid, uuid, boolean, uuid, text) to service_role;

-- ================================================================ grants

revoke all on function app_private.club_role_of(uuid, uuid), app_private.club_staff(uuid),
  app_private.in_room(text, uuid), app_private.room_staff(text, uuid) from public, anon, authenticated;
revoke all on public.public_vehicle_photos from anon, authenticated;
grant select on public.public_vehicle_photos to anon, authenticated;
grant execute on function public.achievements(text) to anon, authenticated;
grant execute on function public.soft_delete_maintenance(uuid), public.join_or_request_club(uuid),
  public.cancel_join_request(uuid), public.my_club_status(uuid), public.club_member_list(uuid),
  public.club_join_requests_for(uuid), public.respond_join_request(uuid, text, boolean),
  public.set_club_role(uuid, text, text), public.remove_club_member(uuid, text), public.club_remove_post(uuid),
  public.room_messages_for(text, uuid, timestamptz), public.send_room_message(text, uuid, text),
  public.remove_room_message(uuid), public.soft_delete_vehicle_photo(uuid)
  to authenticated;
