-- Dynorex Services (D-57): shops offer their services in Paddock. A business page per account (name, about, area,
-- optional public website / phone, specialties), a menu of services with honest pricing (fixed, from, or quote),
-- and in-app requests for a quote or booking with a private chat between the customer and the shop.
-- NO PAYMENTS and no verification beyond the staff-granted business badge. Behind the marketplace app flag.
-- Functions are private by default (migration 6): every grant below is deliberate.

alter type public.report_target add value if not exists 'business';
alter type public.notification_category add value if not exists 'service_request_received';
alter type public.notification_category add value if not exists 'service_request_update';

alter table public.notifications drop constraint notifications_entity_type_check;
alter table public.notifications add constraint notifications_entity_type_check
  check (entity_type in ('user','build','mod','event','listing','subscription','botw','business','service_request'));

create type public.service_price_type as enum ('fixed', 'from', 'quote');
create type public.service_request_status as enum ('open', 'accepted', 'declined', 'cancelled', 'completed');

-- ================================================================ business pages

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60 and name !~ '[\x01-\x1F\x7F]'),
  about text check (char_length(about) <= 2000 and about !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  -- a city or area, never a street address unless the shop types one into "about"
  location_text text not null check (char_length(location_text) between 2 and 80 and location_text !~ '[\x01-\x1F\x7F]'),
  -- public contact the business chooses to show; https only, digits-and-punctuation phone
  website text check (website ~ '^https://[^\s/$.?#][^\s]{1,200}$'),
  phone text check (phone ~ '^\+?[0-9 ().-]{7,20}$'),
  specialties public.mod_category[] not null default '{}' check (cardinality(specialties) <= 9),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  hidden_at timestamptz
);
-- one live business page per account
create unique index businesses_owner_uq on public.businesses (owner_id) where deleted_at is null;
create unique index businesses_name_uq on public.businesses (lower(name)) where deleted_at is null;
create trigger businesses_updated_at before update on public.businesses for each row execute function public.set_updated_at();
create trigger businesses_rate_limit before insert on public.businesses
  for each row execute function public.rate_limit_trigger('business_create', '3', '86400');

revoke all on public.businesses from anon, authenticated;
grant select on public.businesses to authenticated;
grant insert (name, about, location_text, website, phone, specialties) on public.businesses to authenticated;
grant update (name, about, location_text, website, phone, specialties) on public.businesses to authenticated;
alter table public.businesses enable row level security;
create policy businesses_own_select on public.businesses for select to authenticated
  using (owner_id = auth.uid() and deleted_at is null);
create policy businesses_insert on public.businesses for insert to authenticated
  with check (owner_id = auth.uid() and public.current_user_verified() and public.current_user_has_username());
create policy businesses_own_update on public.businesses for update to authenticated
  using (owner_id = auth.uid() and deleted_at is null) with check (owner_id = auth.uid());

create table public.business_services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- denormalised so RLS and the data export don't need a join
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80 and name !~ '[\x01-\x1F\x7F]'),
  description text check (char_length(description) <= 1000 and description !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  category public.mod_category not null,
  price_type public.service_price_type not null default 'quote',
  price_minor integer check (price_minor between 0 and 10000000),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  hidden_at timestamptz,
  -- a price only when it's fixed or a starting price; "quote" never shows a number
  check ((price_type = 'quote') = (price_minor is null))
);
create index business_services_business_idx on public.business_services (business_id) where deleted_at is null;
create trigger business_services_updated_at before update on public.business_services
  for each row execute function public.set_updated_at();

-- Services go only on your own business page, at most 30 live ones.
create function public.check_business_service() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.businesses b
                 where b.id = new.business_id and b.owner_id = new.owner_id and b.deleted_at is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.business_services s
                           where s.business_id = new.business_id and s.deleted_at is null) >= 30 then
    raise exception 'service_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger business_services_check before insert or update on public.business_services
  for each row execute function public.check_business_service();
revoke execute on function public.check_business_service() from public, anon, authenticated;

revoke all on public.business_services from anon, authenticated;
grant select on public.business_services to authenticated;
grant insert (business_id, name, description, category, price_type, price_minor, currency) on public.business_services to authenticated;
grant update (name, description, category, price_type, price_minor) on public.business_services to authenticated;
alter table public.business_services enable row level security;
create policy business_services_own_select on public.business_services for select to authenticated
  using (owner_id = auth.uid() and deleted_at is null);
create policy business_services_insert on public.business_services for insert to authenticated
  with check (owner_id = auth.uid());
create policy business_services_own_update on public.business_services for update to authenticated
  using (owner_id = auth.uid() and deleted_at is null) with check (owner_id = auth.uid());

create function public.soft_delete_business(p_business uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  -- services first: their trigger checks the business is still live
  update public.business_services set deleted_at = now()
    where business_id = p_business and owner_id = auth.uid() and deleted_at is null;
  update public.businesses set deleted_at = now() where id = p_business and owner_id = auth.uid() and deleted_at is null;
  get diagnostics n = row_count;
  if n > 0 then
    update public.service_requests set status = 'cancelled', updated_at = now()
      where business_id = p_business and status in ('open', 'accepted');
  end if;
  return n > 0;
end $$;

create function public.soft_delete_business_service(p_service uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.business_services set deleted_at = now() where id = p_service and owner_id = auth.uid() and deleted_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- ================================================================ requests (quote or booking)

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  service_id uuid references public.business_services (id) on delete set null,
  customer_id uuid not null references public.users (id) on delete cascade,
  -- what the customer drives, as text they chose to share ("2015 Subaru WRX"); never the VIN
  vehicle_text text check (char_length(vehicle_text) <= 80 and vehicle_text !~ '[\x01-\x1F\x7F]'),
  preferred_date date,
  message text not null check (char_length(message) between 1 and 1000 and message !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  status public.service_request_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_requests_business_idx on public.service_requests (business_id, created_at desc);
create index service_requests_customer_idx on public.service_requests (customer_id, created_at desc);
-- one live request per customer per service
create unique index service_requests_live_uq on public.service_requests (customer_id, service_id)
  where status in ('open', 'accepted');

revoke all on public.service_requests from anon, authenticated;
grant select on public.service_requests to authenticated;
alter table public.service_requests enable row level security;
-- customers read their own requests directly; shops read theirs through business_requests()
create policy service_requests_own on public.service_requests for select to authenticated using (customer_id = auth.uid());

-- What anyone can see. `verified` is the staff-granted business badge; nothing else is checked by Dynorex.
-- jobs_completed counts requests the shop marked done (owner-reported, not reviewed).
create view public.public_businesses with (security_barrier = true) as
  select b.id as business_id, u.username as owner_username, b.name, b.about, b.location_text, b.website, b.phone,
         b.specialties, u.business_badge as verified, b.created_at,
         (select count(*) from public.business_services s where s.business_id = b.id and s.deleted_at is null and s.hidden_at is null) as services_count,
         (select count(*) from public.service_requests r where r.business_id = b.id and r.status = 'completed') as jobs_completed
  from public.businesses b
  join public.users u on u.id = b.owner_id and u.deleted_at is null and u.hidden_at is null and u.username is not null
  where b.deleted_at is null and b.hidden_at is null and not public.is_blocked_with(b.owner_id)
    and not exists (select 1 from public.mutes m where m.muter_id = auth.uid() and m.muted_id = b.owner_id);

create view public.public_business_services with (security_barrier = true) as
  select s.id as service_id, s.business_id, s.name, s.description, s.category, s.price_type, s.price_minor, s.currency
  from public.business_services s
  join public.public_businesses pb on pb.business_id = s.business_id
  where s.deleted_at is null and s.hidden_at is null;


create function public.request_service(p_service uuid, p_vehicle text, p_date date, p_message text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  s public.business_services;
  b public.businesses;
  v_id uuid;
  v_name text;
begin
  if auth.uid() is null then raise exception 'sign_in_required' using errcode = 'P0001'; end if;
  if not public.current_user_verified() then raise exception 'email_not_verified' using errcode = 'P0001'; end if;
  if not public.current_user_has_username() then raise exception 'username_required' using errcode = 'P0001'; end if;
  select x.* into s from public.business_services x
    join public.public_business_services ps on ps.service_id = x.id
    where x.id = p_service;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into b from public.businesses where id = s.business_id;
  if b.owner_id = auth.uid() then raise exception 'own_business' using errcode = 'P0001'; end if;
  if p_date is not null and (p_date < current_date or p_date > current_date + 365) then
    raise exception 'invalid_date' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.service_requests r
             where r.customer_id = auth.uid() and r.service_id = p_service and r.status in ('open', 'accepted')) then
    raise exception 'request_exists' using errcode = 'P0001';
  end if;
  perform public.enforce_rate_limit('service_request', 10, 3600);
  insert into public.service_requests (business_id, service_id, customer_id, vehicle_text, preferred_date, message)
    values (b.id, p_service, auth.uid(), nullif(trim(coalesce(p_vehicle, '')), ''), p_date, trim(p_message))
    returning id into v_id;
  select u.username into v_name from public.users u where u.id = auth.uid();
  if public.notification_enabled(b.owner_id, 'service_request_received') then
    insert into public.notifications (recipient_id, actor_id, category, entity_type, entity_id, title, body)
      values (b.owner_id, auth.uid(), 'service_request_received', 'service_request', v_id::text, 'New request',
              format('@%s asked about %s.', v_name, left(s.name, 80)));
  end if;
  return v_id;
end $$;

-- Shop answers: open -> accepted / declined, accepted -> completed. Customer: open or accepted -> cancelled.
create function public.set_request_status(p_request uuid, p_status public.service_request_status) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  r public.service_requests;
  v_owner uuid;
  v_shop text;
begin
  select * into r from public.service_requests where id = p_request;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select b.owner_id, b.name into v_owner, v_shop from public.businesses b where b.id = r.business_id;
  if auth.uid() = v_owner then
    if not ((r.status = 'open' and p_status in ('accepted', 'declined')) or (r.status = 'accepted' and p_status = 'completed')) then
      raise exception 'request_closed' using errcode = 'P0001';
    end if;
  elsif auth.uid() = r.customer_id then
    if not (r.status in ('open', 'accepted') and p_status = 'cancelled') then
      raise exception 'request_closed' using errcode = 'P0001';
    end if;
  else
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.service_requests set status = p_status, updated_at = now() where id = p_request;
  if auth.uid() = v_owner and public.notification_enabled(r.customer_id, 'service_request_update') then
    insert into public.notifications (recipient_id, actor_id, category, entity_type, entity_id, title, body)
      values (r.customer_id, auth.uid(), 'service_request_update', 'service_request', p_request::text,
              case p_status when 'accepted' then 'Request accepted' when 'declined' then 'Request declined' else 'Job done' end,
              format('%s %s your request.', left(v_shop, 60),
                     case p_status when 'accepted' then 'accepted' when 'declined' then 'declined' else 'marked done' end));
  end if;
  return true;
end $$;

-- One request with its context, for the two people on it (or nothing).
create function public.service_request(p_request uuid) returns table (
  request_id uuid, role text, business_id uuid, business_name text, service_name text, customer_username text,
  vehicle_text text, preferred_date date, message text, status public.service_request_status, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select r.id, case when b.owner_id = auth.uid() then 'business' else 'customer' end, b.id, b.name, s.name, u.username,
         r.vehicle_text, r.preferred_date, r.message, r.status, r.created_at
  from public.service_requests r
  join public.businesses b on b.id = r.business_id
  left join public.business_services s on s.id = r.service_id
  join public.users u on u.id = r.customer_id
  where r.id = p_request and auth.uid() in (r.customer_id, b.owner_id)
$$;

-- Requests to your business (newest first; live ones on top). Blocked customers are left out.
create function public.business_requests() returns table (
  request_id uuid, service_name text, customer_username text, vehicle_text text, preferred_date date,
  status public.service_request_status, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select r.id, s.name, u.username, r.vehicle_text, r.preferred_date, r.status, r.created_at
  from public.service_requests r
  join public.businesses b on b.id = r.business_id and b.owner_id = auth.uid() and b.deleted_at is null
  left join public.business_services s on s.id = r.service_id
  join public.users u on u.id = r.customer_id and u.deleted_at is null and u.username is not null
  where not public.is_blocked_with(r.customer_id)
  order by (r.status in ('open', 'accepted')) desc, r.created_at desc
  limit 200
$$;

-- Requests you've sent.
create function public.my_service_requests() returns table (
  request_id uuid, business_id uuid, business_name text, service_name text, preferred_date date,
  status public.service_request_status, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select r.id, b.id, b.name, s.name, r.preferred_date, r.status, r.created_at
  from public.service_requests r
  join public.businesses b on b.id = r.business_id
  left join public.business_services s on s.id = r.service_id
  where r.customer_id = auth.uid()
  order by r.created_at desc
  limit 100
$$;

-- ================================================================ request chat (customer and shop only)

create table public.service_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  sender_id uuid not null references public.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000 and body !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  created_at timestamptz not null default now()
);
create index service_request_messages_idx on public.service_request_messages (request_id, created_at);
revoke all on public.service_request_messages from anon, authenticated;
grant select on public.service_request_messages to authenticated;
alter table public.service_request_messages enable row level security;
create policy service_request_messages_own on public.service_request_messages for select to authenticated
  using (sender_id = auth.uid());

create function app_private.request_party(p_request uuid) returns table (customer_id uuid, owner_id uuid, live boolean)
language sql stable security definer set search_path = '' as $$
  select r.customer_id, b.owner_id, r.status in ('open', 'accepted') and b.deleted_at is null
  from public.service_requests r join public.businesses b on b.id = r.business_id
  where r.id = p_request and auth.uid() in (r.customer_id, b.owner_id)
$$;

create function public.request_thread(p_request uuid) returns table (
  message_id uuid, mine boolean, sender_username text, body text, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select m.id, m.sender_id = auth.uid(), u.username, m.body, m.created_at
  from public.service_request_messages m
  join app_private.request_party(p_request) p on true
  join public.users u on u.id = m.sender_id
  where m.request_id = p_request
  order by m.created_at, m.id
  limit 500
$$;

create function public.send_request_message(p_request uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p record;
  v_id uuid;
begin
  select * into p from app_private.request_party(p_request);
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not p.live then raise exception 'request_closed' using errcode = 'P0001'; end if;
  if public.is_blocked_with(case when auth.uid() = p.customer_id then p.owner_id else p.customer_id end) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.enforce_rate_limit('request_message', 60, 3600);
  insert into public.service_request_messages (request_id, sender_id, body) values (p_request, auth.uid(), trim(p_body))
    returning id into v_id;
  return v_id;
end $$;

-- ================================================================ moderation: businesses too

alter table public.admin_moderation drop constraint admin_moderation_target_type_check;
alter table public.admin_moderation add constraint admin_moderation_target_type_check
  check (target_type in ('user', 'vehicle', 'build', 'mod', 'report', 'route', 'event', 'club', 'post', 'comment',
                         'listing', 'business'));

-- Hiding a business is its own small function so apply_moderation (migration 20261018) stays as is: moderators
-- call this through the same service-role path, and it writes the same audit row.
create function public.moderate_business(p_moderator uuid, p_business uuid, p_hide boolean, p_report_id uuid, p_reason text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_prior jsonb;
  v_audit uuid;
begin
  if not exists (select 1 from app_private.moderators m where m.user_id = p_moderator) then
    raise exception 'not_a_moderator' using errcode = '42501';
  end if;
  select jsonb_build_object('hidden_at', b.hidden_at) into v_prior from public.businesses b where b.id = p_business;
  if v_prior is null then raise exception 'target_not_found' using errcode = 'P0002'; end if;
  update public.businesses set hidden_at = case when p_hide then now() end where id = p_business;
  if p_report_id is not null then update public.reports set status = 'actioned' where id = p_report_id; end if;
  insert into public.admin_moderation (moderator_id, action, target_type, target_id, report_id, reason, prior_state, result_state)
    values (p_moderator, case when p_hide then 'hide_content' else 'restore_content' end, 'business', p_business,
            p_report_id, p_reason, v_prior, jsonb_build_object('hidden', p_hide))
    returning id into v_audit;
  return v_audit;
end $$;
revoke all on function public.moderate_business(uuid, uuid, boolean, uuid, text) from public, anon, authenticated;
grant execute on function public.moderate_business(uuid, uuid, boolean, uuid, text) to service_role;

-- ================================================================ grants

revoke all on public.public_businesses, public.public_business_services from anon, authenticated;
grant select on public.public_businesses, public.public_business_services to anon, authenticated;
revoke all on function app_private.request_party(uuid) from public, anon, authenticated;
grant execute on function public.soft_delete_business(uuid), public.soft_delete_business_service(uuid),
  public.request_service(uuid, text, date, text), public.set_request_status(uuid, public.service_request_status),
  public.service_request(uuid), public.business_requests(), public.my_service_requests(),
  public.request_thread(uuid), public.send_request_message(uuid, text)
  to authenticated;
