-- D-63 (2026-10-14): changes from the investor-feedback rounds.
--   1. a shared dyno result says whether a photo of the shop's sheet is on file (the photo itself stays private;
--      register-photo attaches it). Evidence, not verification: Dynorex still doesn't check the number.
--   2. a club page shows its members' public builds (social proof for new members). An invite-only club's list is
--      for its members only, since it would show who belongs.

create or replace view public.public_dyno_results with (security_barrier = true) as
  select d.id as result_id, d.vehicle_id, d.measured_on, d.dyno, d.correction, d.shop, d.whp, d.wtq, d.fuel,
         (d.sheet_path is not null) as has_sheet
  from public.dyno_results d
  join public.public_builds pb on pb.vehicle_id = d.vehicle_id
  where d.deleted_at is null and d.shared;
revoke all on public.public_dyno_results from anon, authenticated;
grant select on public.public_dyno_results to anon, authenticated;

-- ================================================================ 2. members' builds on a club page

create function public.club_builds(p_club uuid) returns setof public.public_builds
language sql stable security definer set search_path = '' as $$
  select pb.* from public.clubs c
  join public.club_members m on m.club_id = c.id
  join public.users u on u.id = m.user_id
  join public.public_builds pb on pb.owner_username = u.username
  where c.id = p_club and c.deleted_at is null and c.hidden_at is null
    and (c.visibility = 'public'
         or exists (select 1 from public.club_members me where me.club_id = c.id and me.user_id = auth.uid()))
  order by pb.last_activity_at desc nulls last, pb.build_id
  limit 12
$$;
revoke all on function public.club_builds(uuid) from public, anon, authenticated;
grant execute on function public.club_builds(uuid) to anon, authenticated;