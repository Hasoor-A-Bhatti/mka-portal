-- =====================================================================
-- 0021: Live Travellers tab
--
-- When the AeK sends their form (or drops in their group's list) on the AeK
-- link, the delegation's page in the portal updates by itself: the
-- Travellers tab and the AeK details on the Info tab refresh in place.
--
-- Supabase Realtime still only sends each person the rows they're allowed
-- to read (Delegations department access).
--
-- Run after 0018_delegation_travellers.sql. Safe to run again.
-- =====================================================================

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['delegation_travellers', 'delegation_aek_updates'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
