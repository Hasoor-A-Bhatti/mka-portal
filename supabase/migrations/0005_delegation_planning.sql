-- =====================================================================
-- 0005: Delegation planning
--   Info (head of delegation contact, itinerary files), Accommodation,
--   Transport, Food and Mulaqat for each delegation.
--
-- Run after 0004_delegations_calendar.sql (Supabase → SQL Editor → paste → Run).
-- Safe to run more than once.
--
-- Everyone with the Delegations department can view, add and edit.
-- Only Delegations department admins can remove (as for delegations).
-- =====================================================================

alter table public.delegations
  add column if not exists head_contact text;

-- ---------- Itinerary files ----------

create table if not exists public.delegation_files (
  id             uuid primary key default gen_random_uuid(),
  delegation_id  uuid not null references public.delegations(id) on delete cascade,
  kind           text not null default 'itinerary' check (kind in ('itinerary')),
  file_path      text not null unique,
  file_name      text not null,
  mime_type      text,
  size_bytes     integer
);
select public.mka_register_table('delegation_files', 'delegations');
create index if not exists delegation_files_delegation_idx on public.delegation_files (delegation_id, created_at desc);

-- ---------- Accommodation: where the group stays, and for which days ----------

create table if not exists public.delegation_stays (
  id             uuid primary key default gen_random_uuid(),
  delegation_id  uuid not null references public.delegations(id) on delete cascade,
  venue          text not null,
  start_date     date not null,
  end_date       date not null,
  rooms          text,
  notes          text,
  constraint delegation_stays_dates check (end_date >= start_date)
);
select public.mka_register_table('delegation_stays', 'delegations');
create index if not exists delegation_stays_delegation_idx on public.delegation_stays (delegation_id, start_date);

-- ---------- Transport bookings ----------

create table if not exists public.delegation_transport (
  id              uuid primary key default gen_random_uuid(),
  delegation_id   uuid not null references public.delegations(id) on delete cascade,
  transport_type  text not null,
  vehicle         text,
  start_date      date not null,
  end_date        date not null,
  pickup_time     time,
  pickup          text,
  dropoff         text,
  driver          text,
  booking_ref     text,
  notes           text,
  constraint delegation_transport_dates check (end_date >= start_date)
);
select public.mka_register_table('delegation_transport', 'delegations');
create index if not exists delegation_transport_delegation_idx on public.delegation_transport (delegation_id, start_date);

-- ---------- Food: one row per day and meal ----------

create table if not exists public.delegation_meals (
  id             uuid primary key default gen_random_uuid(),
  delegation_id  uuid not null references public.delegations(id) on delete cascade,
  day            date not null,
  meal           text not null check (meal in ('breakfast', 'lunch', 'dinner')),
  catered        boolean not null default false,
  location       text,
  menu           text,
  constraint delegation_meals_one_per_meal unique (delegation_id, day, meal)
);
select public.mka_register_table('delegation_meals', 'delegations');

-- ---------- Mulaqats ----------

create table if not exists public.delegation_mulaqats (
  id               uuid primary key default gen_random_uuid(),
  delegation_id    uuid not null references public.delegations(id) on delete cascade,
  mulaqat_date     date not null,
  mulaqat_time     time,
  location         text,
  notes            text,
  -- Portal users attending, plus anyone else by name.
  attendee_ids     uuid[] not null default '{}',
  other_attendees  text
);
select public.mka_register_table('delegation_mulaqats', 'delegations');
create index if not exists delegation_mulaqats_delegation_idx on public.delegation_mulaqats (delegation_id, mulaqat_date);

-- ---------- The Delegations team, for choosing who attends a mulaqat ----------
-- Members can't list other people's departments directly, so this returns just
-- the names of people with Delegations access, and only to people who have it too.

create or replace function public.delegations_team()
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1)) as full_name
  from public.profiles p
  where public.has_department_access('delegations')
    and (
      p.is_admin
      or exists (
        select 1 from public.user_departments ud
        where ud.user_id = p.id and ud.department = 'delegations'
      )
    )
  order by 2;
$$;

revoke all on function public.delegations_team() from public, anon;
grant execute on function public.delegations_team() to authenticated;

-- ---------- Private storage for itineraries (10 MB, PDFs and images) ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delegations', 'delegations', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Stored as <delegation id>/itinerary/<file>.
drop policy if exists "delegation files read" on storage.objects;
create policy "delegation files read" on storage.objects
  for select to authenticated
  using (bucket_id = 'delegations' and public.has_department_access('delegations'));

drop policy if exists "delegation files upload" on storage.objects;
create policy "delegation files upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'delegations' and public.has_department_access('delegations'));

drop policy if exists "delegation files remove" on storage.objects;
create policy "delegation files remove" on storage.objects
  for delete to authenticated
  using (bucket_id = 'delegations' and public.is_department_manager('delegations'));
