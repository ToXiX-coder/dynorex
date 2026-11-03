-- Driver gear: the little car person on a profile ("head:outfit:prop"). Null = dressed for the build goal.
-- Cosmetic only. The allowed ids are the same lists as src/domain/gear.ts (a unit test keeps them in sync).

alter table public.users
  add column driver_gear text
  check (driver_gear is null or driver_gear ~ '^(race_helmet|cap|beanie|headband|flat_cap|headset|shades|none):(race_suit|mechanic_jacket|hoodie|flannel|tee):(wrench|flag|trophy|keys|none)$');

-- Owners can set their own (RLS on users already limits updates to your own row).
grant update (driver_gear) on public.users to authenticated;

-- Shown on public profiles like the build goal it's based on.
create or replace view public.public_profiles with (security_barrier = true) as
  select u.id as user_id, u.username, u.display_name, u.bio, u.general_location,
         u.years_experience, u.build_goal, u.reputation, u.business_badge,
         (select count(*) from public.follows f where f.followee_id = u.id) as followers_count,
         (select count(*) from public.follows f where f.follower_id = u.id) as following_count,
         public.is_plus_member(u.id) as plus_member,
         u.driver_gear
  from public.users u
  where u.deleted_at is null and u.hidden_at is null and u.username is not null
    and not public.is_blocked_with(u.id);
