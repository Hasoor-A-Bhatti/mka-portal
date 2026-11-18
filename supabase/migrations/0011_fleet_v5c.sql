-- =====================================================================
-- 0011: Fleet: V5C logbook
--
-- Department admins can upload each vehicle's V5C registration certificate
-- (logbook) on the Documents tab, alongside insurance, MOT and road tax.
-- It's stored in the same private "fleet" bucket, at <vehicle id>/v5c/<file>,
-- and only people with Fleet access can open it.
--
-- Run after 0003_fleet.sql. Safe to run again.
-- =====================================================================

-- Remove the old list of document types, whatever it's called in this
-- database, then add it back with V5C included.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.fleet_files'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.fleet_files drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.fleet_files
  add constraint fleet_files_kind_check
  check (kind in ('insurance', 'mot', 'road_tax', 'v5c', 'receipt', 'incident'));
