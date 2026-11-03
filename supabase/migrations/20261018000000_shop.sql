-- Dynorex Shop, slice 1 (D-56): a parts marketplace inside Paddock. Listings, offers, and a private thread
-- between the buyer and the seller on each offer. NO PAYMENTS: Dynorex doesn't take money or charge the
-- 5 % fee yet; buyers and sellers settle in person. Behind the marketplace app flag (off in production).
-- Functions are private by default (migration 6): every grant below is deliberate.

alter type public.report_target add value if not exists 'listing';

create type public.listing_condition as enum ('new', 'like_new', 'used', 'for_parts');
create type public.listing_status as enum ('active', 'pending', 'sold');
create type public.offer_status as enum ('open', 'accepted', 'declined', 'withdrawn');

-- ================================================================ listings

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 80 and title !~ '[\x01-\x1F\x7F]'),
  description text check (char_length(description) <= 2000 and description !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  category public.mod_category not null,
  condition public.listing_condition not null,
  -- minor units (cents); $0 means free to a good home; capped at $100,000
  price_minor integer not null check (price_minor between 0 and 10000000),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  -- free-text fitment, e.g. "2015-2021 WRX"
  fits text check (char_length(fits) <= 120 and fits !~ '[\x01-\x1F\x7F]'),
  -- a city or area, never an address
  location_text text not null check (char_length(location_text) between 2 and 80 and location_text !~ '[\x01-\x1F\x7F]'),
  -- set only by the register-photo Edge Function after it checks the file
  photo_path text,
  status public.listing_status not null default 'active',
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  hidden_at timestamptz
);
create index listings_recent_idx on public.listings (created_at desc) where deleted_at is null;
create index listings_seller_idx on public.listings (seller_id, created_at desc);
create trigger listings_updated_at before update on public.listings for each row execute function public.set_updated_at();
create trigger listings_rate_limit before insert on public.listings
  for each row execute function public.rate_limit_trigger('listing', '10', '86400');

-- Free sellers keep 5 listings up at once (active or pending), Dynorex+ 25.
create function public.enforce_listing_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_limit integer := case when public.user_has_plus(new.seller_id) then 25 else 5 end;
begin
  if (select count(*) from public.listings l
      where l.seller_id = new.seller_id and l.deleted_at is null and l.status in ('active', 'pending')) >= v_limit then
    raise exception 'plan_limit_listings' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger listings_limit before insert on public.listings
  for each row execute function public.enforce_listing_limit();
revoke execute on function public.enforce_listing_limit() from public, anon, authenticated;

revoke all on public.listings from anon, authenticated;
grant select on public.listings to authenticated;
grant insert (title, description, category, condition, price_minor, currency, fits, location_text) on public.listings to authenticated;
-- status changes go through set_listing_status() so offers stay consistent
grant update (title, description, category, condition, price_minor, fits, location_text) on public.listings to authenticated;
alter table public.listings enable row level security;
create policy listings_own_select on public.listings for select to authenticated
  using (seller_id = auth.uid() and deleted_at is null);
create policy listings_insert on public.listings for insert to authenticated
  with check (seller_id = auth.uid() and public.current_user_verified() and public.current_user_has_username());
create policy listings_own_update on public.listings for update to authenticated
  using (seller_id = auth.uid() and deleted_at is null) with check (seller_id = auth.uid());

-- What anyone can see. Sold listings stay up for 7 days so links don't break. Dynorex+ sellers' new listings
-- are boosted for their first 3 days ("priority listings"); nothing else about ranking is paid.
create view public.public_listings with (security_barrier = true) as
  select l.id as listing_id, u.username as seller_username, l.title, l.description, l.category, l.condition,
         l.price_minor, l.currency, l.fits, l.location_text, l.photo_path is not null as has_photo, l.status,
         l.created_at,
         (l.status = 'active' and l.created_at > now() - interval '3 days' and public.is_plus_member(l.seller_id)) as boosted
  from public.listings l
  join public.users u on u.id = l.seller_id and u.deleted_at is null and u.hidden_at is null and u.username is not null
  where l.deleted_at is null and l.hidden_at is null and not public.is_blocked_with(l.seller_id)
    and (l.status <> 'sold' or l.sold_at > now() - interval '7 days')
    and not exists (select 1 from public.mutes m where m.muter_id = auth.uid() and m.muted_id = l.seller_id);
revoke all on public.public_listings from anon, authenticated;
grant select on public.public_listings to anon, authenticated;

create function public.soft_delete_listing(p_listing uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.listings set deleted_at = now() where id = p_listing and seller_id = auth.uid() and deleted_at is null;
  get diagnostics n = row_count;
  if n > 0 then
    update public.listing_offers set status = 'declined', responded_at = now()
      where listing_id = p_listing and status in ('open', 'accepted');
  end if;
  return n > 0;
end $$;

-- ================================================================ offers

create table public.listing_offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  buyer_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  amount_minor integer not null check (amount_minor between 0 and 10000000),
  note text check (char_length(note) <= 500 and note !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  status public.offer_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz
);
-- one live offer per buyer per listing
create unique index listing_offers_live_uq on public.listing_offers (listing_id, buyer_id) where status in ('open', 'accepted');
create index listing_offers_buyer_idx on public.listing_offers (buyer_id, created_at desc);
create trigger listing_offers_updated_at before update on public.listing_offers
  for each row execute function public.set_updated_at();

revoke all on public.listing_offers from anon, authenticated;
grant select on public.listing_offers to authenticated;
alter table public.listing_offers enable row level security;
-- buyers read their own offers directly; sellers read offers through listing_offers_for()
create policy listing_offers_own on public.listing_offers for select to authenticated using (buyer_id = auth.uid());

create function app_private.money(p_minor integer, p_currency text) returns text
language sql immutable set search_path = '' as $$
  select case when p_currency = 'USD' then '$' else p_currency || ' ' end
         || case when p_minor % 100 = 0 then (p_minor / 100)::text else to_char(p_minor / 100.0, 'FM999999990.00') end
$$;

create function public.make_offer(p_listing uuid, p_amount integer, p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  l public.listings;
  v_id uuid;
  v_buyer text;
begin
  if auth.uid() is null then raise exception 'sign_in_required' using errcode = 'P0001'; end if;
  if not public.current_user_verified() then raise exception 'email_not_verified' using errcode = 'P0001'; end if;
  if not public.current_user_has_username() then raise exception 'username_required' using errcode = 'P0001'; end if;
  select x.* into l from public.listings x
    join public.public_listings pl on pl.listing_id = x.id
    where x.id = p_listing;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if l.seller_id = auth.uid() then raise exception 'own_listing' using errcode = 'P0001'; end if;
  if l.status <> 'active' then raise exception 'listing_unavailable' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 10000000 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  if exists (select 1 from public.listing_offers o
             where o.listing_id = p_listing and o.buyer_id = auth.uid() and o.status in ('open', 'accepted')) then
    raise exception 'offer_exists' using errcode = 'P0001';
  end if;
  perform public.enforce_rate_limit('offer', 20, 3600);
  insert into public.listing_offers (listing_id, buyer_id, amount_minor, note)
    values (p_listing, auth.uid(), p_amount, nullif(trim(coalesce(p_note, '')), ''))
    returning id into v_id;
  select u.username into v_buyer from public.users u where u.id = auth.uid();
  if public.notification_enabled(l.seller_id, 'marketplace_offer_received') then
    insert into public.notifications (recipient_id, actor_id, category, entity_type, entity_id, title, body)
      values (l.seller_id, auth.uid(), 'marketplace_offer_received', 'listing', p_listing::text, 'New offer',
              format('@%s offered %s for %s.', v_buyer, app_private.money(p_amount, l.currency), left(l.title, 80)));
  end if;
  return v_id;
end $$;

-- Seller accepts or declines an open offer. Accepting holds the listing (pending) and declines the rest.
create function public.respond_offer(p_offer uuid, p_accept boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  o public.listing_offers;
  l public.listings;
begin
  select * into o from public.listing_offers where id = p_offer;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into l from public.listings where id = o.listing_id and seller_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if o.status <> 'open' then raise exception 'offer_closed' using errcode = 'P0001'; end if;
  if not p_accept then
    update public.listing_offers set status = 'declined', responded_at = now() where id = p_offer;
    return true;
  end if;
  if l.status <> 'active' then raise exception 'listing_unavailable' using errcode = 'P0001'; end if;
  update public.listing_offers set status = 'accepted', responded_at = now() where id = p_offer;
  update public.listing_offers set status = 'declined', responded_at = now()
    where listing_id = l.id and id <> p_offer and status = 'open';
  update public.listings set status = 'pending' where id = l.id;
  if public.notification_enabled(o.buyer_id, 'marketplace_offer_accepted') then
    insert into public.notifications (recipient_id, actor_id, category, entity_type, entity_id, title, body)
      values (o.buyer_id, auth.uid(), 'marketplace_offer_accepted', 'listing', l.id::text, 'Offer accepted',
              format('Your %s offer for %s was accepted. Arrange pickup in the offer chat.',
                     app_private.money(o.amount_minor, l.currency), left(l.title, 80)));
  end if;
  return true;
end $$;

-- Buyer pulls an open or accepted offer. Pulling an accepted one puts the listing back up.
create function public.withdraw_offer(p_offer uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare o public.listing_offers;
begin
  select * into o from public.listing_offers where id = p_offer and buyer_id = auth.uid() and status in ('open', 'accepted');
  if not found then return false; end if;
  update public.listing_offers set status = 'withdrawn', responded_at = now() where id = p_offer;
  if o.status = 'accepted' then
    update public.listings set status = 'active' where id = o.listing_id and status = 'pending';
  end if;
  return true;
end $$;

-- Seller moves a listing between active, pending and sold. Relisting releases an accepted offer; selling
-- closes every open offer and tells the accepted buyer.
create function public.set_listing_status(p_listing uuid, p_status public.listing_status) returns boolean
language plpgsql security definer set search_path = '' as $$
declare l public.listings;
begin
  select * into l from public.listings where id = p_listing and seller_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if l.status = p_status then return true; end if;
  if p_status = 'pending' then raise exception 'accept_an_offer' using errcode = 'P0001'; end if;
  if p_status = 'active' then
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

-- The seller's own listings with live offer counts (any status, newest first).
create function public.my_listings() returns table (
  listing_id uuid, title text, category public.mod_category, condition public.listing_condition, price_minor integer,
  currency text, fits text, location_text text, description text, photo_path text, status public.listing_status,
  created_at timestamptz, open_offers bigint
)
language sql stable security definer set search_path = '' as $$
  select l.id, l.title, l.category, l.condition, l.price_minor, l.currency, l.fits, l.location_text, l.description,
         l.photo_path, l.status, l.created_at,
         (select count(*) from public.listing_offers o where o.listing_id = l.id and o.status = 'open')
  from public.listings l
  where l.seller_id = auth.uid() and l.deleted_at is null
  order by l.created_at desc
  limit 100
$$;

-- Offers on one of your listings (seller only). Buyers you've blocked, or who blocked you, are left out.
create function public.listing_offers_for(p_listing uuid) returns table (
  offer_id uuid, buyer_username text, amount_minor integer, note text, status public.offer_status, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select o.id, u.username, o.amount_minor, o.note, o.status, o.created_at
  from public.listing_offers o
  join public.listings l on l.id = o.listing_id and l.seller_id = auth.uid() and l.deleted_at is null
  join public.users u on u.id = o.buyer_id and u.deleted_at is null and u.username is not null
  where o.listing_id = p_listing and not public.is_blocked_with(o.buyer_id)
  order by (o.status in ('open', 'accepted')) desc, o.created_at desc
$$;

-- Offers you've made, with the listing they're on.
create function public.my_offers() returns table (
  offer_id uuid, listing_id uuid, listing_title text, seller_username text, amount_minor integer, currency text,
  note text, status public.offer_status, listing_status public.listing_status, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select o.id, l.id, l.title, u.username, o.amount_minor, l.currency, o.note, o.status, l.status, o.created_at
  from public.listing_offers o
  join public.listings l on l.id = o.listing_id and l.deleted_at is null
  join public.users u on u.id = l.seller_id and u.deleted_at is null
  where o.buyer_id = auth.uid()
  order by o.created_at desc
  limit 100
$$;

-- ================================================================ offer chat (buyer and seller only)

create table public.listing_messages (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.listing_offers (id) on delete cascade,
  sender_id uuid not null references public.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000 and body !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  created_at timestamptz not null default now()
);
create index listing_messages_offer_idx on public.listing_messages (offer_id, created_at);
revoke all on public.listing_messages from anon, authenticated;
grant select on public.listing_messages to authenticated;
alter table public.listing_messages enable row level security;
-- direct reads: only what you sent (the thread itself is read through offer_thread())
create policy listing_messages_own on public.listing_messages for select to authenticated using (sender_id = auth.uid());

-- The two people on an offer, or nobody.
create function app_private.offer_party(p_offer uuid) returns table (buyer_id uuid, seller_id uuid, live boolean)
language sql stable security definer set search_path = '' as $$
  select o.buyer_id, l.seller_id, o.status in ('open', 'accepted') and l.deleted_at is null
  from public.listing_offers o join public.listings l on l.id = o.listing_id
  where o.id = p_offer and auth.uid() in (o.buyer_id, l.seller_id)
$$;

create function public.offer_thread(p_offer uuid) returns table (
  message_id uuid, mine boolean, sender_username text, body text, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select m.id, m.sender_id = auth.uid(), u.username, m.body, m.created_at
  from public.listing_messages m
  join app_private.offer_party(p_offer) p on true
  join public.users u on u.id = m.sender_id
  where m.offer_id = p_offer
  order by m.created_at, m.id
  limit 500
$$;

create function public.send_offer_message(p_offer uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p record;
  v_id uuid;
begin
  select * into p from app_private.offer_party(p_offer);
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not p.live then raise exception 'offer_closed' using errcode = 'P0001'; end if;
  if public.is_blocked_with(case when auth.uid() = p.buyer_id then p.seller_id else p.buyer_id end) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.enforce_rate_limit('offer_message', 60, 3600);
  insert into public.listing_messages (offer_id, sender_id, body) values (p_offer, auth.uid(), trim(p_body))
    returning id into v_id;
  return v_id;
end $$;

-- ================================================================ moderation: listings too

alter table public.admin_moderation drop constraint admin_moderation_target_type_check;
alter table public.admin_moderation add constraint admin_moderation_target_type_check
  check (target_type in ('user', 'vehicle', 'build', 'mod', 'report', 'route', 'event', 'club', 'post', 'comment', 'listing'));

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
      when 'listing' then
        select jsonb_build_object('hidden_at', t.hidden_at) into v_prior from public.listings t where t.id = p_target_id;
        update public.listings set hidden_at = v_hide where id = p_target_id;
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

-- ================================================================ grants

revoke all on function app_private.money(integer, text), app_private.offer_party(uuid) from public, anon, authenticated;
grant execute on function public.soft_delete_listing(uuid), public.make_offer(uuid, integer, text),
  public.respond_offer(uuid, boolean), public.withdraw_offer(uuid),
  public.set_listing_status(uuid, public.listing_status), public.my_listings(), public.listing_offers_for(uuid),
  public.my_offers(), public.offer_thread(uuid), public.send_offer_message(uuid, text)
  to authenticated;
