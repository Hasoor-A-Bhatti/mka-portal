-- =====================================================================
-- MKA Portal — department privacy
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run.
-- Safe to re-run.
--
-- Before this, every signed-in user could read every other user's name
-- and email. Now a user can only see:
--   - themselves
--   - people who share at least one department with them
--   - admins (their names appear on records they've edited)
-- Admins can still see everyone.
-- =====================================================================

create or replace function public.can_see_profile(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    target = auth.uid()
    or public.is_admin()
    or coalesce((select is_admin from public.profiles where id = target), false)
    or exists (
      select 1
      from public.user_departments mine
      join public.user_departments theirs on theirs.department = mine.department
      where mine.user_id = auth.uid() and theirs.user_id = target
    );
$$;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles
  for select to authenticated using (public.can_see_profile(id));
