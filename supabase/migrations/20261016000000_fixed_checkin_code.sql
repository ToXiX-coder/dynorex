-- Owner decision (D-50): one check-in code per event instead of a new code every minute.
-- The code is made the first time the host opens check-in and stays the same for the whole event, so it can
-- be printed or put on a sign. Still protected: only "Going" RSVPs, only during the check-in window
-- (1 h before start to the end), 10 attempts an hour, once per person.

create or replace function public.event_checkin_code(p_event uuid) returns table (code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  v_code text;
begin
  select * into e from public.events where id = p_event and organizer_id = auth.uid() and deleted_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if e.status <> 'scheduled' or now() < e.starts_at - interval '1 hour' or now() > e.ends_at then
    raise exception 'checkin_closed' using errcode = 'P0001';
  end if;
  -- reuse the event's code (oldest first, so codes made under the old rotating rule settle on one)
  select c.code into v_code from app_private.event_checkin_codes c
    where c.event_id = p_event order by c.expires_at asc, c.code limit 1;
  if v_code is null then
    v_code := lpad((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % 1000000)::text, 6, '0');
  end if;
  delete from app_private.event_checkin_codes c where c.event_id = p_event and c.code <> v_code;
  -- expires_at now just records the event's end; the event window is what opens and closes check-in
  insert into app_private.event_checkin_codes as c (event_id, code, expires_at)
    values (p_event, v_code, e.ends_at)
    -- by constraint name: "code" and "expires_at" are also this function's output columns
    on conflict on constraint event_checkin_codes_pkey do update set expires_at = excluded.expires_at;
  return query select v_code, e.ends_at;
end $$;

create or replace function public.check_in_event(p_event uuid, p_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare e public.events;
begin
  if auth.uid() is null then
    raise exception 'sign_in_required' using errcode = 'P0001';
  end if;
  perform public.enforce_rate_limit('checkin', 10, 3600);
  select * into e from public.events where id = p_event and deleted_at is null;
  if not found or e.status <> 'scheduled' or now() < e.starts_at - interval '1 hour' or now() > e.ends_at then
    raise exception 'checkin_closed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.event_rsvps r where r.event_id = p_event and r.user_id = auth.uid() and r.status = 'going') then
    raise exception 'rsvp_required' using errcode = 'P0001';
  end if;
  if not exists (select 1 from app_private.event_checkin_codes c where c.event_id = p_event and c.code = p_code) then
    raise exception 'invalid_code' using errcode = 'P0001';
  end if;
  insert into public.event_checkins (event_id, user_id) values (p_event, auth.uid()) on conflict do nothing;
  return true;
end $$;

-- create or replace keeps grants, but restate them so this file stands on its own
revoke all on function public.event_checkin_code(uuid), public.check_in_event(uuid, text) from public, anon;
grant execute on function public.event_checkin_code(uuid), public.check_in_event(uuid, text) to authenticated;
