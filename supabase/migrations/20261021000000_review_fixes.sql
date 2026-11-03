-- Review fixes (2026-10-10), in their own migration so they apply whether or not 20261018-20261020 are already
-- on the project.

-- 1. Relisting a sold part now respects the listing limit (free 5 / Dynorex+ 25 up at once), like a new listing.
create or replace function public.set_listing_status(p_listing uuid, p_status public.listing_status) returns boolean
language plpgsql security definer set search_path = '' as $$
declare l public.listings;
begin
  select * into l from public.listings where id = p_listing and seller_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if l.status = p_status then return true; end if;
  if p_status = 'pending' then raise exception 'accept_an_offer' using errcode = 'P0001'; end if;
  if p_status = 'active' then
    -- a sold listing coming back counts against the limit again (a held one already counts)
    if l.status = 'sold' and (select count(*) from public.listings x
                              where x.seller_id = auth.uid() and x.deleted_at is null and x.status in ('active', 'pending'))
                             >= (case when public.user_has_plus(auth.uid()) then 25 else 5 end) then
      raise exception 'plan_limit_listings' using errcode = 'P0001';
    end if;
    update public.listing_offers set status = 'declined', responded_at = now()
      where listing_id = p_listing and status = 'accepted';
    update public.listings set status = 'active', sold_at = null where id = p_listing;
  else
    insert into public.notifications (recipient_id, actor_id, category, entity_type, entity_id, title, body)
      select o.buyer_id, auth.uid(), 'marketplace_sale_complete', 'listing', p_listing::text, 'Sale complete',
             format('%s is marked sold. Enjoy the part.', left(l.title, 80))
      from public.listing_offers o
      where o.listing_id = p_listing and o.status = 'accepted'
        and public.notification_enabled(o.buyer_id, 'marketplace_sale_complete');
    update public.listing_offers set status = 'declined', responded_at = now()
      where listing_id = p_listing and status = 'open';
    update public.listings set status = 'sold', sold_at = now() where id = p_listing;
  end if;
  return true;
end $$;

-- 2. Private clubs: the fast feed (migration 20261013) picks its page from the base tables with the public_posts rules, so it gets
-- the same members-only rule for private clubs (otherwise "Everyone" would show private club posts).
create or replace function public.paddock_feed(p_mode text default 'following', p_page integer default 0)
returns setof public.public_posts
language sql stable security definer set search_path = '' as $$
  with page as materialized (
    select p.id, p.author_id, p.club_id, p.body, p.build_vehicle_id, p.created_at, u.username, c.name as club_name
    from public.posts p
    join public.users u on u.id = p.author_id and u.deleted_at is null and u.hidden_at is null and u.username is not null
    left join public.clubs c on c.id = p.club_id
    where p.deleted_at is null and p.hidden_at is null
      and (p.club_id is null or (c.deleted_at is null and c.hidden_at is null
                                 and (c.visibility = 'public' or exists (
                                   select 1 from public.club_members cm where cm.club_id = c.id and cm.user_id = auth.uid()))))
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
