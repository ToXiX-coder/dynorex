-- D-61 (2026-10-11): features the owner picked from an ideas round.
--   1. the car's odometer follows the maintenance log (a higher reading moves it up, never down)
--   2. receipts: private photos on a mod or a maintenance record (written by register-photo only)
--   3. service history for selling: a revocable, expiring link to a car's work history (no VIN, costs or notes)
--   4. event photo albums: people who went add photos after the meet; the host and the uploader can remove
--   5. alerts when someone likes or comments on your post
--   6. road reviews: scenery / surface / traffic on route ratings, and public reviews with a comment
--   7. club calendar: members are told when a new meet is posted in their club
-- New enum values are only referenced inside function bodies (checked at run time), never used directly here.

alter type public.notification_category add value if not exists 'post_like';
alter type public.notification_category add value if not exists 'post_comment';
alter type public.notification_category add value if not exists 'club_event';
alter type public.report_target add value if not exists 'event_photo';

alter table public.notifications drop constraint notifications_entity_type_check;
alter table public.notifications add constraint notifications_entity_type_check
  check (entity_type in ('user','build','mod','event','listing','subscription','botw','business','service_request',
                         'post'));

alter table public.admin_moderation drop constraint admin_moderation_target_type_check;
alter table public.admin_moderation add constraint admin_moderation_target_type_check
  check (target_type in ('user', 'vehicle', 'build', 'mod', 'report', 'route', 'event', 'club', 'post', 'comment',
                         'listing', 'business', 'room_message', 'event_photo'));

-- ================================================================ 1. odometer follows the log

-- Maintenance odometers are in miles, so only a car whose odometer is in miles is moved. Readings only go up:
-- logging an old job never winds the clock back.
create function app_private.bump_vehicle_odometer() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.odometer is not null and new.deleted_at is null then
    update public.vehicles v set odometer = new.odometer
      where v.id = new.vehicle_id and v.owner_id = new.owner_id and v.deleted_at is null
        and v.odometer_unit = 'mi' and (v.odometer is null or v.odometer < new.odometer);
  end if;
  return new;
end $$;
create trigger maintenance_bump_odometer after insert or update of odometer on public.maintenance_records
  for each row execute function app_private.bump_vehicle_odometer();
revoke all on function app_private.bump_vehicle_odometer() from public, anon, authenticated;

-- ================================================================ 2. receipts (private)

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  mod_id uuid references public.mods (id) on delete cascade,
  maintenance_id uuid references public.maintenance_records (id) on delete cascade,
  storage_path text not null,
  mime text not null,
  bytes integer not null,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- a receipt belongs to exactly one mod or one maintenance record
  check ((mod_id is null) <> (maintenance_id is null))
);
create index receipts_mod_idx on public.receipts (mod_id) where deleted_at is null;
create index receipts_maintenance_idx on public.receipts (maintenance_id) where deleted_at is null;
-- rows are written only by the register-photo Edge Function (service role); only the owner ever reads them
revoke all on public.receipts from anon, authenticated;
grant select on public.receipts to authenticated;
alter table public.receipts enable row level security;
create policy receipts_own on public.receipts for select to authenticated
  using (owner_id = auth.uid() and deleted_at is null);

create function public.soft_delete_receipt(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.receipts set deleted_at = now() where id = p_id and owner_id = auth.uid() and deleted_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- ================================================================ 3. service history for selling

-- One live link per car. The token is 64 random hex characters; the link stops working when revoked, when a
-- new one is made, or after 90 days. Nothing here names the owner.
create table app_private.history_shares (
  vehicle_id uuid primary key references public.vehicles (id) on delete cascade,
  owner_id uuid not null references public.users (id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days'
);

create function public.create_history_share(p_vehicle uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if auth.uid() is null then raise exception 'sign_in_required' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.vehicles v where v.id = p_vehicle and v.owner_id = auth.uid() and v.deleted_at is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.enforce_rate_limit('history_share', 10, 86400);
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into app_private.history_shares (vehicle_id, owner_id, token) values (p_vehicle, auth.uid(), v_token)
    on conflict (vehicle_id) do update set token = excluded.token, owner_id = excluded.owner_id,
      created_at = now(), expires_at = now() + interval '90 days';
  return v_token;
end $$;

create function public.revoke_history_share(p_vehicle uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from app_private.history_shares where vehicle_id = p_vehicle and owner_id = auth.uid();
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Is there a live link for this car (owner only), and until when.
create function public.my_history_share(p_vehicle uuid) returns table (token text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.token, s.expires_at from app_private.history_shares s
  where s.vehicle_id = p_vehicle and s.owner_id = auth.uid() and s.expires_at > now()
$$;

-- What a buyer sees: the car, its odometer, finished mods and the maintenance log (title, date, mileage, and
-- whether a receipt is on file). Never the VIN, costs, notes, part numbers, photos or who owns it.
create function public.service_history(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s app_private.history_shares;
  v public.vehicles;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into s from app_private.history_shares where token = p_token and expires_at > now();
  if not found then return null; end if;
  select * into v from public.vehicles where id = s.vehicle_id and owner_id = s.owner_id
    and deleted_at is null and hidden_at is null;
  if not found then return null; end if;
  return jsonb_build_object(
    'year', v.year, 'make', v.make, 'model', v.model, 'trim', v.trim_level,
    'odometer', v.odometer, 'odometer_unit', v.odometer_unit,
    'expires_at', s.expires_at,
    'mods', coalesce((
      select jsonb_agg(jsonb_build_object('name', m.name, 'category', m.category, 'brand', m.brand,
                                          'installed_on', m.installed_on,
                                          'receipt', exists (select 1 from public.receipts r
                                                             where r.mod_id = m.id and r.deleted_at is null))
                       order by m.installed_on desc nulls last, m.created_at desc)
      from public.mods m where m.vehicle_id = v.id and m.deleted_at is null and m.status = 'complete'), '[]'::jsonb),
    'maintenance', coalesce((
      select jsonb_agg(jsonb_build_object('title', r.title, 'done_on', r.done_on, 'odometer', r.odometer,
                                          'receipt', exists (select 1 from public.receipts x
                                                             where x.maintenance_id = r.id and x.deleted_at is null))
                       order by r.done_on desc, r.created_at desc)
      from public.maintenance_records r where r.vehicle_id = v.id and r.deleted_at is null), '[]'::jsonb)
  );
end $$;

-- ================================================================ 4. event photo albums

create table public.event_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  owner_id uuid not null references public.users (id) on delete cascade,
  storage_path text not null,
  mime text not null,
  bytes integer not null,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  hidden_at timestamptz
);
create index event_photos_event_idx on public.event_photos (event_id, created_at) where deleted_at is null;
-- rows are written only by register-photo; you can read your own (for your data export), everyone else sees
-- the album through public_event_photos
revoke all on public.event_photos from anon, authenticated;
grant select on public.event_photos to authenticated;
alter table public.event_photos enable row level security;
create policy event_photos_own on public.event_photos for select to authenticated
  using (owner_id = auth.uid() and deleted_at is null);

-- Who may add photos: the host, anyone who RSVP'd going or checked in, from an hour before the start until a
-- week after the end, on a live event. register-photo asks this AS THE CALLER before writing a row.
create function public.can_add_event_photo(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event and e.deleted_at is null and e.hidden_at is null and e.status <> 'cancelled'
      and now() between e.starts_at - interval '1 hour' and e.ends_at + interval '7 days'
      and auth.uid() is not null and not public.is_blocked_with(e.organizer_id)
      and (e.organizer_id = auth.uid()
           or exists (select 1 from public.event_rsvps r where r.event_id = e.id and r.user_id = auth.uid()
                      and r.status = 'going')
           or exists (select 1 from public.event_checkins c where c.event_id = e.id and c.user_id = auth.uid())))
$$;

-- The album: photos of events you can see, minus hidden ones and anyone blocked either way.
create view public.public_event_photos with (security_barrier = true) as
  select p.id as photo_id, p.event_id, u.username as owner_username, p.width, p.height, p.created_at
  from public.event_photos p
  join public.public_events pe on pe.event_id = p.event_id
  join public.users u on u.id = p.owner_id and u.deleted_at is null and u.hidden_at is null and u.username is not null
  where p.deleted_at is null and p.hidden_at is null and not public.is_blocked_with(p.owner_id);
revoke all on public.public_event_photos from anon, authenticated;
grant select on public.public_event_photos to anon, authenticated;

-- The uploader or the event's host can take a photo down.
create function public.remove_event_photo(p_photo uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.event_photos p set deleted_at = now()
    where p.id = p_photo and p.deleted_at is null
      and (p.owner_id = auth.uid()
           or exists (select 1 from public.events e where e.id = p.event_id and e.organizer_id = auth.uid()));
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Which of these photos can I take down (mine, or any on an event I host).
create function public.my_removable_event_photos(p_event uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.event_photos p
  where p.event_id = p_event and p.deleted_at is null
    and (p.owner_id = auth.uid()
         or exists (select 1 from public.events e where e.id = p.event_id and e.organizer_id = auth.uid()))
$$;

create function public.moderate_event_photo(p_moderator uuid, p_photo uuid, p_hide boolean, p_report_id uuid, p_reason text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_prior jsonb;
  v_audit uuid;
begin
  if not exists (select 1 from app_private.moderators m where m.user_id = p_moderator) then
    raise exception 'not_a_moderator' using errcode = '42501';
  end if;
  select jsonb_build_object('hidden_at', p.hidden_at) into v_prior from public.event_photos p where p.id = p_photo;
  if v_prior is null then raise exception 'target_not_found' using errcode = 'P0002'; end if;
  update public.event_photos set hidden_at = case when p_hide then now() end where id = p_photo;
  if p_report_id is not null then update public.reports set status = 'actioned' where id = p_report_id; end if;
  insert into public.admin_moderation (moderator_id, action, target_type, target_id, report_id, reason, prior_state, result_state)
    values (p_moderator, case when p_hide then 'hide_content' else 'restore_content' end, 'event_photo', p_photo,
            p_report_id, p_reason, v_prior, jsonb_build_object('hidden', p_hide))
    returning id into v_audit;
  return v_audit;
end $$;

-- ================================================================ 5. like and comment alerts

-- A like tells the post's author, at most once per liker per post per day; never for your own post, from
-- someone you muted or blocked (either way), or when the author turned the alert off.
create function app_private.notify_post_like() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_author uuid;
  v_name text;
begin
  select p.author_id into v_author from public.posts p
    where p.id = new.post_id and p.deleted_at is null and p.hidden_at is null;
  select u.username into v_name from public.users u
    where u.id = new.user_id and u.username is not null and u.deleted_at is null and u.hidden_at is null;
  if v_author is null or v_name is null or v_author = new.user_id
     or not public.notification_enabled(v_author, 'post_like')
     or exists (select 1 from public.mutes m where m.muter_id = v_author and m.muted_id = new.user_id)
     or exists (select 1 from public.blocks k where (k.blocker_id = v_author and k.blocked_id = new.user_id)
                                              or (k.blocker_id = new.user_id and k.blocked_id = v_author))
     or exists (select 1 from public.notifications n where n.recipient_id = v_author and n.category = 'post_like'
                and n.actor_id = new.user_id and n.entity_id = new.post_id::text
                and n.created_at > now() - interval '1 day') then
    return new;
  end if;
  insert into public.notifications (recipient_id, actor_id, category, entity_type, entity_id, title, body)
    values (v_author, new.user_id, 'post_like', 'post', new.post_id::text, 'New like',
            format('@%s liked your post.', v_name));
  return new;
end $$;
create trigger post_likes_notify after insert on public.post_likes
  for each row execute function app_private.notify_post_like();

-- A comment tells the post's author (same rules), at most once per commenter per post per hour. The comment's
-- words are not copied into the alert.
create function app_private.notify_post_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_author uuid;
  v_name text;
begin
  select p.author_id into v_author from public.posts p
    where p.id = new.post_id and p.deleted_at is null and p.hidden_at is null;
  select u.username into v_name from public.users u
    where u.id = new.author_id and u.username is not null and u.deleted_at is null and u.hidden_at is null;
  if v_author is null or v_name is null or v_author = new.author_id
     or not public.notification_enabled(v_author, 'post_comment')
     or exists (select 1 from public.mutes m where m.muter_id = v_author and m.muted_id = new.author_id)
     or exists (select 1 from public.blocks k where (k.blocker_id = v_author and k.blocked_id = new.author_id)
                                              or (k.blocker_id = new.author_id and k.blocked_id = v_author))
     or exists (select 1 from public.notifications n where n.recipient_id = v_author and n.category = 'post_comment'
                and n.actor_id = new.author_id and n.entity_id = new.post_id::text
                and n.created_at > now() - interval '1 hour') then
    return new;
  end if;
  insert into public.notifications (recipient_id, actor_id, category, entity_type, entity_id, title, body)
    values (v_author, new.author_id, 'post_comment', 'post', new.post_id::text, 'New comment',
            format('@%s commented on your post.', v_name));
  return new;
end $$;
create trigger comments_notify after insert on public.comments
  for each row execute function app_private.notify_post_comment();

-- ================================================================ 6. road reviews

alter table public.route_ratings
  add column scenery smallint check (scenery between 1 and 5),
  add column surface smallint check (surface between 1 and 5),
  add column traffic smallint check (traffic between 1 and 5);
-- traffic: 5 = empty road, 1 = heavy traffic
grant insert (scenery, surface, traffic), update (scenery, surface, traffic) on public.route_ratings to authenticated;

-- Averages per aspect for a public route.
create function public.route_review_summary(p_route uuid)
returns table (reviews bigint, stars numeric, scenery numeric, surface numeric, traffic numeric)
language sql stable security definer set search_path = '' as $$
  select count(*), round(avg(x.stars), 1), round(avg(x.scenery), 1), round(avg(x.surface), 1), round(avg(x.traffic), 1)
  from public.route_ratings x
  join public.users u on u.id = x.user_id and u.deleted_at is null and u.hidden_at is null
  where x.route_id = p_route and exists (select 1 from public.public_routes pr where pr.route_id = p_route)
$$;

-- The newest written reviews (those with a comment), with the reviewer's username. Hidden or blocked people
-- are left out.
create function public.route_reviews(p_route uuid, p_page integer default 0)
returns table (username text, stars smallint, scenery smallint, surface smallint, traffic smallint, comment text,
               updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select u.username, x.stars, x.scenery, x.surface, x.traffic, x.comment, x.updated_at
  from public.route_ratings x
  join public.users u on u.id = x.user_id and u.deleted_at is null and u.hidden_at is null and u.username is not null
  where x.route_id = p_route and x.comment is not null
    and exists (select 1 from public.public_routes pr where pr.route_id = p_route)
    and not public.is_blocked_with(x.user_id)
  order by x.updated_at desc
  limit 20 offset least(greatest(p_page, 0), 50) * 20
$$;

-- ================================================================ 7. club calendar alerts

-- A new meet in a club tells its members (not the host), once per event, respecting their switch and mutes.
create function app_private.notify_club_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_club text;
begin
  if new.club_id is null or new.deleted_at is not null or new.status <> 'scheduled' then return new; end if;
  select c.name into v_club from public.clubs c where c.id = new.club_id and c.deleted_at is null and c.hidden_at is null;
  if v_club is null then return new; end if;
  insert into public.notifications (recipient_id, actor_id, category, entity_type, entity_id, title, body)
  select m.user_id, new.organizer_id, 'club_event', 'event', new.id::text, left('New in ' || v_club, 80),
         format('%s, %s.', left(new.title, 80), to_char(new.starts_at at time zone 'UTC', 'Mon DD'))
  from public.club_members m
  where m.club_id = new.club_id and m.user_id <> new.organizer_id
    and public.notification_enabled(m.user_id, 'club_event')
    and not exists (select 1 from public.mutes x where x.muter_id = m.user_id and x.muted_id = new.organizer_id)
    and not exists (select 1 from public.blocks k where (k.blocker_id = m.user_id and k.blocked_id = new.organizer_id)
                                                 or (k.blocker_id = new.organizer_id and k.blocked_id = m.user_id));
  return new;
end $$;
create trigger events_notify_club after insert on public.events
  for each row execute function app_private.notify_club_event();

-- ================================================================ grants

revoke all on function app_private.notify_post_like(), app_private.notify_post_comment(),
  app_private.notify_club_event() from public, anon, authenticated;
revoke all on function public.soft_delete_receipt(uuid), public.create_history_share(uuid),
  public.revoke_history_share(uuid), public.my_history_share(uuid), public.service_history(text),
  public.can_add_event_photo(uuid), public.remove_event_photo(uuid), public.my_removable_event_photos(uuid),
  public.moderate_event_photo(uuid, uuid, boolean, uuid, text), public.route_review_summary(uuid),
  public.route_reviews(uuid, integer) from public, anon, authenticated;
grant execute on function public.soft_delete_receipt(uuid), public.create_history_share(uuid),
  public.revoke_history_share(uuid), public.my_history_share(uuid), public.can_add_event_photo(uuid),
  public.remove_event_photo(uuid), public.my_removable_event_photos(uuid) to authenticated;
-- public pages: anyone with the link / anyone who can see the route
grant execute on function public.service_history(text), public.route_review_summary(uuid),
  public.route_reviews(uuid, integer) to anon, authenticated;
grant execute on function public.moderate_event_photo(uuid, uuid, boolean, uuid, text) to service_role;
