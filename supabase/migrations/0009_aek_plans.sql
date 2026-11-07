-- =====================================================================
-- 0009: More from the AeK, and booking references for the region
--
-- The AeK link (0007) now also collects:
--   * Activities: what they plan to do each morning, afternoon and evening.
--   * Khuddam: who is in the group, their flight number and any allergy.
--   * Food requirements: which meals they'd like us to cater each day.
--     Meals they don't need show as "Not needed" on the delegation's Food tab.
-- When the AeK gives their name or phone number, it now also becomes the
-- delegation's Head of delegation and contact number.
--
-- The Region Guidance brief (0008) now shows transport booking references.
--
-- Run after 0008_region_guidance.sql. Safe to run again.
-- =====================================================================

alter table public.delegation_aek_updates
  -- {"2026-11-10": {"morning": "…", "afternoon": "…", "evening": "…"}, …}
  add column if not exists activities jsonb,
  -- [{"name": "…", "flight": "…", "allergy": "none" | "nuts" | …, "allergy_note": "…"}, …]
  add column if not exists khuddam jsonb,
  -- {"2026-11-10": ["breakfast", "dinner"], …}; a day that's listed with
  -- fewer than three meals means the others aren't needed.
  add column if not exists meal_requests jsonb;

alter table public.delegation_aek_updates drop constraint if exists delegation_aek_updates_plans_size;
alter table public.delegation_aek_updates
  add constraint delegation_aek_updates_plans_size check (
    coalesce(length(activities::text), 0) <= 100000
    and coalesce(length(khuddam::text), 0) <= 100000
    and coalesce(length(meal_requests::text), 0) <= 20000
  );

-- The allergies the AeK can pick from. Matches ALLERGIES in lib/delegations.ts.
create or replace function public.aek_allergy_keys()
returns text[] language sql immutable as $$
  select array['none', 'nuts', 'peanuts', 'gluten', 'dairy', 'eggs', 'fish', 'shellfish', 'soya', 'sesame', 'other'];
$$;

-- Saves the AeK's details. Returns when they were saved.
create or replace function public.aek_submit(tok text, p jsonb)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  did uuid := public.aek_delegation(tok);
  saved timestamptz;
  acts jsonb;
  people jsonb;
  wants jsonb;
  head text := left(nullif(trim(p->>'head_name'), ''), 120);
  phone text := left(nullif(trim(p->>'head_contact'), ''), 40);
begin
  if did is null then
    raise exception 'This link has expired or been switched off.' using errcode = 'P0001';
  end if;

  -- Activities: real dates only, three short slots each, empty days dropped.
  if jsonb_typeof(p->'activities') = 'object' then
    select jsonb_object_agg(day, slots) into acts
    from (
      select k as day, jsonb_strip_nulls(jsonb_build_object(
        'morning', left(nullif(trim(v->>'morning'), ''), 300),
        'afternoon', left(nullif(trim(v->>'afternoon'), ''), 300),
        'evening', left(nullif(trim(v->>'evening'), ''), 300)
      )) as slots
      from jsonb_each(p->'activities') as e(k, v)
      where k ~ '^\d{4}-\d{2}-\d{2}$' and jsonb_typeof(v) = 'object'
      limit 92
    ) days
    where slots <> '{}'::jsonb;
  end if;

  -- Khuddam: skip empty rows; unknown allergies become "other".
  if jsonb_typeof(p->'khuddam') = 'array' then
    select jsonb_agg(person order by ord) into people
    from (
      select ord, jsonb_strip_nulls(jsonb_build_object(
        'name', left(nullif(trim(e->>'name'), ''), 120),
        'flight', left(nullif(trim(e->>'flight'), ''), 40),
        'allergy', case
          when nullif(trim(e->>'allergy'), '') is null then null
          when lower(trim(e->>'allergy')) = any(public.aek_allergy_keys()) then lower(trim(e->>'allergy'))
          else 'other' end,
        'allergy_note', left(nullif(trim(e->>'allergy_note'), ''), 200)
      )) as person
      from jsonb_array_elements(p->'khuddam') with ordinality as a(e, ord)
      where jsonb_typeof(e) = 'object'
      limit 300
    ) rows
    where person ? 'name' or person ? 'flight' or person ? 'allergy';
  end if;

  -- Food: for each day, the meals they want (possibly none).
  if jsonb_typeof(p->'meal_requests') = 'object' then
    select coalesce(jsonb_object_agg(day, meals), '{}'::jsonb) into wants
    from (
      select k as day, coalesce((
        select jsonb_agg(m order by array_position(array['breakfast', 'lunch', 'dinner'], m))
        from (select distinct x as m from jsonb_array_elements_text(v) as t(x) where x in ('breakfast', 'lunch', 'dinner')) ok
      ), '[]'::jsonb) as meals
      from jsonb_each(p->'meal_requests') as e(k, v)
      where k ~ '^\d{4}-\d{2}-\d{2}$' and jsonb_typeof(v) = 'array'
      limit 92
    ) days;
  end if;

  insert into public.delegation_aek_updates as u (
    delegation_id, arrival_date, arrival_time, arrival_travel, arrival_place,
    departure_date, departure_time, departure_travel, departure_place,
    head_name, head_contact, members, notes, activities, khuddam, meal_requests, submitted_at
  ) values (
    did,
    nullif(p->>'arrival_date', '')::date,
    nullif(p->>'arrival_time', '')::time,
    nullif(trim(p->>'arrival_travel'), ''),
    nullif(trim(p->>'arrival_place'), ''),
    nullif(p->>'departure_date', '')::date,
    nullif(p->>'departure_time', '')::time,
    nullif(trim(p->>'departure_travel'), ''),
    nullif(trim(p->>'departure_place'), ''),
    head,
    phone,
    nullif(p->>'members', '')::integer,
    nullif(trim(p->>'notes'), ''),
    acts,
    people,
    wants,
    now()
  )
  on conflict (delegation_id) do update set
    arrival_date = excluded.arrival_date,
    arrival_time = excluded.arrival_time,
    arrival_travel = excluded.arrival_travel,
    arrival_place = excluded.arrival_place,
    departure_date = excluded.departure_date,
    departure_time = excluded.departure_time,
    departure_travel = excluded.departure_travel,
    departure_place = excluded.departure_place,
    head_name = excluded.head_name,
    head_contact = excluded.head_contact,
    members = excluded.members,
    notes = excluded.notes,
    activities = excluded.activities,
    khuddam = excluded.khuddam,
    meal_requests = excluded.meal_requests,
    submitted_at = now()
  returning u.submitted_at into saved;

  -- The AeK is the head of delegation, so their name and number go on record.
  -- Only when given and different, so the history stays clean.
  update public.delegations
     set head_of_delegation = coalesce(head, head_of_delegation),
         head_contact = coalesce(phone, head_contact)
   where id = did
     and (head is not null and head is distinct from head_of_delegation
          or phone is not null and phone is distinct from head_contact);

  return saved;
end $$;

revoke all on function public.aek_submit(text, jsonb) from public;
grant execute on function public.aek_submit(text, jsonb) to anon, authenticated;

-- ---------- Region Guidance: booking references on transport ----------

create or replace function public.region_view(tok text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  did uuid := public.region_delegation(tok);
  d public.delegations;
begin
  if did is null then return null; end if;
  select * into d from public.delegations where id = did;
  return jsonb_build_object(
    'delegation', jsonb_build_object(
      'name', d.name,
      'country', d.country,
      'members', d.members,
      'venue', d.venue,
      'status', d.status,
      'head_of_delegation', d.head_of_delegation,
      'head_contact', d.head_contact,
      'arrival_date', d.arrival_date,
      'departure_date', d.departure_date
    ),
    'aek', (
      select jsonb_build_object(
        'arrival_date', u.arrival_date, 'arrival_time', u.arrival_time,
        'arrival_travel', u.arrival_travel, 'arrival_place', u.arrival_place,
        'departure_date', u.departure_date, 'departure_time', u.departure_time,
        'departure_travel', u.departure_travel, 'departure_place', u.departure_place,
        'head_name', u.head_name, 'head_contact', u.head_contact,
        'members', u.members, 'notes', u.notes, 'submitted_at', u.submitted_at
      )
      from public.delegation_aek_updates u where u.delegation_id = did
    ),
    'stays', coalesce((
      select jsonb_agg(jsonb_build_object('venue', s.venue, 'start_date', s.start_date, 'end_date', s.end_date, 'rooms', s.rooms, 'notes', s.notes) order by s.start_date)
      from public.delegation_stays s where s.delegation_id = did
    ), '[]'::jsonb),
    'transport', coalesce((
      select jsonb_agg(jsonb_build_object(
        'transport_type', t.transport_type, 'vehicle', t.vehicle, 'start_date', t.start_date, 'end_date', t.end_date,
        'pickup_time', t.pickup_time, 'pickup', t.pickup, 'dropoff', t.dropoff, 'driver', t.driver,
        'booking_ref', t.booking_ref, 'notes', t.notes
      ) order by t.start_date, t.pickup_time nulls last)
      from public.delegation_transport t where t.delegation_id = did
    ), '[]'::jsonb),
    'meals', coalesce((
      select jsonb_agg(jsonb_build_object('day', m.day, 'meal', m.meal, 'location', m.location, 'menu', m.menu) order by m.day)
      from public.delegation_meals m where m.delegation_id = did and m.catered
    ), '[]'::jsonb),
    'drivers', coalesce((
      select jsonb_agg(jsonb_build_object('leg', r.leg, 'full_name', r.full_name, 'aims', r.aims, 'phone', r.phone) order by r.leg desc, r.position)
      from public.delegation_drivers r where r.delegation_id = did
    ), '[]'::jsonb),
    'drivers_saved_at', (select max(r.updated_at) from public.delegation_drivers r where r.delegation_id = did)
  );
end $$;

revoke all on function public.region_view(text) from public;
grant execute on function public.region_view(text) to anon, authenticated;
