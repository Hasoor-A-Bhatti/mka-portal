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

alter table public.fleet_files drop constraint if exists fleet_files_kind_check;
alter table public.fleet_files
  add constraint fleet_files_kind_check
  check (kind in ('insurance', 'mot', 'road_tax', 'v5c', 'receipt', 'incident'));
