-- =====================================================================
-- 0007: AeK links
--
-- Each delegation can have a private link for its AeK (Amir-e-Kafla, the
-- head of delegation). Without signing in, the AeK can give their arrival and
-- departure times, travel details and contact details, and upload their
-- itinerary. The Delegations team sees it on the delegation's Info tab next to
-- the Google Calendar dates. Nothing the AeK sends changes the calendar.
--
-- Safety
--   * A link only ever reaches its own delegation, through the functions below.
--     Guests can't read or change any table directly.
--   * One active link per delegation. It stops working 7 days after departure
--     (and never sooner than 14 days after it was made), or when switched off.
--
-- Run after 0001–0006 and supabase/approved_access.sql. Safe to run again.
-- =====================================================================

-- Itineraries can now come from the team or from the AeK.
alter table public.delegation_files
  add column if not exists source text not null default 'team';
alter table public.delegation_files drop constraint if exists delegation_files_source_check;
alter table public.delegation_files
  add constraint delegation_files_source_check check (source in ('team', 'aek'));

-- ---------- Links ----------

create table if not exists public.delegation_aek_links (
  id             uuid primary key default gen_random_uuid(),
  delegation_id  uuid not null references public.delegations(id) on delete cascade,
  token          text not null unique check (length(token) >= 32),
  revoked_at     timestamptz
);
select public.mka_register_table('delegation_aek_links', 'delegations');
create index if not exists delegation_aek_links_delegation_idx on public.delegation_aek_links (delegation_id, created_at desc);

-- ---------- What the AeK sent (one row per delegation, latest wins) ----------

create table if not exists public.delegation_aek_updates (
  id                uuid primary key default gen_random_uuid(),
  delegation_id     uuid not null unique references public.delegations(id) on delete cascade,
  arrival_date      date,
  arrival_time      time,
  arrival_travel    text check (length(arrival_travel) <= 120),
  arrival_place     text check (length(arrival_place) <= 120),
  departure_date    date,
  departure_time    time,
  departure_travel  text check (length(departure_travel) <= 120),
  departure_place   text check (length(departure_place) <= 120),
  head_name         text check (length(head_name) <= 120),
  head_contact      text check (length(head_contact) <= 40),
  members           integer check (members between 0 and 2000),
  notes             text check (length(notes) <= 2000),
  submitted_at      timestamptz not null default now(),
  constraint delegation_aek_updates_dates check (departure_date is null or arrival_date is null or departure_date >= arrival_date)
);
select public.mka_register_table('delegation_aek_updates', 'delegations');

-- ---------- Finding a working link ----------

-- The delegation a link opens, if the link still works. Internal only.
create or replace function public.aek_delegation(tok text)
returns uuid language sql stable security definer set search_path = public as $$
  select l.delegation_id
  from public.delegation_aek_links l
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
revoke all on function public.aek_delegation(text) from public, anon, authenticated;

-- What the AeK page shows: the basics of their own delegation, what they've
-- already sent, and the names of files they've uploaded. Null if the link
-- doesn't work.
create or replace function public.aek_view(tok text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  did uuid := public.aek_delegation(tok);
  d public.delegations;
begin
  if did is null then return null; end if;
  select * into d from public.delegations where id = did;
  return jsonb_build_object(
    'delegation', jsonb_build_object(
      'id', d.id,
      'name', d.name,
      'country', d.country,
      'members', d.members,
      'head_of_delegation', d.head_of_delegation,
      'head_contact', d.head_contact,
      'arrival_date', d.arrival_date,
      'departure_date', d.departure_date
    ),
    'update', (
      select to_jsonb(u) - 'id' - 'delegation_id' - 'created_by' - 'updated_by' - 'created_at' - 'updated_at'
      from public.delegation_aek_updates u where u.delegation_id = did
    ),
    'files', coalesce((
      select jsonb_agg(jsonb_build_object('name', f.file_name, 'at', f.created_at) order by f.created_at)
      from public.delegation_files f where f.delegation_id = did and f.source = 'aek'
    ), '[]'::jsonb)
  );
end $$;

-- Saves the AeK's details. Returns when they were saved.
create or replace function public.aek_submit(tok text, p jsonb)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  did uuid := public.aek_delegation(tok);
  saved timestamptz;
  t text;
begin
  if did is null then
    raise exception 'This link has expired or been switched off.' using errcode = 'P0001';
  end if;

  insert into public.delegation_aek_updates as u (
    delegation_id, arrival_date, arrival_time, arrival_travel, arrival_place,
    departure_date, departure_time, departure_travel, departure_place,
    head_name, head_contact, members, notes, submitted_at
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
    nullif(trim(p->>'head_name'), ''),
    nullif(trim(p->>'head_contact'), ''),
    nullif(p->>'members', '')::integer,
    nullif(trim(p->>'notes'), ''),
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
    submitted_at = now()
  returning u.submitted_at into saved;

  return saved;
end $$;

-- Records an itinerary the AeK has just uploaded to storage.
create or replace function public.aek_add_file(tok text, path text, file_name text, mime_type text, size_bytes integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  did uuid := public.aek_delegation(tok);
begin
  if did is null then
    raise exception 'This link has expired or been switched off.' using errcode = 'P0001';
  end if;
  if path not like did::text || '/aek/' || tok || '/%' then
    raise exception 'That file is not part of this delegation.' using errcode = 'P0001';
  end if;
  if mime_type not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')
     or size_bytes > 10485760 then
    raise exception 'Only PDFs and images up to 10 MB.' using errcode = 'P0001';
  end if;
  insert into public.delegation_files (delegation_id, kind, file_path, file_name, mime_type, size_bytes, source)
  values (did, 'itinerary', path, left(file_name, 200), mime_type, size_bytes, 'aek');
end $$;

revoke all on function public.aek_view(text) from public;
revoke all on function public.aek_submit(text, jsonb) from public;
revoke all on function public.aek_add_file(text, text, text, text, integer) from public;
grant execute on function public.aek_view(text) to anon, authenticated;
grant execute on function public.aek_submit(text, jsonb) to anon, authenticated;
grant execute on function public.aek_add_file(text, text, text, text, integer) to anon, authenticated;

-- ---------- Uploads from the AeK page ----------
-- Files go to <delegation id>/aek/<link>/<file> in the private "delegations"
-- bucket, and only while that link works. The AeK can upload but not list,
-- open or remove anything.

create or replace function public.aek_upload_allowed(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select (storage.foldername(object_name))[2] = 'aek'
     and public.aek_delegation((storage.foldername(object_name))[3])::text = (storage.foldername(object_name))[1];
$$;
revoke all on function public.aek_upload_allowed(text) from public;
grant execute on function public.aek_upload_allowed(text) to anon, authenticated;

drop policy if exists "delegation files aek upload" on storage.objects;
create policy "delegation files aek upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'delegations' and public.aek_upload_allowed(name));
