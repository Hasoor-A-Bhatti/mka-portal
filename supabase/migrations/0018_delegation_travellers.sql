-- =====================================================================
-- 0018: Travellers (one row per person in a delegation)
--
-- Each person's arrival and return journey (date, time, flight, airport or
-- terminal), and whether they need an airport pickup, a drop-off and
-- accommodation. Shown on the delegation's Travellers tab, grouped by flight.
--
-- The list is filled from three places:
--   * the Delegations team, on the Travellers tab (or an SQL import);
--   * the AeK, through their AeK link: everyone they enter there goes
--     straight onto this list (aek_travellers, aek_save_travellers);
--   * khuddam the AeK listed before this change are copied across once.
-- The Region Guidance link shows the pickup and drop-off runs with names and
-- phone numbers (region_travellers). Read only.
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
  notes                text check (length(notes) <= 1000),
  constraint delegation_travellers_ref unique (delegation_id, ref)
);
-- Who added the person: the team, or the AeK through their link.
alter table public.delegation_travellers add column if not exists source text not null default 'team';
alter table public.delegation_travellers drop constraint if exists delegation_travellers_source_check;
alter table public.delegation_travellers add constraint delegation_travellers_source_check check (source in ('team', 'aek'));
-- An earlier draft of this file had a "needs a bed" flag; it isn't used.
alter table public.delegation_travellers drop column if exists needs_bed;

select public.mka_register_table('delegation_travellers', 'delegations');
create index if not exists delegation_travellers_delegation_idx on public.delegation_travellers (delegation_id, arrival_date, arrival_time);

-- ---------- Khuddam the AeK listed before (0009) ----------
-- Copied across once: names already on a delegation's list are skipped.

do $$
begin
  perform set_config('mka.skip_audit', 'on', true);
  insert into public.delegation_travellers (delegation_id, full_name, arrival_flight, needs_pickup, source)
  select u.delegation_id, left(trim(k->>'name'), 120), left(nullif(trim(k->>'flight'), ''), 40), true, 'aek'
  from public.delegation_aek_updates u
  cross join lateral jsonb_array_elements(case when jsonb_typeof(u.khuddam) = 'array' then u.khuddam else '[]'::jsonb end) as k
  where nullif(trim(k->>'name'), '') is not null
    and not exists (
      select 1 from public.delegation_travellers t
      where t.delegation_id = u.delegation_id and lower(trim(t.full_name)) = lower(trim(k->>'name'))
    );
  perform set_config('mka.skip_audit', 'off', true);
end $$;

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
      'id', t.id, 'ref', t.ref, 'full_name', t.full_name, 'source', t.source,
      'arrival_date', t.arrival_date, 'arrival_time', t.arrival_time,
      'arrival_flight', t.arrival_flight, 'arrival_place', t.arrival_place,
      'departure_date', t.departure_date, 'departure_time', t.departure_time,
      'departure_flight', t.departure_flight, 'departure_place', t.departure_place,
      'needs_pickup', t.needs_pickup, 'needs_dropoff', t.needs_dropoff, 'needs_accommodation', t.needs_accommodation
    ) order by t.ref nulls last, t.created_at, t.full_name)
    from public.delegation_travellers t where t.delegation_id = did
  ), '[]'::jsonb);
end $$;

-- Saves the group from the AeK link, and returns the list as it now stands.
-- p = [{ "id": "…" (missing for someone new), "full_name": "…",
--        "arrival_date", "arrival_time", "arrival_flight", "arrival_place",
--        "departure_date", "departure_time", "departure_flight", "departure_place",
--        "needs_pickup", "needs_dropoff", "needs_accommodation" },
--      { "id": "…", "remove": true }, …]
-- Only people in the link's own delegation are touched. The AeK can remove only
-- people they added themselves; people the team added stay.
drop function if exists public.aek_save_travellers(text, jsonb);
create function public.aek_save_travellers(tok text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  did uuid := public.aek_delegation(tok);
  e jsonb;
  pid uuid;
  nm text;
  ad date; at time; df date; dt time;
  af text; ap text; dpf text; dpp text;
  pu boolean; dr boolean; ac boolean;
begin
  if did is null then
    raise exception 'This link has expired or been switched off.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 1000 then
    raise exception 'Something went wrong reading the list. Please reload the page and try again.' using errcode = 'P0001';
  end if;

  for e in select * from jsonb_array_elements(p) loop
    continue when jsonb_typeof(e) <> 'object';
    pid := case when coalesce(e->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (e->>'id')::uuid end;

    if coalesce((e->>'remove')::text, '') = 'true' then
      if pid is not null then
        delete from public.delegation_travellers where id = pid and delegation_id = did and source = 'aek';
      end if;
      continue;
    end if;

    begin
      ad := nullif(e->>'arrival_date', '')::date;
      at := nullif(e->>'arrival_time', '')::time;
      df := nullif(e->>'departure_date', '')::date;
      dt := nullif(e->>'departure_time', '')::time;
      pu := coalesce(nullif(e->>'needs_pickup', '')::boolean, true);
      dr := coalesce(nullif(e->>'needs_dropoff', '')::boolean, true);
      ac := coalesce(nullif(e->>'needs_accommodation', '')::boolean, true);
    exception when others then
      raise exception 'One of the dates or times isn''t valid.' using errcode = 'P0001';
    end;
    if ad is not null and df is not null and df < ad then
      raise exception 'Someone''s return date is before their arrival date.' using errcode = 'P0001';
    end if;
    nm  := left(nullif(trim(e->>'full_name'), ''), 120);
    af  := left(nullif(upper(regexp_replace(e->>'arrival_flight', '\s+', '', 'g')), ''), 40);
    ap  := left(nullif(trim(e->>'arrival_place'), ''), 80);
    dpf := left(nullif(upper(regexp_replace(e->>'departure_flight', '\s+', '', 'g')), ''), 40);
    dpp := left(nullif(trim(e->>'departure_place'), ''), 80);

    if pid is null then
      -- Someone new. Rows without a name are skipped.
      continue when nm is null;
      if (select count(*) from public.delegation_travellers where delegation_id = did) >= 1000 then
        raise exception 'The list is full (1,000 people).' using errcode = 'P0001';
      end if;
      insert into public.delegation_travellers (
        delegation_id, full_name, arrival_date, arrival_time, arrival_flight, arrival_place,
        departure_date, departure_time, departure_flight, departure_place,
        needs_pickup, needs_dropoff, needs_accommodation, source
      ) values (did, nm, ad, at, af, ap, df, dt, dpf, dpp, pu, dr, ac, 'aek');
    else
      update public.delegation_travellers x set
        full_name = coalesce(nm, x.full_name),
        arrival_date = ad, arrival_time = at, arrival_flight = af, arrival_place = ap,
        departure_date = df, departure_time = dt, departure_flight = dpf, departure_place = dpp,
        needs_pickup = pu, needs_dropoff = dr, needs_accommodation = ac
      where x.id = pid
        and x.delegation_id = did
        -- Unchanged people aren't rewritten, so the activity log only shows real changes.
        and (x.full_name, x.arrival_date, x.arrival_time, x.arrival_flight, x.arrival_place,
             x.departure_date, x.departure_time, x.departure_flight, x.departure_place,
             x.needs_pickup, x.needs_dropoff, x.needs_accommodation)
            is distinct from
            (coalesce(nm, x.full_name), ad, at, af, ap, df, dt, dpf, dpp, pu, dr, ac);
    end if;
  end loop;

  return public.aek_travellers(tok);
end $$;

-- ---------- Region Guidance link ----------

-- Everything the region needs for pickups and drop-offs. Null if the link doesn't work.
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
      'needs_dropoff', t.needs_dropoff, 'notes', t.notes
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
