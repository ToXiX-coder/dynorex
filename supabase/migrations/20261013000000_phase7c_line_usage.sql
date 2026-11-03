-- Dynorex Phase 7, slice 3: the app shows the same monthly drive count the server enforces.
-- The Free limit counts deleted recordings too (D-42), so the app can't count its own list; it asks here.

create function public.my_route_usage() returns table (used integer, monthly_limit integer)
language sql stable security definer set search_path = '' as $$
  select public.route_monthly_count(auth.uid()),
         case when public.user_has_plus(auth.uid()) then null else 5 end
  where auth.uid() is not null
$$;
grant execute on function public.my_route_usage() to authenticated;

-- Performance (docs/perf/db-latency.json): the feed and the events list computed like/RSVP counts for every
-- visible row before paging. They now pick the page from indexed base tables with the same visibility rules
-- as the public views, then build only those 20 rows through the views. Results are unchanged.
create or replace function public.paddock_feed(p_mode text default 'following', p_page integer default 0)
returns setof public.public_posts
language sql stable security definer set search_path = '' as $$
  -- the page is chosen with exactly the public_posts visibility rules, then only those rows are built
  with page as materialized (
    select p.id, p.author_id, p.club_id, p.body, p.build_vehicle_id, p.created_at, u.username, c.name as club_name
    from public.posts p
    join public.users u on u.id = p.author_id and u.deleted_at is null and u.hidden_at is null and u.username is not null
    left join public.clubs c on c.id = p.club_id
    where p.deleted_at is null and p.hidden_at is null
      and (p.club_id is null or (c.deleted_at is null and c.hidden_at is null))
      and not public.is_blocked_with(p.author_id)
      and (p_mode = 'all'
           or p.author_id = auth.uid()
           or p.author_id in (select f.followee_id from public.follows f where f.follower_id = auth.uid())
           or p.club_id in (select m.club_id from public.club_members m where m.user_id = auth.uid()))
      and p.author_id not in (select m.muted_id from public.mutes m where m.muter_id = auth.uid())
    order by p.created_at desc, p.id
    limit 20 offset least(greatest(p_page, 0), 50) * 20
  )
  select pg.id, pg.username, pg.club_id, pg.club_name, pg.body,
         case when exists (select 1 from public.public_builds pb where pb.vehicle_id = pg.build_vehicle_id)
              then pg.build_vehicle_id end,
         pg.created_at,
         (select count(*) from public.post_likes l where l.post_id = pg.id),
         (select count(*) from public.comments x where x.post_id = pg.id and x.deleted_at is null and x.hidden_at is null)
  from page pg
  order by pg.created_at desc, pg.id
$$;
create or replace function public.upcoming_events(p_page integer default 0) returns setof public.public_events
language sql stable security definer set search_path = '' as $$
  select pe.* from public.public_events pe
  where pe.event_id in (
    select e.id from public.events e
    join public.users u on u.id = e.organizer_id and u.deleted_at is null and u.hidden_at is null and u.username is not null
    where e.deleted_at is null and e.hidden_at is null and e.status = 'scheduled' and e.ends_at > now()
      and not public.is_blocked_with(e.organizer_id)
      and not exists (select 1 from public.mutes m where m.muter_id = auth.uid() and m.muted_id = e.organizer_id)
    order by e.starts_at, e.id
    limit 20 offset least(greatest(p_page, 0), 50) * 20)
  order by pe.starts_at, pe.event_id
$$;
create index if not exists events_live_idx on public.events (starts_at, id)
  where deleted_at is null and hidden_at is null and status = 'scheduled';
