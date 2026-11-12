-- =====================================================================
-- 0013: Jaidat: current number of residents
--
-- Each property keeps how many people are living there now. It's set with
-- a slider on the property's Overview and stays as it is until someone
-- changes it. Only the number is kept, never who the residents are.
--
-- Run after 0010_jaidat.sql. Safe to run again.
-- =====================================================================

alter table public.jaidat_properties add column if not exists residents integer;
alter table public.jaidat_properties add column if not exists residents_updated_at timestamptz;

alter table public.jaidat_properties drop constraint if exists jaidat_properties_residents_check;
alter table public.jaidat_properties
  add constraint jaidat_properties_residents_check check (residents is null or residents between 0 and 500);
