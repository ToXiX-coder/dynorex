-- Dynorex Phase 7, slice 2: Paddock community (clubs, posts, comments, likes, feed), group drives
-- (events tied to a public route), search over routes / events / clubs, and moderation for every v2 surface.
-- Still behind the line / paddock app flags. Functions are private by default (migration 6): every grant
-- below is deliberate.

alter type public.report_target add value if not exists 'club';
alter type public.report_target add value if not exists 'post';
alter type public.report_target add value if not exists 'comment';

-- ================================================================ clubs

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  name text not null check (char_length(name) between 3 and 60 and name !~ '[\x01-\x1F\x7F]'),
  description text check (char_length(description) <= 1000 and description !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  hidden_at timestamptz
);
create unique index clubs_name_uq on public.clubs (lower(name)) where deleted_at is null;
create trigger clubs_updated_at before update on public.clubs for each row execute function public.set_updated_at();

create type public.club_role as enum ('owner', 'member');
create table public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role public.club_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index club_members_user_idx on public.club_members (user_id);

revoke all on public.clubs, public.club_members from anon, authenticated;
grant select on public.clubs to authenticated;
grant update (description) on public.clubs to authenticated;
grant select on public.club_members to authenticated;
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
create policy clubs_owner_select on public.clubs for select to authenticated using (owner_id = auth.uid() and deleted_at is null);
create policy clubs_owner_update on public.clubs for update to authenticated
  using (owner_id = auth.uid() and deleted_at is null) with check (owner_id = auth.uid());
-- you see only your own memberships; counts are public through the view
create policy club_members_own on public.club_members for select to authenticated using (user_id = auth.uid());

create view public.public_clubs with (security_barrier = true) as
  select c.id as club_id, c.name, c.description, u.username as owner_username, c.created_at,
         (select count(*) from public.club_members m where m.club_id = c.id) as members_count
  from public.clubs c
  join public.users u on u.id = c.owner_id and u.deleted_at is null and u.hidden_at is null and u.username is not null
  where c.deleted_at is null and c.hidden_at is null and not public.is_blocked_with(c.owner_id);
revoke all on public.public_clubs from anon, authenticated;
grant select on public.public_clubs to anon, authenticated;

create function public.is_club_member(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.club_members m where m.club_id = p_club and m.user_id = auth.uid())
$$;

create function public.create_club(p_name text, p_description text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'sign_in_required' using errcode = 'P0001'; end if;
  if not public.current_user_verified() then raise exception 'email_not_verified' using errcode = 'P0001'; end if;
  if not public.current_user_has_username() then raise exception 'username_required' using errcode = 'P0001'; end if;
  perform public.enforce_rate_limit('club_create', 3, 86400);
  if exists (select 1 from public.clubs c where lower(c.name) = lower(trim(p_name)) and c.deleted_at is null) then
    raise exception 'club_name_taken' using errcode = 'P0001';
  end if;
  insert into public.clubs (owner_id, name, description) values (auth.uid(), trim(p_name), nullif(trim(coalesce(p_description, '')), ''))
    returning id into v_id;
  insert into public.club_members (club_id, user_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end $$;

create function public.join_club(p_club uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign_in_required' using errcode = 'P0001'; end if;
  if not public.current_user_has_username() then raise exception 'username_required' using errcode = 'P0001'; end if;
  perform public.enforce_rate_limit('club_join', 30, 3600);
  if not exists (select 1 from public.public_clubs pc where pc.club_id = p_club) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.club_members (club_id, user_id) values (p_club, auth.uid()) on conflict do nothing;
  return true;
end $$;

create function public.leave_club(p_club uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if exists (select 1 from public.club_members where club_id = p_club and user_id = auth.uid() and role = 'owner') then
    raise exception 'owner_cannot_leave' using errcode = 'P0001';
  end if;
  delete from public.club_members where club_id = p_club and user_id = auth.uid();
  get diagnostics n = row_count;
  return n > 0;
end $$;

create function public.soft_delete_club(p_club uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.clubs set deleted_at = now() where id = p_club and owner_id = auth.uid() and deleted_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- A user's own clubs (names and their role), for the "Your clubs" list.
create function public.my_clubs() returns table (club_id uuid, name text, role text, members_count bigint)
language sql stable security definer set search_path = '' as $$
  select pc.club_id, pc.name, m.role::text, pc.members_count
  from public.club_members m join public.public_clubs pc on pc.club_id = m.club_id
  where m.user_id = auth.uid()
  order by pc.name
$$;

-- ================================================================ posts, comments, likes

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  club_id uuid references public.clubs (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000 and body !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  -- optional link to one of the author's PUBLIC builds (checked on insert)
  build_vehicle_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  hidden_at timestamptz
);
create index posts_recent_idx on public.posts (created_at desc) where deleted_at is null;
create index posts_club_idx on public.posts (club_id, created_at desc) where deleted_at is null;
create index posts_author_idx on public.posts (author_id, created_at desc);
create trigger posts_updated_at before update on public.posts for each row execute function public.set_updated_at();
create trigger posts_rate_limit before insert on public.posts
  for each row execute function public.rate_limit_trigger('post', '20', '3600');

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  body text check (char_length(body) between 1 and 1000 and body !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  -- a Torq sticker instead of (or with) text: Dynorex+ only (spec: stickers usable in Paddock comments)
  sticker public.torq_sticker,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  hidden_at timestamptz,
  check (body is not null or sticker is not null)
);
create index comments_post_idx on public.comments (post_id, created_at) where deleted_at is null;
create trigger comments_rate_limit before insert on public.comments
  for each row execute function public.rate_limit_trigger('comment', '60', '3600');

create table public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create trigger post_likes_rate_limit before insert on public.post_likes
  for each row execute function public.rate_limit_trigger('like', '200', '3600');

create view public.public_posts with (security_barrier = true) as
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
    and (p.club_id is null or (c.deleted_at is null and c.hidden_at is null));

create view public.public_comments with (security_barrier = true) as
  select x.id as comment_id, x.post_id, u.username as author_username, x.body, x.sticker, x.created_at
  from public.comments x
  join public.public_posts pp on pp.post_id = x.post_id
  join public.users u on u.id = x.author_id and u.deleted_at is null and u.hidden_at is null and u.username is not null
  where x.deleted_at is null and x.hidden_at is null and not public.is_blocked_with(x.author_id);

revoke all on public.posts, public.comments, public.post_likes from anon, authenticated;
revoke all on public.public_posts, public.public_comments from anon, authenticated;
grant select on public.public_posts, public.public_comments to anon, authenticated;
grant select, insert (club_id, body, build_vehicle_id) on public.posts to authenticated;
grant select, insert (post_id, body, sticker) on public.comments to authenticated;
grant select, insert (post_id), delete on public.post_likes to authenticated;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_likes enable row level security;

create policy posts_own_select on public.posts for select to authenticated using (author_id = auth.uid() and deleted_at is null);
create policy posts_insert on public.posts for insert to authenticated
  with check (
    author_id = auth.uid() and public.current_user_verified() and public.current_user_has_username()
    and (club_id is null or public.is_club_member(club_id))
    and (build_vehicle_id is null or exists (
      select 1 from public.vehicles v where v.id = build_vehicle_id and v.owner_id = auth.uid() and v.visibility = 'public' and v.deleted_at is null))
  );
create policy comments_own_select on public.comments for select to authenticated using (author_id = auth.uid() and deleted_at is null);
create policy comments_insert on public.comments for insert to authenticated
  with check (
    author_id = auth.uid() and public.current_user_verified() and public.current_user_has_username()
    and exists (select 1 from public.public_posts pp where pp.post_id = comments.post_id)
    and (sticker is null or public.current_user_has_plus())
  );
create policy post_likes_own on public.post_likes for select to authenticated using (user_id = auth.uid());
create policy post_likes_insert on public.post_likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.public_posts pp where pp.post_id = post_likes.post_id));
create policy post_likes_delete on public.post_likes for delete to authenticated using (user_id = auth.uid());

create function public.soft_delete_post(p_post uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.posts set deleted_at = now() where id = p_post and author_id = auth.uid() and deleted_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;
create function public.soft_delete_comment(p_comment uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.comments set deleted_at = now() where id = p_comment and author_id = auth.uid() and deleted_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Feed: "following" = posts in your clubs, from people you follow, and your own; "all" = every public post.
-- Muted authors are left out of both. Every lookup is filtered to the caller's own follows / memberships /
-- mutes; signed out, "following" is empty and "all" still works.
create function public.paddock_feed(p_mode text default 'following', p_page integer default 0)
returns setof public.public_posts
language sql stable security definer set search_path = '' as $$
  select pp.* from public.public_posts pp
  join public.public_profiles a on a.username = pp.author_username
  where (p_mode = 'all'
         or a.user_id = auth.uid()
         or a.user_id in (select f.followee_id from public.follows f where f.follower_id = auth.uid())
         or pp.club_id in (select m.club_id from public.club_members m where m.user_id = auth.uid()))
    and a.user_id not in (select m.muted_id from public.mutes m where m.muter_id = auth.uid())
  order by pp.created_at desc, pp.post_id
  limit 20 offset least(greatest(p_page, 0), 50) * 20
$$;

-- ================================================================ group drives (events + route) and club events

alter table public.events
  add column kind text not null default 'meet' check (kind in ('meet', 'drive')),
  add column route_id uuid references public.routes (id) on delete set null,
  add column club_id uuid references public.clubs (id) on delete set null;
grant insert (kind, route_id, club_id), update (kind, route_id) on public.events to authenticated;

create function public.check_event_links() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.route_id is not null and (tg_op = 'INSERT' or new.route_id is distinct from old.route_id)
     and not exists (select 1 from public.public_routes pr where pr.route_id = new.route_id) then
    raise exception 'route_not_public' using errcode = 'P0001';
  end if;
  if new.kind = 'drive' and new.route_id is null then
    raise exception 'route_required' using errcode = 'P0001';
  end if;
  if new.club_id is not null and (tg_op = 'INSERT' or new.club_id is distinct from old.club_id)
     and not exists (select 1 from public.club_members m where m.club_id = new.club_id and m.user_id = new.organizer_id) then
    raise exception 'club_member_required' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger events_links before insert or update on public.events for each row execute function public.check_event_links();
revoke execute on function public.check_event_links() from public, anon, authenticated;

create or replace view public.public_events with (security_barrier = true) as
  select e.id as event_id, u.username as organizer_username, e.title, e.description, e.starts_at, e.ends_at,
         e.location_text, e.capacity, e.status,
         (select count(*) from public.event_rsvps r where r.event_id = e.id and r.status = 'going') as going_count,
         (select count(*) from public.event_rsvps r where r.event_id = e.id and r.status = 'interested') as interested_count,
         e.kind,
         case when exists (select 1 from public.public_routes pr where pr.route_id = e.route_id) then e.route_id end as route_id,
         e.club_id
  from public.events e
  join public.users u on u.id = e.organizer_id and u.deleted_at is null and u.hidden_at is null and u.username is not null
  where e.deleted_at is null and e.hidden_at is null and not public.is_blocked_with(e.organizer_id);

-- ================================================================ moderation for every v2 surface

alter table public.admin_moderation drop constraint admin_moderation_target_type_check;
alter table public.admin_moderation add constraint admin_moderation_target_type_check
  check (target_type in ('user', 'vehicle', 'build', 'mod', 'report', 'route', 'event', 'club', 'post', 'comment'));

create or replace function public.apply_moderation(
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
    if v_prior is null then raise exception 'report_not_found' using errcode = 'P0002'; end if;
    update public.reports set status = 'dismissed' where id = p_report_id;
    v_result := jsonb_build_object('status', 'dismissed');
    p_target_type := 'report';
    p_target_id := p_report_id;
  else
    case p_target_type
      when 'user' then
        select jsonb_build_object('hidden_at', t.hidden_at) into v_prior from public.users t where t.id = p_target_id;
        update public.users set hidden_at = v_hide where id = p_target_id;
      when 'vehicle', 'build' then
        v_vehicle := case when p_target_type = 'vehicle' then p_target_id
                          else (select b.vehicle_id from public.builds b where b.id = p_target_id) end;
        select jsonb_build_object('hidden_at', t.hidden_at) into v_prior from public.vehicles t where t.id = v_vehicle;
        update public.vehicles set hidden_at = v_hide where id = v_vehicle;
      when 'mod' then
        select jsonb_build_object('hidden_at', t.hidden_at) into v_prior from public.mods t where t.id = p_target_id;
        update public.mods set hidden_at = v_hide where id = p_target_id;
      when 'route' then
        select jsonb_build_object('hidden_at', t.hidden_at) into v_prior from public.routes t where t.id = p_target_id;
        update public.routes set hidden_at = v_hide where id = p_target_id;
      when 'event' then
        select jsonb_build_object('hidden_at', t.hidden_at) into v_prior from public.events t where t.id = p_target_id;
        update public.events set hidden_at = v_hide where id = p_target_id;
      when 'club' then
        select jsonb_build_object('hidden_at', t.hidden_at) into v_prior from public.clubs t where t.id = p_target_id;
        update public.clubs set hidden_at = v_hide where id = p_target_id;
      when 'post' then
        select jsonb_build_object('hidden_at', t.hidden_at) into v_prior from public.posts t where t.id = p_target_id;
        update public.posts set hidden_at = v_hide where id = p_target_id;
      when 'comment' then
        select jsonb_build_object('hidden_at', t.hidden_at) into v_prior from public.comments t where t.id = p_target_id;
        update public.comments set hidden_at = v_hide where id = p_target_id;
      else
        raise exception 'unsupported_target' using errcode = '22023';
    end case;
    if v_prior is null then raise exception 'target_not_found' using errcode = 'P0002'; end if;
    v_result := jsonb_build_object('hidden', p_action = 'hide_content');
    if p_report_id is not null then
      update public.reports set status = 'actioned' where id = p_report_id;
    end if;
  end if;

  insert into public.admin_moderation (moderator_id, action, target_type, target_id, report_id, reason, prior_state, result_state)
    values (p_moderator, p_action, p_target_type, p_target_id, p_report_id, p_reason, v_prior, v_result)
    returning id into v_audit;
  return v_audit;
end $$;
-- (create or replace keeps the service_role-only grant)

-- ================================================================ search: routes, events, clubs too

create index routes_search_idx on public.routes using gin (public.search_doc(title)) where deleted_at is null;
create index events_search_idx on public.events using gin (public.search_doc(title || ' ' || location_text)) where deleted_at is null;
create index clubs_search_idx on public.clubs using gin (public.search_doc(name)) where deleted_at is null;

create or replace function public.search_public(p_query text)
returns table (kind text, id uuid, vehicle_id uuid, label text, sublabel text, has_hero boolean,
               exact boolean, followers bigint, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_words text[];
  v_q text;
  v_ts tsquery;
  v_any tsquery;
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
  v_any := to_tsquery('simple', (select string_agg(w || ':*', ' | ') from unnest(v_words) w));

  return query
  with build_candidates as (
    select b.id from public.builds b where public.search_doc(b.title) @@ v_any
    union
    select b.id from public.builds b join public.vehicles v on v.id = b.vehicle_id
      where public.search_doc(v.make || ' ' || v.model || ' ' || v.year::text) @@ v_any
    union
    select b.id from public.builds b join public.users u on u.id = b.owner_id
      where public.search_doc(coalesce(u.username, '') || ' ' || coalesce(u.display_name, '')) @@ v_any
  ), user_candidates as (
    select u.id from public.users u
      where public.search_doc(coalesce(u.username, '') || ' ' || coalesce(u.display_name, '')) @@ v_ts
  ), mod_candidates as (
    select m.id from public.mods m
      where public.search_doc(m.name || ' ' || coalesce(m.brand, '') || ' ' || coalesce(m.part_number, '')) @@ v_ts
  )
  (select 'build'::text, pb.build_id, pb.vehicle_id, pb.title,
          pb.year || ' ' || pb.make || ' ' || pb.model || ' · @' || pb.owner_username,
          pb.has_hero,
          (lower(pb.make) = v_q or lower(pb.model) = v_q or pb.owner_username = v_q or lower(pb.title) = v_q
           or lower(pb.make || ' ' || pb.model) = v_q or pb.year::text = v_q),
          pb.followers_count, pb.last_activity_at
   from public.public_builds pb
   join public.users o on o.username = pb.owner_username
   where pb.build_id in (select bc.id from build_candidates bc)
     and public.search_doc(pb.title || ' ' || pb.make || ' ' || pb.model || ' ' || pb.year::text || ' '
                           || pb.owner_username) @@ v_ts
     and not exists (select 1 from public.mutes m where m.muter_id = auth.uid() and m.muted_id = o.id)
   order by 7 desc, 8 desc, 9 desc nulls last
   limit 10)
  union all
  (select 'user'::text, p.user_id, null::uuid, '@' || p.username, coalesce(p.display_name, ''), false,
          (p.username = v_q or lower(coalesce(p.display_name, '')) = v_q),
          p.followers_count, null::timestamptz
   from public.public_profiles p
   where p.user_id in (select uc.id from user_candidates uc)
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
   where pm.mod_id in (select mc.id from mod_candidates mc)
     and not exists (select 1 from public.mutes m where m.muter_id = auth.uid() and m.muted_id = o.id)
   order by 7 desc, 8 desc, 9 desc
   limit 10)
  union all
  (select 'route'::text, pr.route_id, null::uuid, pr.title,
          round(pr.distance_m / 1609.344, 1) || ' mi · @' || pr.owner_username,
          false, lower(pr.title) = v_q, pr.rating_count, pr.created_at
   from public.public_routes pr
   join public.users o on o.username = pr.owner_username
   where pr.route_id in (select r.id from public.routes r where public.search_doc(r.title) @@ v_ts)
     and not exists (select 1 from public.mutes m where m.muter_id = auth.uid() and m.muted_id = o.id)
   order by 7 desc, 8 desc, 9 desc
   limit 10)
  union all
  (select 'event'::text, pe.event_id, null::uuid, pe.title,
          to_char(pe.starts_at, 'Mon DD') || ' · ' || pe.location_text,
          false, lower(pe.title) = v_q, pe.going_count, pe.starts_at
   from public.public_events pe
   join public.users o on o.username = pe.organizer_username
   where pe.event_id in (select e.id from public.events e where public.search_doc(e.title || ' ' || e.location_text) @@ v_ts)
     and pe.status = 'scheduled' and pe.ends_at > now()
     and not exists (select 1 from public.mutes m where m.muter_id = auth.uid() and m.muted_id = o.id)
   order by 7 desc, 9 asc
   limit 10)
  union all
  (select 'club'::text, pc.club_id, null::uuid, pc.name, pc.members_count || ' members',
          false, lower(pc.name) = v_q, pc.members_count, pc.created_at
   from public.public_clubs pc
   where pc.club_id in (select c.id from public.clubs c where public.search_doc(c.name) @@ v_ts)
   order by 7 desc, 8 desc
   limit 10);
end $$;

-- ================================================================ grants

grant execute on function public.is_club_member(uuid) to authenticated;
grant execute on function public.create_club(text, text), public.join_club(uuid), public.leave_club(uuid),
  public.soft_delete_club(uuid), public.my_clubs(), public.soft_delete_post(uuid), public.soft_delete_comment(uuid)
  to authenticated;
grant execute on function public.paddock_feed(text, integer) to anon, authenticated;
