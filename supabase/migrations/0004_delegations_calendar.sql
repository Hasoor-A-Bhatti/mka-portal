-- =====================================================================
-- 0004: Delegations created from the Google Calendar
--
-- Run after 0003_fleet.sql (Supabase → SQL Editor → paste → Run).
-- Safe to run more than once.
-- =====================================================================

-- Venue, and which calendar events each delegation came from.
alter table public.delegations
  add column if not exists venue text,
  -- The first event of the delegation. Unique, so two people opening the page
  -- at the same moment can't create the same delegation twice.
  add column if not exists calendar_event_id text,
  -- Every event merged into this delegation (e.g. one per venue).
  add column if not exists calendar_event_ids text[] not null default '{}';

create unique index if not exists delegations_calendar_event_id_key
  on public.delegations (calendar_event_id);

-- Calendar events whose delegation was removed in the portal, so the sync
-- doesn't bring them back.
create table if not exists public.delegation_calendar_ignored (
  event_id    text primary key,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) on delete set null default auth.uid()
);

alter table public.delegation_calendar_ignored enable row level security;

drop policy if exists "delegations read ignored" on public.delegation_calendar_ignored;
create policy "delegations read ignored" on public.delegation_calendar_ignored
  for select to authenticated using (public.has_department_access('delegations'));

drop policy if exists "delegations add ignored" on public.delegation_calendar_ignored;
create policy "delegations add ignored" on public.delegation_calendar_ignored
  for insert to authenticated with check (public.has_department_access('delegations'));

drop policy if exists "delegations clear ignored" on public.delegation_calendar_ignored;
create policy "delegations clear ignored" on public.delegation_calendar_ignored
  for delete to authenticated using (public.is_department_manager('delegations'));

-- When a delegation from the calendar is removed, remember its events.
create or replace function public.delegations_remember_removed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.delegation_calendar_ignored (event_id, created_by)
  select e, auth.uid() from unnest(old.calendar_event_ids) as e
  on conflict (event_id) do nothing;
  return old;
end $$;

drop trigger if exists delegations_remember_removed on public.delegations;
create trigger delegations_remember_removed
  after delete on public.delegations
  for each row execute function public.delegations_remember_removed();
