-- Dynorex Phase 5: Dynorex+.
-- Subscription state derived ONLY from verified store events (App Store / Google Play via the
-- revenuecat-webhook and subscription-sync Edge Functions, service role). Clients can read their own
-- status and nothing else. Every Plus capability is checked here, never trusted from the app:
-- vehicle/mod limits (Phase 3 triggers, now honouring subscriptions), advanced specs, build analytics,
-- Torq sticker reactions, the profile badge, and capability definitions for routes/marketplace (v2).

-- ---------------------------------------------------------------- subscription state

create type public.sub_platform as enum ('app_store', 'play_store');
-- active: renewing · cancelled: auto-renew off, paid through expires_at · grace: billing problem, still
-- entitled until grace_until · billing_retry: past grace, not entitled · expired · refunded · revoked
create type public.sub_status as enum (
  'active', 'cancelled', 'grace', 'billing_retry', 'expired', 'refunded', 'revoked'
);

create table public.subscriptions (
  user_id uuid primary key references public.users (id) on delete cascade,
  platform public.sub_platform not null,
  product_id text not null check (product_id in ('dynorex_plus_monthly', 'dynorex_plus_annual')),
  -- the store's stable id for this subscription (one store subscription belongs to one account)
  original_transaction_id text not null unique check (char_length(original_transaction_id) between 1 and 128),
  status public.sub_status not null,
  period_start timestamptz,
  expires_at timestamptz,
  grace_until timestamptz,
  will_renew boolean not null default false,
  -- event time of the newest store event applied; older events arriving late never roll state back
  last_event_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Every store event received, once (idempotency), with what was done with it. Append-only.
create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('revenuecat', 'sync')),
  provider_event_id text not null unique check (char_length(provider_event_id) between 1 and 200),
  user_id uuid references public.users (id) on delete set null,
  event_type text not null,
  product_id text,
  event_at timestamptz not null,
  outcome text not null check (outcome in ('applied', 'stale', 'ignored')),
  received_at timestamptz not null default now()
);
create trigger subscription_events_append_only before update or delete on public.subscription_events
  for each row execute function public.forbid_change();
create index subscription_events_user_idx on public.subscription_events (user_id, event_at desc);

revoke all on public.subscriptions, public.subscription_events from anon, authenticated;
alter table public.subscriptions enable row level security;
alter table public.subscription_events enable row level security;
-- no client policies: status is read through my_subscription()

-- Is this subscription row entitled right now?
create function public.subscription_entitled(
  p_status public.sub_status, p_expires timestamptz, p_grace timestamptz
) returns boolean language sql stable set search_path = '' as $$
  select (p_status in ('active', 'cancelled') and p_expires > now())
      or (p_status = 'grace' and coalesce(p_grace, p_expires) > now())
$$;

-- Dynorex+ = a verified, currently entitled store subscription, or a staff/tester override.
create or replace function public.user_has_plus(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app_private.plan_overrides o where o.user_id = p_user)
      or exists (select 1 from public.subscriptions s
                 where s.user_id = p_user
                   and public.subscription_entitled(s.status, s.expires_at, s.grace_until))
$$;

-- For RLS policies and the app: answers only for the caller.
create function public.current_user_has_plus() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public.user_has_plus(auth.uid())
$$;
revoke all on function public.current_user_has_plus() from public, anon;
grant execute on function public.current_user_has_plus() to authenticated;

create function public.my_subscription()
returns table (plus boolean, status text, product_id text, platform text, expires_at timestamptz,
               grace_until timestamptz, will_renew boolean, via_override boolean)
language sql stable security definer set search_path = '' as $$
  select public.user_has_plus(auth.uid()),
         s.status::text, s.product_id, s.platform::text, s.expires_at, s.grace_until,
         coalesce(s.will_renew, false),
         exists (select 1 from app_private.plan_overrides o where o.user_id = auth.uid())
  from (select 1) one
  left join public.subscriptions s on s.user_id = auth.uid()
  where auth.uid() is not null
$$;
revoke all on function public.my_subscription() from public, anon;
grant execute on function public.my_subscription() to authenticated;

-- ---------------------------------------------------------------- applying store events
-- Called only by the Edge Functions (service role) after they have verified the event's origin.
-- Types: INITIAL_PURCHASE, RENEWAL, UNCANCELLATION, PRODUCT_CHANGE -> active; CANCELLATION -> cancelled
-- (still paid through expires_at); BILLING_ISSUE -> grace; BILLING_RETRY -> billing_retry; EXPIRATION ->
-- expired; REFUND -> refunded; REVOKE / TRANSFER_OUT -> revoked; SYNC -> the status given (from a
-- server-side read of the store's current state, used for restore).
-- Duplicate event ids are no-ops; events older than the newest applied one are recorded as stale.

create function public.apply_subscription_event(
  p_provider text, p_event_id text, p_user uuid, p_type text, p_platform public.sub_platform,
  p_product text, p_original_tx text, p_event_at timestamptz, p_period_start timestamptz,
  p_expires_at timestamptz, p_grace_until timestamptz, p_sync_status public.sub_status default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  cur public.subscriptions;
  v_status public.sub_status;
  v_renew boolean;
begin
  if exists (select 1 from public.subscription_events e where e.provider_event_id = p_event_id) then
    return 'duplicate';
  end if;
  if p_user is null or not exists (select 1 from public.users u where u.id = p_user) then
    insert into public.subscription_events (provider, provider_event_id, user_id, event_type, product_id, event_at, outcome)
      values (p_provider, p_event_id, null, p_type, p_product, p_event_at, 'ignored');
    return 'ignored';
  end if;

  v_status := case p_type
    when 'INITIAL_PURCHASE' then 'active'
    when 'RENEWAL' then 'active'
    when 'UNCANCELLATION' then 'active'
    when 'PRODUCT_CHANGE' then 'active'
    when 'CANCELLATION' then 'cancelled'
    when 'BILLING_ISSUE' then 'grace'
    when 'BILLING_RETRY' then 'billing_retry'
    when 'EXPIRATION' then 'expired'
    when 'REFUND' then 'refunded'
    when 'REVOKE' then 'revoked'
    when 'TRANSFER_OUT' then 'revoked'
    when 'SYNC' then p_sync_status
    else null
  end::public.sub_status;
  if v_status is null then
    insert into public.subscription_events (provider, provider_event_id, user_id, event_type, product_id, event_at, outcome)
      values (p_provider, p_event_id, p_user, p_type, p_product, p_event_at, 'ignored');
    return 'ignored';
  end if;
  v_renew := v_status = 'active' or v_status = 'grace';

  -- one writer per user at a time
  perform pg_advisory_xact_lock(hashtext('subscription:' || p_user::text));
  select * into cur from public.subscriptions s where s.user_id = p_user;

  if found and p_event_at < cur.last_event_at then
    insert into public.subscription_events (provider, provider_event_id, user_id, event_type, product_id, event_at, outcome)
      values (p_provider, p_event_id, p_user, p_type, p_product, p_event_at, 'stale');
    return 'stale';
  end if;

  -- the same store subscription can only belong to one account: a restore on another account moves it
  delete from public.subscriptions s where s.original_transaction_id = p_original_tx and s.user_id <> p_user;

  insert into public.subscriptions (user_id, platform, product_id, original_transaction_id, status, period_start,
                                    expires_at, grace_until, will_renew, last_event_at)
    values (p_user, p_platform, p_product, p_original_tx, v_status, p_period_start, p_expires_at,
            case when v_status = 'grace' then p_grace_until end, v_renew, p_event_at)
  on conflict (user_id) do update set
    platform = excluded.platform,
    product_id = excluded.product_id,
    original_transaction_id = excluded.original_transaction_id,
    status = excluded.status,
    period_start = coalesce(excluded.period_start, public.subscriptions.period_start),
    expires_at = coalesce(excluded.expires_at, public.subscriptions.expires_at),
    grace_until = excluded.grace_until,
    will_renew = excluded.will_renew,
    last_event_at = excluded.last_event_at;

  insert into public.subscription_events (provider, provider_event_id, user_id, event_type, product_id, event_at, outcome)
    values (p_provider, p_event_id, p_user, p_type, p_product, p_event_at, 'applied');
  return 'applied';
end $$;
revoke all on function public.apply_subscription_event(text, text, uuid, text, public.sub_platform, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz, public.sub_status) from public, anon, authenticated;
grant execute on function public.apply_subscription_event(text, text, uuid, text, public.sub_platform, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz, public.sub_status) to service_role;

-- ---------------------------------------------------------------- capabilities (server-defined)
-- One place that says what each plan can do (handoff spec 8.1). Limits that apply to v2 features (route
-- recordings, marketplace) are defined now so they can't drift; they are enforced when those ship.

create function public.plan_capabilities()
returns table (plus boolean, vehicle_limit integer, mods_per_vehicle_limit integer, route_recordings_per_month integer,
               advanced_specs boolean, build_analytics boolean, priority_listings boolean, torq_stickers boolean,
               profile_badge boolean, early_access boolean)
language sql stable security definer set search_path = '' as $$
  with p as (select public.user_has_plus(auth.uid()) as plus)
  select p.plus,
         case when p.plus then null else 2 end,
         case when p.plus then null else 20 end,
         case when p.plus then null else 5 end,
         p.plus, p.plus, p.plus, p.plus, p.plus, p.plus
  from p where auth.uid() is not null
$$;
revoke all on function public.plan_capabilities() from public, anon;
grant execute on function public.plan_capabilities() to authenticated;

-- ---------------------------------------------------------------- advanced specs (Plus)
-- Same formula and rounding as vehicle_spec_estimate(), plus: a projection if every planned and
-- in-progress mod were finished, and how much each category has contributed so far. Still estimates
-- from user-reported numbers; nothing new is invented.

create function public.advanced_spec_estimate(p_vehicle_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v public.vehicles;
  r jsonb;
begin
  if not public.current_user_has_plus() then
    raise exception 'plus_required' using errcode = 'P0001';
  end if;
  select * into v from public.vehicles where id = p_vehicle_id and deleted_at is null; -- RLS: owner only
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  with live as (
    select m.category, m.status,
           public.delta_in_base_unit(m.spec_deltas, 'hp') as hp,
           public.delta_in_base_unit(m.spec_deltas, 'torque') as tq,
           public.delta_in_base_unit(m.spec_deltas, 'weight') as wt,
           public.delta_in_base_unit(m.spec_deltas, 'zero_to_sixty') as zs
    from public.mods m where m.vehicle_id = p_vehicle_id and m.deleted_at is null
  ), proj as (
    select v.baseline_hp + coalesce(sum(hp), 0) as hp, v.baseline_torque_lbft + coalesce(sum(tq), 0) as tq,
           v.baseline_weight_lb + coalesce(sum(wt), 0) as wt, v.baseline_zero_to_sixty_s + coalesce(sum(zs), 0) as zs
    from live
  )
  select jsonb_build_object(
    'projected', (select jsonb_build_object(
        'hp', case when hp > 0 and hp < 5000 then round(hp, 0) end,
        'torque_lbft', case when tq > 0 and tq < 5000 then round(tq, 0) end,
        'weight_lb', case when wt > 100 and wt < 20000 then round(wt, 0) end,
        'zero_to_sixty_s', case when zs > 0 and zs < 60 then round(zs, 1) end,
        'lb_per_hp', case when hp > 0 and hp < 5000 and wt > 100 and wt < 20000 then round(wt / hp, 1) end)
      from proj),
    'by_category', coalesce((select jsonb_agg(c order by c ->> 'category') from (
        select jsonb_build_object('category', category, 'hp', round(sum(hp), 1), 'torque_lbft', round(sum(tq), 1),
                                  'weight_lb', round(sum(wt), 1), 'mods', count(*)) as c
        from live where status = 'complete' group by category) per_cat), '[]'::jsonb),
    'pending_mods', (select count(*) from live where status in ('planned', 'in_progress'))
  ) into r;
  return r;
end $$;
revoke all on function public.advanced_spec_estimate(uuid) from public, anon;
grant execute on function public.advanced_spec_estimate(uuid) to authenticated;

-- ---------------------------------------------------------------- build analytics (Plus)
-- Signed-in views of public build pages, one per viewer per build per day, owner's own views excluded.
-- Owners see totals only: never who viewed.

create table app_private.build_views (
  build_id uuid not null references public.builds (id) on delete cascade,
  viewer_id uuid not null references public.users (id) on delete cascade,
  day date not null default current_date,
  primary key (build_id, viewer_id, day)
);
create index build_views_build_day_idx on app_private.build_views (build_id, day);

create function public.record_build_view(p_vehicle_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_build uuid;
begin
  if auth.uid() is null then
    return;
  end if;
  select pb.build_id into v_build from public.public_builds pb
    join public.builds b on b.id = pb.build_id
    where pb.vehicle_id = p_vehicle_id and b.owner_id <> auth.uid();
  if v_build is not null then
    insert into app_private.build_views (build_id, viewer_id) values (v_build, auth.uid()) on conflict do nothing;
  end if;
end $$;
revoke all on function public.record_build_view(uuid) from public, anon;
grant execute on function public.record_build_view(uuid) to authenticated;

create function public.my_build_analytics(p_vehicle_id uuid)
returns table (views_7d integer, views_30d integer, followers integer, new_followers_7d integer,
               new_followers_30d integer, reactions integer)
language plpgsql stable security definer set search_path = '' as $$
declare v_build uuid;
begin
  if not public.current_user_has_plus() then
    raise exception 'plus_required' using errcode = 'P0001';
  end if;
  select b.id into v_build from public.builds b
    where b.vehicle_id = p_vehicle_id and b.owner_id = auth.uid() and b.deleted_at is null;
  if v_build is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return query select
    (select count(*)::integer from app_private.build_views w where w.build_id = v_build and w.day > current_date - 7),
    (select count(*)::integer from app_private.build_views w where w.build_id = v_build and w.day > current_date - 30),
    (select count(*)::integer from public.build_follows f where f.build_id = v_build),
    (select count(*)::integer from public.build_follows f where f.build_id = v_build and f.created_at > now() - interval '7 days'),
    (select count(*)::integer from public.build_follows f where f.build_id = v_build and f.created_at > now() - interval '30 days'),
    (select count(*)::integer from public.build_reactions r where r.build_id = v_build);
end $$;

-- ---------------------------------------------------------------- Torq sticker reactions (Plus to send)
-- Everyone can see reaction counts on public builds; only Dynorex+ members can add them (RLS calls the
-- server's own entitlement check). 60 reactions an hour.

create type public.torq_sticker as enum (
  'hype', 'wrenching', 'burnout', 'shrug', 'thumbs_up', 'fire', 'cop_spotted', 'rev_limiter',
  'track_ready', 'sleeping', 'money_eyes', 'wave'
);

create table public.build_reactions (
  build_id uuid not null references public.builds (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  sticker public.torq_sticker not null,
  created_at timestamptz not null default now(),
  primary key (build_id, user_id, sticker)
);
create index build_reactions_build_idx on public.build_reactions (build_id);
create trigger build_reactions_rate_limit before insert on public.build_reactions
  for each row execute function public.rate_limit_trigger('reaction', '60', '3600');

revoke all on public.build_reactions from anon, authenticated;
grant select, insert (build_id, sticker), delete on public.build_reactions to authenticated;
alter table public.build_reactions enable row level security;
create policy build_reactions_select_own on public.build_reactions for select to authenticated
  using (user_id = auth.uid());
create policy build_reactions_insert_plus on public.build_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.current_user_has_plus()
    and exists (select 1 from public.public_builds pb where pb.build_id = build_reactions.build_id)
  );
create policy build_reactions_delete_own on public.build_reactions for delete to authenticated
  using (user_id = auth.uid());

-- Counts per sticker on public builds (blocked owners and private builds drop out with public_builds).
create view public.public_build_reactions with (security_barrier = true) as
  select r.build_id, r.sticker, count(*) as reactions
  from public.build_reactions r
  join public.public_builds pb on pb.build_id = r.build_id
  where not public.is_blocked_with(r.user_id)
  group by r.build_id, r.sticker;
revoke all on public.public_build_reactions from anon, authenticated;
grant select on public.public_build_reactions to anon, authenticated;

-- ---------------------------------------------------------------- profile badge
-- Server-computed, appended to the public profile view. Functions in a view run with the viewer's
-- rights, so the view uses this narrow yes/no wrapper (the same fact the badge shows publicly).

create function public.is_plus_member(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.user_has_plus(p_user)
$$;
revoke all on function public.is_plus_member(uuid) from public;
grant execute on function public.is_plus_member(uuid) to anon, authenticated;

create or replace view public.public_profiles with (security_barrier = true) as
  select u.id as user_id, u.username, u.display_name, u.bio, u.general_location,
         u.years_experience, u.build_goal, u.reputation, u.business_badge,
         (select count(*) from public.follows f where f.followee_id = u.id) as followers_count,
         (select count(*) from public.follows f where f.follower_id = u.id) as following_count,
         public.is_plus_member(u.id) as plus_member
  from public.users u
  where u.deleted_at is null and u.hidden_at is null and u.username is not null
    and not public.is_blocked_with(u.id);

-- my_build_analytics references build_reactions, which now exists
revoke all on function public.my_build_analytics(uuid) from public, anon;
grant execute on function public.my_build_analytics(uuid) to authenticated;

-- ---------------------------------------------------------------- subscription notifications
-- Run daily by the scheduler (service role). "Expiring" 3 days before a cancelled (not renewing)
-- subscription ends; "expired" once it has ended. Each at most once per period; prefs respected.

create function public.queue_subscription_notifications() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer := 0; k integer;
begin
  insert into public.notifications (recipient_id, category, entity_type, entity_id, title, body)
  select s.user_id, 'subscription_expiring', 'subscription', 'plus', 'Dynorex+ ends soon',
         'Your Dynorex+ ends in 3 days. Renew in your store settings to keep it.'
  from public.subscriptions s
  where s.status = 'cancelled' and not s.will_renew
    and s.expires_at between now() + interval '2 days' and now() + interval '3 days'
    and public.notification_enabled(s.user_id, 'subscription_expiring')
    and not exists (select 1 from public.notifications x where x.recipient_id = s.user_id
                    and x.category = 'subscription_expiring' and x.created_at > now() - interval '7 days');
  get diagnostics k = row_count; n := n + k;

  insert into public.notifications (recipient_id, category, entity_type, entity_id, title, body)
  select s.user_id, 'subscription_expired', 'subscription', 'plus', 'Your Dynorex+ expired',
         'Renew to keep your unlimited builds and exclusive stickers.'
  from public.subscriptions s
  where not public.subscription_entitled(s.status, s.expires_at, s.grace_until)
    and s.status in ('expired', 'cancelled', 'billing_retry')
    and coalesce(s.grace_until, s.expires_at) between now() - interval '2 days' and now()
    and public.notification_enabled(s.user_id, 'subscription_expired')
    and not exists (select 1 from public.notifications x where x.recipient_id = s.user_id
                    and x.category = 'subscription_expired' and x.created_at > now() - interval '7 days');
  get diagnostics k = row_count; n := n + k;
  return n;
end $$;
revoke all on function public.queue_subscription_notifications() from public, anon, authenticated;
grant execute on function public.queue_subscription_notifications() to service_role;
