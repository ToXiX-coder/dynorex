-- Dynorex Phase 6: hardening found by the schema audit (tests/integration/audit.test.ts).
--
-- 1. Trigger functions were executable by PUBLIC (Postgres' default for new functions). They can't be
--    called directly, but nothing should be callable that doesn't need to be. Triggers still fire:
--    Postgres doesn't check EXECUTE on the trigger function when a trigger runs.
-- 2. From now on new functions in public are NOT executable by default; each migration must grant
--    exactly what a role needs (the audit test lists what anon may run).

revoke execute on function
  public.apply_block(), public.enforce_plan_limits(), public.enforce_verified_publish(), public.forbid_change(),
  public.handle_new_auth_user(), public.notify_build_update(), public.notify_new_follower(),
  public.rate_limit_trigger(), public.set_updated_at(), public.sync_build_visibility(), public.touch_mod_status()
from public, anon, authenticated;

-- The PUBLIC execute default is global (per-schema defaults can only add to it), so remove it globally for
-- the role that runs migrations, and also clear the per-schema grants Supabase adds for its API roles.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- 3. Search performance (docs/perf/db-latency.json): search_public() computed full-text documents for every
--    row of the public views, so its GIN indexes were never used (p95 564 ms at 4,000 vehicles / 40,000
--    mods). Candidates now come from the indexed base-table expressions; visibility, muting and ranking
--    are applied exactly as before, through the public views, on those candidates only.
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
  -- a build can match with words spread over title, car and owner, so candidates match ANY word
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
   limit 10);
end $$;
-- (create or replace keeps the existing grants: authenticated only)

-- 4. Retention (docs/runbooks/operations.md): notifications older than 180 days and expired Nearby regions
--    are removed by a daily scheduled call (service role). Audit logs are not touched.
create function public.purge_expired_data() returns table (notifications integer, regions integer)
language plpgsql security definer set search_path = '' as $$
declare n integer; r integer;
begin
  delete from public.notifications where created_at < now() - interval '180 days';
  get diagnostics n = row_count;
  delete from app_private.user_regions where updated_at < now() - interval '30 days';
  get diagnostics r = row_count;
  delete from app_private.rate_events where created_at < now() - interval '1 day';
  return query select n, r;
end $$;
revoke all on function public.purge_expired_data() from public, anon, authenticated;
grant execute on function public.purge_expired_data() to service_role;
