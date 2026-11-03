-- Buildmark core: a modified car's record that a buyer can weigh.
--
-- Rules applied throughout (see docs/product.md):
--  * RLS on every table; table rights revoked, then granted per column. Nothing is default-open.
--  * Entries are append-only. Clients can insert them but never UPDATE or DELETE: edits go through revise_entry,
--    which keeps the old version, and withdraw_entry, which leaves a visible withdrawn entry.
--  * Nothing is ever labelled verified. A shop confirmation records what the person who opened the shop link typed.
--  * Shops are never asked to confirm emissions-related work unless the part carries a CARB EO number (or the work
--    returned the car to stock): a confirmation would be a dated admission against the shop.
--  * The VIN never leaves the owner's account. Buyers can only ask "does this VIN match?" (rate-limited).
--  * Share and shop links are 64-hex bearer tokens; transfer codes are stored only as hashes.

create schema app_private;
revoke all on schema app_private from public;

create type public.entry_kind as enum ('install', 'removal', 'return_to_stock', 'service', 'dyno');
create type public.part_category as enum (
  'tune', 'intake', 'exhaust', 'forced_induction', 'fuel', 'engine_internal', 'suspension', 'wheels_tires', 'brakes',
  'drivetrain', 'aero_body', 'interior', 'lighting', 'electrical', 'other'
);
create type public.compliance as enum ('not_emissions_related', 'carb_eo', 'off_road_only', 'unknown');
create type public.installer_type as enum ('owner', 'shop');
create type public.odometer_unit as enum ('mi', 'km');
create type public.receipt_kind as enum ('receipt', 'dyno_sheet');
create type public.confirm_decision as enum ('confirmed', 'declined');

create function public.is_emissions_category(c public.part_category) returns boolean
language sql immutable set search_path = '' as $$
  select c in ('tune', 'intake', 'exhaust', 'forced_induction', 'fuel', 'engine_internal')
$$;

create function app_private.new_token() returns text
language sql volatile set search_path = '' as $$
  select encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex')
$$;
create function app_private.hash(t text) returns text
language sql immutable set search_path = '' as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;

-- ================================================================ cars and owners

create table public.cars (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  year smallint not null check (year between 1900 and 2100),
  make text not null check (char_length(make) between 1 and 40),
  model text not null check (char_length(model) between 1 and 60),
  trim_level text check (char_length(trim_level) <= 60),
  nickname text check (char_length(nickname) <= 40),
  vin text check (vin is null or vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  created_at timestamptz not null default now()
);
create index cars_owner on public.cars (owner_id);

-- Every owner the record has had. A former owner keeps a read-only copy of what was logged up to the sale.
create table public.ownerships (
  car_id uuid not null references public.cars (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  primary key (car_id, owner_id, started_at)
);
create unique index ownerships_one_current on public.ownerships (car_id) where ended_at is null;

create function app_private.start_ownership() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.ownerships (car_id, owner_id) values (new.id, new.owner_id);
  return new;
end $$;
create trigger cars_start_ownership after insert on public.cars
  for each row execute function app_private.start_ownership();

create function app_private.cars_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.cars where owner_id = new.owner_id) >= 25 then
    raise exception 'car_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger cars_limit before insert on public.cars for each row execute function app_private.cars_limit();

create function app_private.is_owner(p_car uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.cars c where c.id = p_car and c.owner_id = auth.uid())
$$;
-- Readable up to this moment: now() for the current owner, the sale date for a former one.
create function app_private.read_until(p_car uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select max(coalesce(o.ended_at, 'infinity'::timestamptz)) from public.ownerships o
  where o.car_id = p_car and o.owner_id = auth.uid()
$$;

alter table public.cars enable row level security;
alter table public.ownerships enable row level security;
revoke all on public.cars, public.ownerships from anon, authenticated;
-- No VIN or owner id in plain reads: a former owner keeps the record, not the new owner's details.
grant select (id, year, make, model, trim_level, nickname, created_at) on public.cars to authenticated;
grant insert (year, make, model, trim_level, nickname, vin) on public.cars to authenticated;
grant update (nickname, trim_level) on public.cars to authenticated;
grant select on public.ownerships to authenticated;

-- owner_id first: an INSERT ... RETURNING is checked before the ownership row exists.
create policy cars_read on public.cars for select to authenticated
  using (owner_id = auth.uid() or app_private.read_until(id) is not null);
create policy cars_insert on public.cars for insert to authenticated with check (owner_id = auth.uid());
create policy cars_update on public.cars for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy ownerships_read on public.ownerships for select to authenticated using (owner_id = auth.uid());

-- The signed-in person's garage: current cars with their VIN, and read-only copies of cars they sold.
create function public.my_cars() returns table (id uuid, year smallint, make text, model text, trim_level text,
  nickname text, vin text, archived boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, c.year, c.make, c.model, c.trim_level, c.nickname,
         case when c.owner_id = auth.uid() then c.vin end, c.owner_id <> auth.uid(), c.created_at
  from public.cars c
  where exists (select 1 from public.ownerships o where o.car_id = c.id and o.owner_id = auth.uid())
  order by c.owner_id <> auth.uid(), c.created_at desc
$$;

-- The VIN can be added once; changing it later would let a record be pointed at a different car.
create function public.set_car_vin(p_car uuid, p_vin text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_owner(p_car) then raise exception 'not_owner' using errcode = '42501'; end if;
  update public.cars set vin = upper(p_vin) where id = p_car and vin is null;
  if not found then raise exception 'vin_already_set' using errcode = 'P0001'; end if;
end $$;

-- Only a car that has never changed hands can be deleted, so a seller can't erase a record a buyer relied on.
create function public.delete_car(p_car uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_owner(p_car) then raise exception 'not_owner' using errcode = '42501'; end if;
  if (select count(*) from public.ownerships where car_id = p_car) > 1 then
    raise exception 'has_history' using errcode = 'P0001';
  end if;
  delete from public.cars where id = p_car;
end $$;

-- ================================================================ entries (append-only)

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars (id) on delete cascade,
  kind public.entry_kind not null,
  category public.part_category not null,
  title text not null check (char_length(title) between 1 and 80),
  part_brand text check (char_length(part_brand) <= 40),
  part_number text check (char_length(part_number) <= 40),
  carb_eo text check (carb_eo is null or carb_eo ~ '^D-[0-9]{1,4}-[0-9]{1,3}$'),
  compliance public.compliance not null,
  installer_type public.installer_type not null,
  installer_name text check (char_length(installer_name) between 2 and 80),
  performed_on date not null check (performed_on >= date '1900-01-01'),
  odometer integer check (odometer between 0 and 2000000),
  odometer_unit public.odometer_unit not null default 'mi',
  cost_cents integer check (cost_cents between 0 and 100000000),
  notes text check (char_length(notes) <= 1000),
  dyno_whp smallint check (dyno_whp between 1 and 3000),
  dyno_wtq smallint check (dyno_wtq between 1 and 3000),
  rev integer not null default 1,
  created_by uuid not null default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdraw_reason text check (char_length(withdraw_reason) <= 140),
  constraint entries_eo_needs_number check (compliance <> 'carb_eo' or carb_eo is not null),
  constraint entries_compliance_fits check (
    public.is_emissions_category(category) = (compliance <> 'not_emissions_related')),
  constraint entries_shop_named check (installer_type = 'owner' or installer_name is not null),
  constraint entries_dyno_only check (kind = 'dyno' or (dyno_whp is null and dyno_wtq is null))
);
create index entries_car on public.entries (car_id, performed_on);

-- Work can't be dated in the future (a day of slack for time zones).
create function app_private.entries_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.performed_on > current_date + 1 then raise exception 'future_date' using errcode = 'P0001'; end if;
  if tg_op = 'INSERT' and (select count(*) from public.entries where car_id = new.car_id) >= 500 then
    raise exception 'entry_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger entries_guard before insert or update on public.entries
  for each row execute function app_private.entries_guard();

-- Each edit keeps the version it replaced. Also notes removed receipts, so nothing disappears silently.
create table public.entry_revisions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete cascade,
  rev integer not null,
  snapshot jsonb,
  changed text[] not null,
  reason text not null check (char_length(reason) between 1 and 140),
  edited_at timestamptz not null default now()
);
create index entry_revisions_entry on public.entry_revisions (entry_id, edited_at);

alter table public.entries enable row level security;
alter table public.entry_revisions enable row level security;
revoke all on public.entries, public.entry_revisions from anon, authenticated;
grant select on public.entries, public.entry_revisions to authenticated;
grant insert (car_id, kind, category, title, part_brand, part_number, carb_eo, compliance, installer_type,
  installer_name, performed_on, odometer, odometer_unit, cost_cents, notes, dyno_whp, dyno_wtq)
  on public.entries to authenticated;

create policy entries_read on public.entries for select to authenticated
  using (created_at <= app_private.read_until(car_id));
create policy entries_insert on public.entries for insert to authenticated
  with check (app_private.is_owner(car_id) and created_by = auth.uid());
create policy entry_revisions_read on public.entry_revisions for select to authenticated
  using (exists (select 1 from public.entries e where e.id = entry_id));

create function public.revise_entry(p_entry uuid, p_patch jsonb, p_reason text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  old_row public.entries;
  new_row public.entries;
  allowed text[] := array['category', 'title', 'part_brand', 'part_number', 'carb_eo', 'compliance', 'installer_type',
    'installer_name', 'performed_on', 'odometer', 'odometer_unit', 'cost_cents', 'notes', 'dyno_whp', 'dyno_wtq'];
  k text;
  diff text[] := '{}';
begin
  select * into old_row from public.entries where id = p_entry for update;
  if not found or not app_private.is_owner(old_row.car_id) then raise exception 'not_owner' using errcode = '42501'; end if;
  if old_row.withdrawn_at is not null then raise exception 'withdrawn' using errcode = 'P0001'; end if;
  if coalesce(char_length(trim(p_reason)), 0) = 0 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    if not k = any (allowed) then raise exception 'bad_field' using errcode = 'P0001'; end if;
  end loop;
  new_row := jsonb_populate_record(old_row, p_patch);
  foreach k in array allowed loop
    if (to_jsonb(old_row) -> k) is distinct from (to_jsonb(new_row) -> k) then diff := diff || k; end if;
  end loop;
  if cardinality(diff) = 0 then raise exception 'no_change' using errcode = 'P0001'; end if;

  insert into public.entry_revisions (entry_id, rev, snapshot, changed, reason)
  values (p_entry, old_row.rev, to_jsonb(old_row) - 'created_by', diff, trim(p_reason));
  update public.entries set
    category = new_row.category, title = new_row.title, part_brand = new_row.part_brand,
    part_number = new_row.part_number, carb_eo = new_row.carb_eo, compliance = new_row.compliance,
    installer_type = new_row.installer_type, installer_name = new_row.installer_name,
    performed_on = new_row.performed_on, odometer = new_row.odometer, odometer_unit = new_row.odometer_unit,
    cost_cents = new_row.cost_cents, notes = new_row.notes, dyno_whp = new_row.dyno_whp, dyno_wtq = new_row.dyno_wtq,
    rev = old_row.rev + 1, updated_at = now()
  where id = p_entry;
  return old_row.rev + 1;
end $$;

create function public.withdraw_entry(p_entry uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_car uuid;
begin
  select car_id into v_car from public.entries where id = p_entry and withdrawn_at is null;
  if v_car is null or not app_private.is_owner(v_car) then raise exception 'not_owner' using errcode = '42501'; end if;
  update public.entries set withdrawn_at = now(), withdraw_reason = nullif(trim(p_reason), '') where id = p_entry;
end $$;

-- ================================================================ receipts and dyno sheets

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

create policy receipts_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy receipts_read_own on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and owner = auth.uid());

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete cascade,
  kind public.receipt_kind not null,
  storage_path text not null unique,
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size integer check (byte_size between 1 and 10485760),
  uploaded_at timestamptz not null default now(),
  removed_at timestamptz
);
create index receipts_entry on public.receipts (entry_id);
alter table public.receipts enable row level security;
revoke all on public.receipts from anon, authenticated;
grant select (id, entry_id, kind, storage_path, sha256, byte_size, uploaded_at, removed_at) on public.receipts to authenticated;
create policy receipts_read on public.receipts for select to authenticated
  using (exists (select 1 from public.entries e where e.id = entry_id));

-- Registers a file the owner has already uploaded to their own folder. The upload time is the server's.
create function public.add_receipt(p_entry uuid, p_kind public.receipt_kind, p_path text, p_sha256 text, p_size integer)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_car uuid; v_id uuid;
begin
  select car_id into v_car from public.entries where id = p_entry and withdrawn_at is null;
  if v_car is null or not app_private.is_owner(v_car) then raise exception 'not_owner' using errcode = '42501'; end if;
  if not exists (select 1 from storage.objects o
                 where o.bucket_id = 'receipts' and o.name = p_path and o.owner = auth.uid()) then
    raise exception 'file_missing' using errcode = 'P0001';
  end if;
  if (select count(*) from public.receipts where entry_id = p_entry and removed_at is null) >= 6 then
    raise exception 'receipt_limit' using errcode = 'P0001';
  end if;
  insert into public.receipts (entry_id, kind, storage_path, sha256, byte_size)
  values (p_entry, p_kind, p_path, lower(p_sha256), p_size) returning id into v_id;
  return v_id;
end $$;

-- A receipt can be taken down (it might show a home address), but the record says so.
create function public.remove_receipt(p_receipt uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.receipts; v_car uuid;
begin
  select * into r from public.receipts where id = p_receipt and removed_at is null;
  select car_id into v_car from public.entries where id = r.entry_id;
  if r.id is null or not app_private.is_owner(v_car) then raise exception 'not_owner' using errcode = '42501'; end if;
  update public.receipts set removed_at = now() where id = p_receipt;
  insert into public.entry_revisions (entry_id, rev, snapshot, changed, reason)
  select r.entry_id, e.rev, null, array['receipts'],
         case r.kind when 'receipt' then 'Removed a receipt uploaded ' else 'Removed a dyno sheet uploaded ' end
           || to_char(r.uploaded_at, 'YYYY-MM-DD')
  from public.entries e where e.id = r.entry_id;
end $$;

-- ================================================================ shop confirmation

create table app_private.confirm_requests (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete cascade,
  token text not null unique,
  rev integer not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  closed_at timestamptz
);

create table public.confirmations (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete cascade,
  rev integer not null,
  decision public.confirm_decision not null,
  shop_name text not null check (char_length(shop_name) between 2 and 80),
  shop_city text check (char_length(shop_city) <= 60),
  odometer integer check (odometer between 0 and 2000000),
  note text check (char_length(note) <= 280),
  at timestamptz not null default now()
);
create index confirmations_entry on public.confirmations (entry_id, at desc);
alter table public.confirmations enable row level security;
revoke all on public.confirmations from anon, authenticated;
grant select on public.confirmations to authenticated;
create policy confirmations_read on public.confirmations for select to authenticated
  using (exists (select 1 from public.entries e where e.id = entry_id));

-- Mirrors confirmBlock in src/domain/compliance.ts.
create function app_private.confirm_block(e public.entries) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when e.withdrawn_at is not null then 'withdrawn'
    when e.installer_type <> 'shop' then 'not_shop'
    when exists (select 1 from public.confirmations c where c.entry_id = e.id and c.rev = e.rev and c.decision = 'confirmed')
      then 'already_confirmed'
    when e.kind = 'return_to_stock' then null
    when not public.is_emissions_category(e.category) then null
    when e.compliance = 'carb_eo' and e.carb_eo is not null then null
    else 'emissions'
  end
$$;

-- Makes (or re-sends) the link the owner passes to the shop. One open link per entry.
create function public.request_confirmation(p_entry uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare e public.entries; v_block text; v_token text;
begin
  select * into e from public.entries where id = p_entry;
  if not found or not app_private.is_owner(e.car_id) then raise exception 'not_owner' using errcode = '42501'; end if;
  v_block := app_private.confirm_block(e);
  if v_block is not null then raise exception '%', v_block using errcode = 'P0001'; end if;
  select token into v_token from app_private.confirm_requests
  where entry_id = p_entry and rev = e.rev and closed_at is null and expires_at > now();
  if v_token is not null then return v_token; end if;
  if (select count(*) from app_private.confirm_requests
      where created_by = auth.uid() and created_at > now() - interval '1 day') >= 50 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  update app_private.confirm_requests set closed_at = now() where entry_id = p_entry and closed_at is null;
  v_token := app_private.new_token();
  insert into app_private.confirm_requests (entry_id, token, rev, created_by) values (p_entry, v_token, e.rev, auth.uid());
  return v_token;
end $$;

-- What the shop sees: the job, never the owner, VIN or cost.
create function public.shop_view(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r app_private.confirm_requests; e public.entries; c public.cars; v_status text;
begin
  select * into r from app_private.confirm_requests where token = p_token;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select * into e from public.entries where id = r.entry_id;
  select * into c from public.cars where id = e.car_id;
  v_status := case
    when r.closed_at is not null then 'closed'
    when r.expires_at <= now() then 'expired'
    when e.rev <> r.rev or e.withdrawn_at is not null then 'changed'
    else 'open' end;
  return jsonb_build_object(
    'status', v_status,
    'car', jsonb_build_object('year', c.year, 'make', c.make, 'model', c.model, 'trim', c.trim_level),
    'entry', jsonb_build_object('kind', e.kind, 'category', e.category, 'title', e.title, 'part_brand', e.part_brand,
      'part_number', e.part_number, 'carb_eo', e.carb_eo, 'installer_name', e.installer_name,
      'performed_on', e.performed_on, 'odometer', e.odometer, 'odometer_unit', e.odometer_unit));
end $$;

create function public.confirm_install(p_token text, p_decision public.confirm_decision, p_shop_name text,
  p_shop_city text, p_odometer integer, p_note text) returns text
language plpgsql security definer set search_path = '' as $$
declare r app_private.confirm_requests; e public.entries;
begin
  select * into r from app_private.confirm_requests where token = p_token for update;
  if not found then return 'not_found'; end if;
  if r.closed_at is not null then return 'closed'; end if;
  if r.expires_at <= now() then return 'expired'; end if;
  select * into e from public.entries where id = r.entry_id;
  if e.rev <> r.rev or e.withdrawn_at is not null then return 'changed'; end if;
  if p_decision = 'confirmed' and app_private.confirm_block(e) is not null then return 'not_allowed'; end if;
  insert into public.confirmations (entry_id, rev, decision, shop_name, shop_city, odometer, note)
  values (e.id, e.rev, p_decision, trim(p_shop_name), nullif(trim(p_shop_city), ''), p_odometer, nullif(trim(p_note), ''));
  update app_private.confirm_requests set closed_at = now() where id = r.id;
  return 'ok';
end $$;

-- The owner's open shop link for an entry, to copy again.
create function public.my_confirm_link(p_entry uuid) returns text
language sql stable security definer set search_path = '' as $$
  select r.token from app_private.confirm_requests r join public.entries e on e.id = r.entry_id
  where r.entry_id = p_entry and app_private.is_owner(e.car_id) and r.closed_at is null and r.expires_at > now()
    and r.rev = e.rev
$$;

-- ================================================================ share link (the buyer's view)

create table app_private.share_links (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create table app_private.vin_checks (
  link_id uuid not null references app_private.share_links (id) on delete cascade,
  at timestamptz not null default now()
);

create function public.create_share_link(p_car uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if not app_private.is_owner(p_car) then raise exception 'not_owner' using errcode = '42501'; end if;
  select token into v_token from app_private.share_links where car_id = p_car and revoked_at is null;
  if v_token is not null then return v_token; end if;
  v_token := app_private.new_token();
  insert into app_private.share_links (car_id, token) values (p_car, v_token);
  return v_token;
end $$;

create function public.my_share_link(p_car uuid) returns text
language sql stable security definer set search_path = '' as $$
  select s.token from app_private.share_links s
  where s.car_id = p_car and s.revoked_at is null and app_private.is_owner(p_car)
$$;

create function public.revoke_share_link(p_car uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_owner(p_car) then raise exception 'not_owner' using errcode = '42501'; end if;
  update app_private.share_links set revoked_at = now() where car_id = p_car and revoked_at is null;
end $$;

-- The whole record a buyer sees: every owner's entries, withdrawn ones included, every edit, every confirmation.
-- Left out: VIN, owner identities, costs, private notes and the receipt files themselves.
create function public.public_record(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s app_private.share_links; c public.cars;
begin
  select * into s from app_private.share_links where token = p_token and revoked_at is null;
  if not found then return null; end if;
  select * into c from public.cars where id = s.car_id;
  return jsonb_build_object(
    'car', jsonb_build_object('year', c.year, 'make', c.make, 'model', c.model, 'trim', c.trim_level),
    'owners', (select count(distinct owner_id) from public.ownerships where car_id = c.id),
    'owner_since', (select started_at from public.ownerships where car_id = c.id and ended_at is null),
    'entries', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'kind', e.kind, 'category', e.category, 'title', e.title, 'part_brand', e.part_brand,
        'part_number', e.part_number, 'carb_eo', e.carb_eo, 'compliance', e.compliance,
        'installer_type', e.installer_type, 'installer_name', e.installer_name, 'performed_on', e.performed_on,
        'odometer', e.odometer, 'odometer_unit', e.odometer_unit, 'dyno_whp', e.dyno_whp, 'dyno_wtq', e.dyno_wtq,
        'rev', e.rev, 'created_at', e.created_at, 'withdrawn_at', e.withdrawn_at, 'withdraw_reason', e.withdraw_reason,
        'receipts', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind,
            'uploaded_at', r.uploaded_at, 'sha256', r.sha256) order by r.uploaded_at)
          from public.receipts r where r.entry_id = e.id and r.removed_at is null), '[]'::jsonb),
        'confirmation', (select jsonb_build_object('decision', k.decision, 'shop_name', k.shop_name,
            'shop_city', k.shop_city, 'odometer', k.odometer, 'note', k.note, 'at', k.at, 'rev', k.rev)
          from public.confirmations k where k.entry_id = e.id order by k.at desc limit 1),
        'revisions', coalesce((select jsonb_agg(jsonb_build_object('rev', v.rev, 'at', v.edited_at,
            'reason', v.reason, 'changed', v.changed) order by v.edited_at)
          from public.entry_revisions v where v.entry_id = e.id), '[]'::jsonb)
      ) order by e.performed_on, e.created_at)
      from public.entries e where e.car_id = c.id), '[]'::jsonb));
end $$;

-- A buyer types the VIN off the car; the answer is only match or no match. 10 tries an hour per link.
create function public.check_vin(p_token text, p_vin text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare s app_private.share_links; v_vin text;
begin
  select * into s from app_private.share_links where token = p_token and revoked_at is null;
  if not found then return 'not_found'; end if;
  if (select count(*) from app_private.vin_checks where link_id = s.id and at > now() - interval '1 hour') >= 10 then
    return 'too_many';
  end if;
  insert into app_private.vin_checks (link_id) values (s.id);
  select vin into v_vin from public.cars where id = s.car_id;
  if v_vin is null then return 'no_vin_on_record'; end if;
  return case when v_vin = upper(regexp_replace(coalesce(p_vin, ''), '[^A-Za-z0-9]', '', 'g')) then 'match' else 'no_match' end;
end $$;

-- ================================================================ transfer to the buyer

create table app_private.transfers (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars (id) on delete cascade,
  code_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  failed_attempts smallint not null default 0,
  closed_at timestamptz,
  claimed_by uuid references auth.users (id) on delete set null
);
create table app_private.claim_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);

-- The code is shown once. The new owner needs it AND the VIN off the car, so a leaked code alone isn't enough.
create function public.start_transfer(p_car uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := sha256(convert_to(gen_random_uuid()::text, 'UTF8'));
  v_code text := '';
begin
  if not app_private.is_owner(p_car) then raise exception 'not_owner' using errcode = '42501'; end if;
  if (select vin from public.cars where id = p_car) is null then raise exception 'vin_required' using errcode = 'P0001'; end if;
  for i in 0..7 loop
    v_code := v_code || substr(alphabet, get_byte(b, i) % 31 + 1, 1);
  end loop;
  v_code := substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4);
  update app_private.transfers set closed_at = now() where car_id = p_car and closed_at is null;
  insert into app_private.transfers (car_id, code_hash) values (p_car, app_private.hash(v_code));
  return v_code;
end $$;

create function public.cancel_transfer(p_car uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_owner(p_car) then raise exception 'not_owner' using errcode = '42501'; end if;
  update app_private.transfers set closed_at = now() where car_id = p_car and closed_at is null;
end $$;

create function public.my_open_transfer(p_car uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select t.expires_at from app_private.transfers t
  where t.car_id = p_car and t.closed_at is null and t.expires_at > now() and app_private.is_owner(p_car)
$$;

-- Returns {status} rather than raising, so failed attempts are counted (a raise would roll the count back).
create function public.claim_transfer(p_code text, p_vin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t app_private.transfers; c public.cars; v_now timestamptz := now();
  v_raw text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_code text := substr(v_raw, 1, 4) || '-' || substr(v_raw, 5);
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if (select count(*) from app_private.claim_attempts where user_id = auth.uid() and at > v_now - interval '1 hour') >= 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  insert into app_private.claim_attempts (user_id) values (auth.uid());
  select * into t from app_private.transfers
  where code_hash = app_private.hash(v_code) and closed_at is null and expires_at > v_now for update;
  if not found then return jsonb_build_object('status', 'code_invalid'); end if;
  select * into c from public.cars where id = t.car_id;
  if c.owner_id = auth.uid() then return jsonb_build_object('status', 'own_car'); end if;
  if c.vin is distinct from upper(regexp_replace(coalesce(p_vin, ''), '[^A-Za-z0-9]', '', 'g')) then
    update app_private.transfers set failed_attempts = failed_attempts + 1,
      closed_at = case when failed_attempts + 1 >= 5 then v_now end where id = t.id;
    return jsonb_build_object('status', 'vin_mismatch');
  end if;

  update public.ownerships set ended_at = v_now where car_id = c.id and ended_at is null;
  insert into public.ownerships (car_id, owner_id, started_at) values (c.id, auth.uid(), v_now);
  update public.cars set owner_id = auth.uid() where id = c.id;
  update app_private.transfers set closed_at = v_now, claimed_by = auth.uid() where id = t.id;
  update app_private.share_links set revoked_at = v_now where car_id = c.id and revoked_at is null;
  update app_private.confirm_requests r set closed_at = v_now
    from public.entries e where e.id = r.entry_id and e.car_id = c.id and r.closed_at is null;
  return jsonb_build_object('status', 'ok', 'car_id', c.id);
end $$;

-- ================================================================ function grants

revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;
grant execute on function app_private.is_owner(uuid), app_private.read_until(uuid) to authenticated;
grant execute on function public.is_emissions_category(public.part_category) to anon, authenticated;
grant execute on function
  public.my_cars(), public.set_car_vin(uuid, text), public.delete_car(uuid),
  public.revise_entry(uuid, jsonb, text), public.withdraw_entry(uuid, text),
  public.add_receipt(uuid, public.receipt_kind, text, text, integer), public.remove_receipt(uuid),
  public.request_confirmation(uuid), public.my_confirm_link(uuid),
  public.create_share_link(uuid), public.my_share_link(uuid), public.revoke_share_link(uuid),
  public.start_transfer(uuid), public.cancel_transfer(uuid), public.my_open_transfer(uuid),
  public.claim_transfer(text, text)
  to authenticated;
-- The only functions open to people without an account: the buyer's view, the VIN check and the shop link.
grant execute on function
  public.public_record(text), public.check_vin(text, text),
  public.shop_view(text), public.confirm_install(text, public.confirm_decision, text, text, integer, text)
  to anon, authenticated;
