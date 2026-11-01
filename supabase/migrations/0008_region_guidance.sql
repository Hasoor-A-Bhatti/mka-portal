-- =====================================================================
-- 0008: Region Guidance links and drivers
--
-- Each delegation can have a private "Region Guidance" link for the local
-- operator. Without signing in, they see one page with everything their team
-- needs: arrival and departure, contacts, accommodation, food and transport.
-- The only thing they can change is who drives: airport pickup drivers and,
-- optionally, drop-off drivers (name, AIMS number, phone). They can come back
-- and add to it over several days.
--
-- Safety is the same as AeK links (0007): a link only reaches its own
-- delegation through the functions below, one active link per delegation, and
-- it stops working 7 days after departure or when switched off.
--
-- Run after 0007_aek_links.sql. Safe to run again.
-- =====================================================================

-- ---------- Links ----------

create table if not exists public.delegation_region_links (
  id             uuid primary key default gen_random_uuid(),
  delegation_id  uuid not null references public.delegations(id) on delete cascade,
  token          text not null unique check (length(token) >= 32),
  revoked_at     timestamptz
);
select public.mka_register_table('delegation_region_links', 'delegations');
create index if not exists delegation_region_links_delegation_idx on public.delegation_region_links (delegation_id, created_at desc);

-- ---------- Drivers ----------

create table if not exists public.delegation_drivers (
  id             uuid primary key default gen_random_uuid(),
  delegation_id  uuid not null references public.delegations(id) on delete cascade,
  leg            text not null check (leg in ('pickup', 'dropoff')),
  position       integer not null default 0,
  full_name      text check (length(full_name) <= 120),
  aims           text check (length(aims) <= 40),
  phone          text check (length(phone) <= 40)
);
select public.mka_register_table('delegation_drivers', 'delegations');
create index if not exists delegation_drivers_delegation_idx on public.delegation_drivers (delegation_id, leg, position);

-- ---------- Finding a working link ----------

create or replace function public.region_delegation(tok text)
returns uuid language sql stable security definer set search_path = public as $$
  select l.delegation_id
  from public.delegation_region_links l
  join public.delegations d on d.id = l.delegation_id
  where tok is not null
    and length(tok) >= 32
    and l.token = tok
    and l.revoked_at is null
    and now() < greatest(
      l.created_at + interval '14 days',
      coalesce(d.departure_date + 8, (l.created_at + interval '60 days')::date)::timestamptz
    )
  limit 1;
$$;
revoke all on function public.region_delegation(text) from public, anon, authenticated;

-- The operator's brief. Null if the link doesn't work.
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
    -- What the AeK sent (travel times, flight numbers, airport, group size, needs).
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
        'pickup_time', t.pickup_time, 'pickup', t.pickup, 'dropoff', t.dropoff, 'driver', t.driver, 'notes', t.notes
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

-- Saves the drivers. p = {"pickup": [{full_name, aims, phone}, …], "dropoff": […]}.
-- Empty rows are skipped; nothing is required. Unchanged lists are left alone.
create or replace function public.region_save_drivers(tok text, p jsonb)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  did uuid := public.region_delegation(tok);
  wanted jsonb;
  current jsonb;
begin
  if did is null then
    raise exception 'This link has expired or been switched off.' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(x order by x->>'leg' desc, (x->>'position')::int), '[]'::jsonb) into wanted
  from (
    select jsonb_build_object(
      'leg', leg,
      'position', (ord - 1)::int,
      'full_name', nullif(trim(e->>'full_name'), ''),
      'aims', nullif(trim(e->>'aims'), ''),
      'phone', nullif(trim(e->>'phone'), '')
    ) as x
    from (
      select 'pickup' as leg, e, ord from jsonb_array_elements(coalesce(p->'pickup', '[]'::jsonb)) with ordinality as a(e, ord)
      union all
      select 'dropoff', e, ord from jsonb_array_elements(coalesce(p->'dropoff', '[]'::jsonb)) with ordinality as b(e, ord)
    ) rows
    where coalesce(trim(e->>'full_name'), '') <> '' or coalesce(trim(e->>'aims'), '') <> '' or coalesce(trim(e->>'phone'), '') <> ''
  ) cleaned;

  if jsonb_array_length(wanted) > 40 then
    raise exception 'That''s more drivers than we can save at once.' using errcode = 'P0001';
  end if;

  -- Renumber positions after skipping empty rows.
  select coalesce(jsonb_agg(x || jsonb_build_object('position', n - 1) order by n), '[]'::jsonb) into wanted
  from (
    select x, row_number() over (partition by x->>'leg' order by (x->>'position')::int) as n
    from jsonb_array_elements(wanted) as w(x)
  ) numbered;

  select coalesce(jsonb_agg(jsonb_build_object('leg', leg, 'position', position, 'full_name', full_name, 'aims', aims, 'phone', phone) order by leg desc, position), '[]'::jsonb)
  into current
  from public.delegation_drivers where delegation_id = did;

  select coalesce(jsonb_agg(x order by x->>'leg' desc, (x->>'position')::int), '[]'::jsonb) into wanted
  from jsonb_array_elements(wanted) as w(x);

  if wanted is distinct from current then
    delete from public.delegation_drivers where delegation_id = did;
    insert into public.delegation_drivers (delegation_id, leg, position, full_name, aims, phone)
    select did, x->>'leg', (x->>'position')::int, x->>'full_name', x->>'aims', x->>'phone'
    from jsonb_array_elements(wanted) as w(x);
  end if;

  return now();
end $$;

revoke all on function public.region_view(text) from public;
revoke all on function public.region_save_drivers(text, jsonb) from public;
grant execute on function public.region_view(text) to anon, authenticated;
grant execute on function public.region_save_drivers(text, jsonb) to anon, authenticated;
