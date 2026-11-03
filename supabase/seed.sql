-- DEVELOPMENT-ONLY seed. Synthetic people and vehicles; no real names, VINs or places.
-- `supabase db reset` runs this locally. `supabase db push` (staging/production) never runs seed.sql.
-- Idempotent: safe to run more than once.
--
-- Covers: verified + unverified users, public / private vehicles, a build on a private vehicle
-- (must stay hidden), complete / planned / in-progress mods, a missing-baseline vehicle,
-- boundary costs (0 and a large value), follows and a notification.

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111111', 'sample.owner.one@example.test', now()),
  ('22222222-2222-4222-8222-222222222222', 'sample.owner.two@example.test', now()),
  ('33333333-3333-4333-8333-333333333333', 'sample.unverified@example.test', null)
on conflict (id) do nothing;

insert into public.users (id, username, display_name, bio, general_location, years_experience, build_goal, onboarding_step, onboarding_completed_at) values
  ('11111111-1111-4111-8111-111111111111', 'sample_track_rat', 'Sample Track Rat', 'Synthetic test account.', 'Sample Region', 6, 'track_build', 3, now()),
  ('22222222-2222-4222-8222-222222222222', 'sample_restomod', 'Sample Restomod', 'Synthetic test account.', null, 20, 'restomod', 3, now()),
  ('33333333-3333-4333-8333-333333333333', null, null, null, null, 0, null, 0, null)
-- the sign-up trigger already created these rows (no username); fill them in
on conflict (id) do update set username = excluded.username, display_name = excluded.display_name, bio = excluded.bio,
  general_location = excluded.general_location, years_experience = excluded.years_experience, build_goal = excluded.build_goal,
  onboarding_step = excluded.onboarding_step, onboarding_completed_at = excluded.onboarding_completed_at;

-- Vehicles. The VIN below is a made-up 17-character test value, not a real vehicle.
insert into public.vehicles (id, owner_id, year, make, model, trim_level, nickname, vin, odometer,
  baseline_hp, baseline_torque_lbft, baseline_weight_lb, baseline_zero_to_sixty_s, baseline_source, visibility) values
  ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 2004, 'Sample Motors', 'Coupe Demo', 'Base', 'Weekend car',
   'SAMPLEVXN00000001', 120400, 200, 180, 2800, 6.9, 'user_reported', 'public'),
  ('a0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 1999, 'Sample Motors', 'Roadster Demo', null, 'Project',
   null, null, null, null, null, null, null, 'private'),
  ('a0000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 1972, 'Example Auto', 'Classic Demo', null, null,
   null, 64000, 150, 200, 3100, null, 'user_reported', 'public')
on conflict (id) do nothing;

insert into public.builds (id, owner_id, vehicle_id, title, visibility) values
  ('b0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001', 'Coupe track prep', 'public'),
  -- public build on a PRIVATE vehicle: the public views must hide it
  ('b0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000002', 'Secret roadster', 'public'),
  ('b0000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000003', 'Classic restomod', 'public')
on conflict (id) do nothing;

insert into public.mods (id, owner_id, vehicle_id, name, category, brand, cost_minor, currency, status, spec_deltas, installed_on) values
  ('c0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001',
   'Sample coilovers', 'suspension', 'Sample Parts Co.', 125000, 'USD', 'complete', '{"schema_version":1,"weight":{"delta":-6,"unit":"lb"}}', '2026-03-14'),
  ('c0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001',
   'Sample intake', 'engine', 'Sample Parts Co.', 0, 'USD', 'complete', '{"schema_version":1,"hp":{"delta":8,"unit":"hp"}}', '2026-04-02'),
  ('c0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001',
   'Sample turbo kit', 'engine', null, 99999999999, 'USD', 'planned', '{"schema_version":1,"hp":{"delta":90,"unit":"hp"}}', null),
  ('c0000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000003',
   'Sample disc brake swap', 'safety', null, null, null, 'in_progress', '{"schema_version":1}', null)
on conflict (id) do nothing;

insert into public.follows (follower_id, followee_id) values
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111')
on conflict do nothing;

insert into public.build_follows (user_id, build_id) values
  ('22222222-2222-4222-8222-222222222222', 'b0000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into public.notifications (id, recipient_id, category, entity_type, entity_id, title, body) values
  ('d0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'new_follower', 'user', 'sample_restomod',
   'New follower', 'Someone started following you.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------- Phases 4-6 scenarios
-- Dynorex+ member (sample_track_rat, verified store state) and a lapsed member (sample_restomod), a
-- sticker reaction from the member, a notification preference turned off, and a staff moderator.
insert into public.subscriptions (user_id, platform, product_id, original_transaction_id, status, period_start,
  expires_at, will_renew, last_event_at) values
  ('11111111-1111-4111-8111-111111111111', 'app_store', 'dynorex_plus_annual', 'seed-tx-1', 'active',
   now() - interval '30 days', now() + interval '335 days', true, now() - interval '30 days'),
  ('22222222-2222-4222-8222-222222222222', 'play_store', 'dynorex_plus_monthly', 'seed-tx-2', 'expired',
   now() - interval '60 days', now() - interval '30 days', false, now() - interval '30 days')
on conflict (user_id) do nothing;

insert into public.build_reactions (build_id, user_id, sticker)
  select b.id, '11111111-1111-4111-8111-111111111111', 'hype'
  from public.builds b where b.title = 'Classic restomod'
on conflict do nothing;

insert into public.notification_prefs (user_id, category, enabled) values
  ('22222222-2222-4222-8222-222222222222', 'build_update', false)
on conflict do nothing;

insert into app_private.moderators (user_id) values ('22222222-2222-4222-8222-222222222222')
on conflict do nothing;
