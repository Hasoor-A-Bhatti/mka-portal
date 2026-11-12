-- =====================================================================
-- 0012: Fleet: starting mileage readings
--
-- A reading can be marked as a starting point: the odometer as it was when
-- tracking began (or restarted). Miles driven are only counted from the
-- latest starting point onwards, so the starting figure itself is never
-- counted as miles driven. A vehicle's first ever reading is always treated
-- as a starting point too.
--
-- The first time this runs, each vehicle's latest reading is marked as its
-- starting point, because those readings were entered to set the odometer,
-- not as miles driven. Department admins can change this on the vehicle's
-- Mileage tab.
--
-- Run after 0003_fleet.sql. Safe to run again: the latest readings are only
-- marked the first time.
-- =====================================================================

alter table public.fleet_mileage_logs add column if not exists is_start boolean not null default false;

update public.fleet_mileage_logs l
set is_start = true
where l.id in (
  select distinct on (vehicle_id) id
  from public.fleet_mileage_logs
  order by vehicle_id, recorded_on desc, created_at desc
)
and not exists (select 1 from public.fleet_mileage_logs where is_start);
