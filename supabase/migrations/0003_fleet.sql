-- =====================================================================
-- MKA Portal — Fleet: vehicle profiles, documents, mileage, maintenance,
-- incidents, drivers and keys.
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run.
-- Safe to re-run. Run it after 0001 and 0002.
-- (If you ever re-run 0001, run this file again afterwards.)
--
-- Who can do what in Fleet
--   Department admin / Administrator: everything.
--   Member: view everything, log mileage, report incidents (with photos).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Vehicles: new columns and statuses
-- ---------------------------------------------------------------------

alter table public.fleet_vehicles add column if not exists year    integer check (year between 1900 and 2100);
alter table public.fleet_vehicles add column if not exists mileage integer not null default 0 check (mileage >= 0);

-- Old statuses → new ones (Active, Damaged, Off road, Sold)
update public.fleet_vehicles
set status = case
  when status in ('Active', 'Damaged', 'Off road', 'Sold') then status
  else 'Active'
end;

alter table public.fleet_vehicles alter column status set default 'Active';
alter table public.fleet_vehicles drop constraint if exists fleet_vehicles_status_check;
alter table public.fleet_vehicles add constraint fleet_vehicles_status_check
  check (status in ('Active', 'Damaged', 'Off road', 'Sold'));

-- The current fleet. Skips any registration that's already there.
insert into public.fleet_vehicles (registration, make_model, vehicle_type, year, status, mileage)
select v.registration, v.make_model, v.vehicle_type, v.year, 'Active', 0
from (values
  ('YE64 ZXS', 'Toyota Hilux Invincible D-4D Auto',      'Light commercial', 2014),
  ('LJ19 KLD', 'BMW 7 Series 740Li 335bhp 4 door',       'Car',              2019),
  ('WM07 ZHH', 'Toyota Prius T Spirit 76bhp 5 door',     'Car',              2007),
  ('AU11 FVZ', 'Toyota Land Cruiser',                    'Car',              2011),
  ('YS08 JCU', 'Ford C-Max Zetec 145bhp 5 door',         'Car',              2008),
  ('BCV 896T', 'Toyota Prius 122bhp 5 door hatchback',   'Car',              null::integer)
) as v(registration, make_model, vehicle_type, year)
where not exists (
  select 1 from public.fleet_vehicles f
  where replace(upper(f.registration), ' ', '') = replace(v.registration, ' ', '')
);

-- ---------------------------------------------------------------------
-- 2. Drivers (a shared pool) and who may drive which vehicle
-- ---------------------------------------------------------------------

create table if not exists public.fleet_drivers (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  phone           text,
  licence_expiry  date,
  notes           text
);
select public.mka_register_table('fleet_drivers', 'fleet');

create table if not exists public.fleet_vehicle_drivers (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.fleet_vehicles(id) on delete cascade,
  driver_id   uuid not null references public.fleet_drivers(id) on delete cascade,
  unique (vehicle_id, driver_id)
);
select public.mka_register_table('fleet_vehicle_drivers', 'fleet');

-- Who has the keys right now. Empty = in the office / key safe.
alter table public.fleet_vehicles add column if not exists key_holder_id uuid
  references public.fleet_drivers(id) on delete set null;

-- Every key handover, written automatically. Nobody can edit it.
create table if not exists public.fleet_key_log (
  id           bigint generated always as identity primary key,
  vehicle_id   uuid not null references public.fleet_vehicles(id) on delete cascade,
  driver_id    uuid references public.fleet_drivers(id) on delete set null,
  holder_name  text not null,
  changed_by   uuid references public.profiles(id) on delete set null,
  changed_at   timestamptz not null default now()
);
create index if not exists fleet_key_log_vehicle_idx on public.fleet_key_log (vehicle_id, changed_at desc);

create or replace function public.fleet_log_keys()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.key_holder_id is not distinct from old.key_holder_id then
    return null;
  end if;
  if tg_op = 'INSERT' and new.key_holder_id is null then
    return null;
  end if;
  insert into public.fleet_key_log (vehicle_id, driver_id, holder_name, changed_by)
  values (
    new.id,
    new.key_holder_id,
    coalesce((select full_name from public.fleet_drivers where id = new.key_holder_id), 'Office / key safe'),
    auth.uid()
  );
  return null;
end $$;

drop trigger if exists fleet_log_keys on public.fleet_vehicles;
create trigger fleet_log_keys after insert or update of key_holder_id on public.fleet_vehicles
  for each row execute function public.fleet_log_keys();

alter table public.fleet_key_log enable row level security;
drop policy if exists "fleet keys readable" on public.fleet_key_log;
create policy "fleet keys readable" on public.fleet_key_log
  for select to authenticated using (public.has_department_access('fleet'));
revoke insert, update, delete on public.fleet_key_log from authenticated, anon;

-- ---------------------------------------------------------------------
-- 3. Mileage readings. The vehicle's mileage follows the latest reading.
-- ---------------------------------------------------------------------

create table if not exists public.fleet_mileage_logs (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references public.fleet_vehicles(id) on delete cascade,
  reading      integer not null check (reading >= 0),
  recorded_on  date not null default current_date,
  note         text
);
create index if not exists fleet_mileage_vehicle_idx on public.fleet_mileage_logs (vehicle_id, recorded_on desc);
select public.mka_register_table('fleet_mileage_logs', 'fleet');

create or replace function public.fleet_sync_mileage()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v uuid;
  latest integer;
begin
  v := case when tg_op = 'DELETE' then old.vehicle_id else new.vehicle_id end;
  select reading into latest
  from public.fleet_mileage_logs
  where vehicle_id = v
  order by recorded_on desc, created_at desc
  limit 1;
  update public.fleet_vehicles
  set mileage = coalesce(latest, 0)
  where id = v and mileage is distinct from coalesce(latest, 0);
  return null;
end $$;

drop trigger if exists fleet_sync_mileage on public.fleet_mileage_logs;
create trigger fleet_sync_mileage after insert or update or delete on public.fleet_mileage_logs
  for each row execute function public.fleet_sync_mileage();

-- ---------------------------------------------------------------------
-- 4. Maintenance tasks
-- ---------------------------------------------------------------------

create table if not exists public.fleet_maintenance (
  id            uuid primary key default gen_random_uuid(),
  vehicle_id    uuid not null references public.fleet_vehicles(id) on delete cascade,
  description   text not null,
  due_date      date,
  status        text not null default 'Pending' check (status in ('Pending', 'Completed', 'Overdue')),
  cost          numeric(10, 2) check (cost >= 0),
  completed_on  date,
  notes         text
);
create index if not exists fleet_maintenance_vehicle_idx on public.fleet_maintenance (vehicle_id, due_date);
select public.mka_register_table('fleet_maintenance', 'fleet');

-- ---------------------------------------------------------------------
-- 5. Incidents
-- ---------------------------------------------------------------------

create table if not exists public.fleet_incidents (
  id                   uuid primary key default gen_random_uuid(),
  vehicle_id           uuid not null references public.fleet_vehicles(id) on delete cascade,
  occurred_at          timestamptz not null,
  incident_type        text not null check (incident_type in ('Accident', 'Damage', 'Breakdown', 'Theft or break-in', 'Fine or PCN', 'Other')),
  severity             text not null default 'Minor' check (severity in ('Minor', 'Moderate', 'Major')),
  location             text,
  driver_name          text,
  description          text not null,
  not_drivable         boolean not null default false,
  third_party          boolean not null default false,
  third_party_details  text,
  police_reference     text,
  claim_reference      text,
  status               text not null default 'Open' check (status in ('Open', 'Under review', 'Resolved')),
  resolution           text
);
create index if not exists fleet_incidents_vehicle_idx on public.fleet_incidents (vehicle_id, occurred_at desc);
select public.mka_register_table('fleet_incidents', 'fleet');

-- ---------------------------------------------------------------------
-- 6. Files: insurance, MOT, road tax, receipts, incident photos
-- ---------------------------------------------------------------------

create table if not exists public.fleet_files (
  id              uuid primary key default gen_random_uuid(),
  vehicle_id      uuid not null references public.fleet_vehicles(id) on delete cascade,
  kind            text not null check (kind in ('insurance', 'mot', 'road_tax', 'receipt', 'incident')),
  maintenance_id  uuid references public.fleet_maintenance(id) on delete cascade,
  incident_id     uuid references public.fleet_incidents(id) on delete cascade,
  file_path       text not null unique,
  file_name       text not null,
  mime_type       text,
  size_bytes      integer,
  expires_on      date,
  notes           text
);
select public.mka_register_table('fleet_files', 'fleet');  -- adds created_at, so the index comes after
create index if not exists fleet_files_vehicle_idx on public.fleet_files (vehicle_id, kind, created_at desc);

-- Private storage bucket. 10 MB per file; PDFs and images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fleet', 'fleet', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Files are stored as <vehicle id>/<kind>/<file>. Members may only upload incident photos.
drop policy if exists "fleet files read" on storage.objects;
create policy "fleet files read" on storage.objects
  for select to authenticated
  using (bucket_id = 'fleet' and public.has_department_access('fleet'));

drop policy if exists "fleet files upload" on storage.objects;
create policy "fleet files upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fleet'
    and (
      public.is_department_manager('fleet')
      or (public.has_department_access('fleet') and (storage.foldername(name))[2] = 'incident')
    )
  );

drop policy if exists "fleet files remove" on storage.objects;
create policy "fleet files remove" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fleet' and public.is_department_manager('fleet'));

-- ---------------------------------------------------------------------
-- 7. Tighter permissions: only department admins change these
-- ---------------------------------------------------------------------

create or replace function public.mka_manager_only(tbl text, dept text, members_may_add boolean)
returns void language plpgsql as $$
begin
  execute format('drop policy if exists "mka create" on public.%I', tbl);
  if members_may_add then
    execute format('create policy "mka create" on public.%I for insert to authenticated with check (public.has_department_access(%L))', tbl, dept);
  else
    execute format('create policy "mka create" on public.%I for insert to authenticated with check (public.is_department_manager(%L))', tbl, dept);
  end if;
  execute format('drop policy if exists "mka edit" on public.%I', tbl);
  execute format('create policy "mka edit" on public.%I for update to authenticated using (public.is_department_manager(%L)) with check (public.is_department_manager(%L))', tbl, dept, dept);
end $$;

select public.mka_manager_only('fleet_vehicles',        'fleet', false);
select public.mka_manager_only('fleet_drivers',         'fleet', false);
select public.mka_manager_only('fleet_vehicle_drivers', 'fleet', false);
select public.mka_manager_only('fleet_maintenance',     'fleet', false);
select public.mka_manager_only('fleet_mileage_logs',    'fleet', true);   -- members log mileage
select public.mka_manager_only('fleet_incidents',       'fleet', true);   -- members report incidents

-- Files: members may add incident photos only.
drop policy if exists "mka create" on public.fleet_files;
create policy "mka create" on public.fleet_files
  for insert to authenticated
  with check (
    public.is_department_manager('fleet')
    or (public.has_department_access('fleet') and kind = 'incident')
  );
drop policy if exists "mka edit" on public.fleet_files;
create policy "mka edit" on public.fleet_files
  for update to authenticated
  using (public.is_department_manager('fleet'))
  with check (public.is_department_manager('fleet'));
