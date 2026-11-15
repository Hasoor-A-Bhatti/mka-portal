-- =====================================================================
-- 0016: Special Arrangements inventory
--
-- Special items stored by MKA: item, quantity, location, notes and a
-- status (Available, Unavailable, Damaged). No bookings or loans.
--
-- Special Arrangements staff can add items and change them; only the
-- department admin (or an administrator) can remove one. Every change is
-- in the activity log.
--
-- The old "arrangements" table (special_arrangements) is left as it was,
-- so nothing already in it is lost. The page no longer shows it.
--
-- Safe to run again.
-- =====================================================================

create table if not exists public.special_items (
  id                 uuid primary key default gen_random_uuid(),
  item_name          text not null check (char_length(trim(item_name)) between 1 and 160),
  quantity           integer not null default 1 check (quantity between 0 and 1000000),
  location           text check (location is null or char_length(location) <= 160),
  status             text not null default 'Available' check (status in ('Available', 'Unavailable', 'Damaged')),
  notes              text check (notes is null or char_length(notes) <= 2000),
  status_changed_at  timestamptz not null default now()
);

-- created/updated stamps, activity log, and access for the Special Arrangements department.
select public.mka_register_table('special_items', 'special-arrangements');

-- When the status last changed, so the page can say "Damaged since 3 Nov".
create or replace function public.special_items_status_time()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.status_changed_at := now();
  else
    new.status_changed_at := old.status_changed_at;
  end if;
  return new;
end $$;

drop trigger if exists special_items_status_time on public.special_items;
create trigger special_items_status_time
  before insert or update on public.special_items
  for each row execute function public.special_items_status_time();

create index if not exists special_items_name_idx on public.special_items (lower(item_name));
