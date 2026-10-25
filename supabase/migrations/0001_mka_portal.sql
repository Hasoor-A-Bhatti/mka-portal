-- =====================================================================
-- MKA Portal — core schema
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run.
-- Safe to re-run: every statement is idempotent.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. People and access
-- ---------------------------------------------------------------------

-- One row per login. Created automatically when an auth user is added.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- The five sub-departments. Add rows here when new ones appear.
create table if not exists public.departments (
  slug  text primary key,
  name  text not null
);

insert into public.departments (slug, name) values
  ('delegations',          'MKA Delegations'),
  ('fleet',                'MKA Fleet'),
  ('jaidat',               'MKA Jaidat'),
  ('special-arrangements', 'MKA Special Arrangements'),
  ('storage',              'MKA Storage')
on conflict (slug) do update set name = excluded.name;

-- Which user can see which department. role 'manager' may also delete.
create table if not exists public.user_departments (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  department  text not null references public.departments(slug) on delete cascade,
  role        text not null default 'member' check (role in ('member', 'manager')),
  primary key (user_id, department)
);

-- Create a profile whenever a user is added in Supabase Auth.
-- Set "full_name" in the user's metadata to control the "Salam [name]" greeting.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any users that existed before this script ran.
insert into public.profiles (id, email, full_name)
select u.id, u.email,
       coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Access helpers (used by every row-level security policy)
-- ---------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.has_department_access(dept text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.user_departments
    where user_id = auth.uid() and department = dept
  );
$$;

create or replace function public.is_department_manager(dept text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.user_departments
    where user_id = auth.uid() and department = dept and role = 'manager'
  );
$$;

-- ---------------------------------------------------------------------
-- 3. Audit trail
-- ---------------------------------------------------------------------

create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  department  text not null,
  table_name  text not null,
  record_id   uuid,
  action      text not null check (action in ('insert', 'update', 'delete')),
  changed_by  uuid references public.profiles(id) on delete set null,
  changed_at  timestamptz not null default now(),
  old_data    jsonb,
  new_data    jsonb
);

create index if not exists audit_log_department_idx on public.audit_log (department, changed_at desc);
create index if not exists audit_log_record_idx     on public.audit_log (table_name, record_id);

-- Stamps created_* / updated_* from the logged-in user. The app never sends
-- these values: the database takes them from the session, so they can't be faked.
create or replace function public.mka_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_at := new.created_at;
    new.updated_by := new.created_by;
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end $$;

-- Writes one audit_log row per insert / update / delete, with before and after.
create or replace function public.mka_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (department, table_name, record_id, action, changed_by, old_data, new_data)
  values (
    tg_argv[0],
    tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    lower(tg_op),
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;

-- ---------------------------------------------------------------------
-- 4. mka_register_table — the one call to make for every future table
--
--   create table public.bookings (id uuid primary key default gen_random_uuid(), ...);
--   select public.mka_register_table('bookings', 'delegations');
--
-- It adds created_at / created_by / updated_at / updated_by, the stamping and
-- audit triggers, and row-level security scoped to that department.
-- The table must have an "id uuid" primary key.
-- ---------------------------------------------------------------------

create or replace function public.mka_register_table(tbl text, dept text)
returns void language plpgsql as $$
begin
  execute format('alter table public.%I add column if not exists created_at timestamptz not null default now()', tbl);
  execute format('alter table public.%I add column if not exists created_by uuid references public.profiles(id) on delete set null default auth.uid()', tbl);
  execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', tbl);
  execute format('alter table public.%I add column if not exists updated_by uuid references public.profiles(id) on delete set null default auth.uid()', tbl);

  execute format('drop trigger if exists mka_stamp on public.%I', tbl);
  execute format('create trigger mka_stamp before insert or update on public.%I for each row execute function public.mka_stamp()', tbl);
  execute format('drop trigger if exists mka_audit on public.%I', tbl);
  execute format('create trigger mka_audit after insert or update or delete on public.%I for each row execute function public.mka_audit(%L)', tbl, dept);

  execute format('alter table public.%I enable row level security', tbl);

  execute format('drop policy if exists "mka read" on public.%I', tbl);
  execute format('create policy "mka read" on public.%I for select to authenticated using (public.has_department_access(%L))', tbl, dept);
  execute format('drop policy if exists "mka create" on public.%I', tbl);
  execute format('create policy "mka create" on public.%I for insert to authenticated with check (public.has_department_access(%L))', tbl, dept);
  execute format('drop policy if exists "mka edit" on public.%I', tbl);
  execute format('create policy "mka edit" on public.%I for update to authenticated using (public.has_department_access(%L)) with check (public.has_department_access(%L))', tbl, dept, dept);
  execute format('drop policy if exists "mka remove" on public.%I', tbl);
  execute format('create policy "mka remove" on public.%I for delete to authenticated using (public.is_department_manager(%L))', tbl, dept);
end $$;

-- ---------------------------------------------------------------------
-- 5. Starter table for each department
-- ---------------------------------------------------------------------

create table if not exists public.delegations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  country             text,
  head_of_delegation  text,
  members             integer,
  arrival_date        date,
  departure_date      date,
  status              text not null default 'Planned',
  notes               text
);
select public.mka_register_table('delegations', 'delegations');

create table if not exists public.fleet_vehicles (
  id            uuid primary key default gen_random_uuid(),
  registration  text not null unique,
  make_model    text,
  vehicle_type  text,
  seats         integer,
  driver        text,
  status        text not null default 'Available',
  notes         text
);
select public.mka_register_table('fleet_vehicles', 'fleet');

create table if not exists public.jaidat_properties (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  address        text,
  property_type  text,
  capacity       integer,
  caretaker      text,
  status         text not null default 'Active',
  notes          text
);
select public.mka_register_table('jaidat_properties', 'jaidat');

create table if not exists public.special_arrangements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  event_date    date,
  venue         text,
  lead_contact  text,
  guests        integer,
  status        text not null default 'Requested',
  notes         text
);
select public.mka_register_table('special_arrangements', 'special-arrangements');

create table if not exists public.storage_items (
  id         uuid primary key default gen_random_uuid(),
  item_name  text not null,
  category   text,
  location   text,
  quantity   integer not null default 0,
  status     text not null default 'In stock',
  notes      text
);
select public.mka_register_table('storage_items', 'storage');

-- ---------------------------------------------------------------------
-- 6. Row-level security for the core tables
-- ---------------------------------------------------------------------

alter table public.profiles         enable row level security;
alter table public.departments      enable row level security;
alter table public.user_departments enable row level security;
alter table public.audit_log        enable row level security;

-- Everyone signed in can see names (needed for "created by" / "edited by").
drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles
  for select to authenticated using (true);

-- Users may change their own display name, nothing else.
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

drop policy if exists "departments readable" on public.departments;
create policy "departments readable" on public.departments
  for select to authenticated using (true);

drop policy if exists "memberships readable" on public.user_departments;
create policy "memberships readable" on public.user_departments
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "memberships admin" on public.user_departments;
create policy "memberships admin" on public.user_departments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Audit entries are visible to people in that department; nobody can edit them.
drop policy if exists "audit readable" on public.audit_log;
create policy "audit readable" on public.audit_log
  for select to authenticated using (public.has_department_access(department));
revoke insert, update, delete on public.audit_log from authenticated, anon;
