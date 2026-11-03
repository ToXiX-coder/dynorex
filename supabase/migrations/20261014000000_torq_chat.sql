-- Torq chat: community mod data for a car model, and the chat rate limit.
-- Behind the torqChat app flag (off in production until its own review: decision D-48).
--
-- mod_insights() aggregates ONLY public data, through the public views (so private, deleted, hidden and blocked
-- builds and mods never count). Privacy thresholds so nobody's individual build can be read back:
--   * a mod is listed only when at least 2 public builds use it;
--   * HP / weight changes are shown only when at least 3 owners reported them (completed mods only), and as a
--     RANGE (the middle half of what owners reported, 25th-75th percentile) with the typical (median) value, so
--     nobody expects one exact number from a part that varies car to car.
-- Costs, notes, VINs and usernames are never included.

create function public.mod_insights(p_make text, p_model text, p_year integer default null)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with cars as (
    select pb.vehicle_id
    from public.public_builds pb
    where lower(pb.make) = lower(trim(p_make))
      and (lower(pb.model) = lower(trim(p_model)) or lower(pb.model) like lower(trim(p_model)) || ' %')
      and (p_year is null or pb.year between p_year - 5 and p_year + 5)
  ), m as (
    select pm.vehicle_id,
           lower(regexp_replace(trim(pm.name), '\s+', ' ', 'g')) as key,
           pm.name,
           pm.category::text as category,
           pm.brand,
           pm.status::text as status,
           case when pm.status = 'complete' and mo.spec_deltas ? 'hp'
                then public.delta_in_base_unit(mo.spec_deltas, 'hp') end as hp,
           case when pm.status = 'complete' and mo.spec_deltas ? 'weight'
                then public.delta_in_base_unit(mo.spec_deltas, 'weight') end as wt
    from public.public_mods pm
    join cars c on c.vehicle_id = pm.vehicle_id
    join public.mods mo on mo.id = pm.mod_id
  ), g as (
    select key, category,
           count(distinct vehicle_id) as builds,
           mode() within group (order by name) as name,
           mode() within group (order by brand) filter (where brand is not null) as top_brand,
           round(avg((status = 'complete')::int) * 100) as complete_pct,
           count(hp) as hp_n,
           percentile_cont(0.25) within group (order by hp) as hp_low,
           percentile_cont(0.5) within group (order by hp) as hp_mid,
           percentile_cont(0.75) within group (order by hp) as hp_high,
           count(wt) as wt_n,
           percentile_cont(0.25) within group (order by wt) as wt_low,
           percentile_cont(0.75) within group (order by wt) as wt_high
    from m
    group by key, category
  )
  select jsonb_build_object(
    'make', trim(p_make),
    'model', trim(p_model),
    'year', p_year,
    'public_builds', (select count(*) from cars),
    'mods', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', x.name,
               'category', x.category,
               'builds', x.builds,
               'top_brand', x.top_brand,
               'complete_pct', x.complete_pct,
               'hp_gain_low', case when x.hp_n >= 3 then round(x.hp_low::numeric) end,
               'hp_gain_typical', case when x.hp_n >= 3 then round(x.hp_mid::numeric) end,
               'hp_gain_high', case when x.hp_n >= 3 then round(x.hp_high::numeric) end,
               'hp_reports', case when x.hp_n >= 3 then x.hp_n end,
               'weight_change_low_lb', case when x.wt_n >= 3 then round(x.wt_low::numeric) end,
               'weight_change_high_lb', case when x.wt_n >= 3 then round(x.wt_high::numeric) end
             ) order by x.builds desc, x.name)
      from (select * from g where builds >= 2 order by builds desc, name limit 15) x
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_object_agg(c2.category, c2.n)
      from (select category, count(distinct vehicle_id) as n from m group by category) c2
    ), '{}'::jsonb)
  )
$$;

-- Chat rate limit, checked by the torq-chat Edge Function as the signed-in user before every model call.
create function public.torq_chat_allow() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign_in_required' using errcode = 'P0001';
  end if;
  perform public.enforce_rate_limit('torq_chat_hour', 20, 3600);
  perform public.enforce_rate_limit('torq_chat_day', 60, 86400);
  return true;
end $$;

grant execute on function public.mod_insights(text, text, integer) to anon, authenticated;
grant execute on function public.torq_chat_allow() to authenticated;
