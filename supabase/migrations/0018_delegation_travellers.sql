-- =====================================================================
-- 0018: Travellers (one row per person in a delegation)
--
-- For large groups whose members travel separately: each person's phone,
-- arrival and departure (date, time, flight, airport), and whether they need
-- an airport pickup, a drop-off, accommodation, or a proper bed.
--
-- The delegation's Travellers tab groups them by flight, so each pickup and
-- drop-off run can be arranged. The links get them too:
--   * AeK link: sees the list and fills in each person's return journey
--     (aek_travellers, aek_save_travellers). Nobody else's data.
--   * Region Guidance link: the pickup and drop-off runs with names and
--     phone numbers (region_travellers). Read only.
--
-- Run after 0009_aek_plans.sql. Safe to run again.
-- =====================================================================

create table if not exists public.delegation_travellers (
  id                   uuid primary key default gen_random_uuid(),
  delegation_id        uuid not null references public.delegations(id) on delete cascade,
  -- The number on the group's own list, if it has one.
  ref                  integer,
  full_name            text not null check (length(trim(full_name)) between 1 and 120),
  phone                text check (length(phone) <= 40),
  arrival_date         date,
  arrival_time         time,
  arrival_flight       text check (length(arrival_flight) <= 40),
  arrival_place        text check (length(arrival_place) <= 80),
  departure_date       date,
  departure_time       time,
  departure_flight     text check (length(departure_flight) <= 40),
  departure_place      text check (length(departure_place) <= 80),
  needs_accommodation  boolean not null default true,
  needs_pickup         boolean not null default false,
  needs_dropoff        boolean not null default false,
  -- Can't sleep on the floor (back pain, mobility): needs a bed.
  needs_bed            boolean not null default false,
  notes                text check (length(notes) <= 1000),
  constraint delegation_travellers_ref unique (delegation_id, ref)
);
select public.mka_register_table('delegation_travellers', 'delegations');
create index if not exists delegation_travellers_delegation_idx on public.delegation_travellers (delegation_id, arrival_date, arrival_time);

-- ---------- AeK link ----------

-- The group as the AeK sees it: travel only (no phone numbers or notes). Null if the link doesn't work.
create or replace function public.aek_travellers(tok text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  did uuid := public.aek_delegation(tok);
begin
  if did is null then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'ref', t.ref, 'full_name', t.full_name,
      'arrival_date', t.arrival_date, 'arrival_time', t.arrival_time,
      'arrival_flight', t.arrival_flight, 'arrival_place', t.arrival_place,
      'needs_pickup', t.needs_pickup,
      'departure_date', t.departure_date, 'departure_time', t.departure_time,
      'departure_flight', t.departure_flight, 'departure_place', t.departure_place,
      'needs_dropoff', t.needs_dropoff
    ) order by t.arrival_date nulls last, t.arrival_time nulls last, t.ref nulls last, t.full_name)
    from public.delegation_travellers t where t.delegation_id = did
  ), '[]'::jsonb);
end $$;

-- Saves the return journeys the AeK filled in.
-- p = [{"id": "…", "departure_date": "2026-12-02", "departure_time": "18:30",
--       "departure_flight": "AC859", "departure_place": "Heathrow T2", "needs_dropoff": true}, …]
-- Only people in the link's own delegation are touched, and only if something changed.
create or replace function public.aek_save_travellers(tok text, p jsonb)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  did uuid := public.aek_delegation(tok);
  e jsonb;
  d date;
  t time;
  b boolean;
  f text;
  pl text;
begin
  if did is null then
    raise exception 'This link has expired or been switched off.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 1000 then
    raise exception 'Something went wrong reading the list. Please reload the page and try again.' using errcode = 'P0001';
  end if;

  for e in select * from jsonb_array_elements(p) loop
    continue when jsonb_typeof(e) <> 'object' or coalesce(e->>'id', '') !~* '^[0-9a-f-]{36}$';
    begin
      d := nullif(e->>'departure_date', '')::date;
      t := nullif(e->>'departure_time', '')::time;
      b := nullif(e->>'needs_dropoff', '')::boolean;
    exception when others then
      raise exception 'One of the dates or times isn''t valid.' using errcode = 'P0001';
    end;

    f := left(nullif(trim(e->>'departure_flight'), ''), 40);
    pl := left(nullif(trim(e->>'departure_place'), ''), 80);

    update public.delegation_travellers x set
      departure_date = d,
      departure_time = t,
      departure_flight = f,
      departure_place = pl,
      needs_dropoff = coalesce(b, x.needs_dropoff)
    where x.id = (e->>'id')::uuid
      and x.delegation_id = did
      and (x.departure_date, x.departure_time, x.departure_flight, x.departure_place, x.needs_dropoff)
          is distinct from (d, t, f, pl, coalesce(b, x.needs_dropoff));
  end loop;

  return now();
end $$;

-- ---------- Region Guidance link ----------

-- Everything the region needs for pickups, drop-offs and rooms. Null if the link doesn't work.
create or replace function public.region_travellers(tok text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  did uuid := public.region_delegation(tok);
begin
  if did is null then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'ref', t.ref, 'full_name', t.full_name, 'phone', t.phone,
      'arrival_date', t.arrival_date, 'arrival_time', t.arrival_time,
      'arrival_flight', t.arrival_flight, 'arrival_place', t.arrival_place,
      'departure_date', t.departure_date, 'departure_time', t.departure_time,
      'departure_flight', t.departure_flight, 'departure_place', t.departure_place,
      'needs_accommodation', t.needs_accommodation, 'needs_pickup', t.needs_pickup,
      'needs_dropoff', t.needs_dropoff, 'needs_bed', t.needs_bed, 'notes', t.notes
    ) order by t.arrival_date nulls last, t.arrival_time nulls last, t.ref nulls last, t.full_name)
    from public.delegation_travellers t where t.delegation_id = did
  ), '[]'::jsonb);
end $$;

revoke all on function public.aek_travellers(text) from public;
revoke all on function public.aek_save_travellers(text, jsonb) from public;
revoke all on function public.region_travellers(text) from public;
grant execute on function public.aek_travellers(text) to anon, authenticated;
grant execute on function public.aek_save_travellers(text, jsonb) to anon, authenticated;
grant execute on function public.region_travellers(text) to anon, authenticated;
