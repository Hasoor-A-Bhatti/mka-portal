-- =====================================================================
-- 0014: MKA Storage inventory and Equipment Loans
--
-- MKA Storage
--   * Storage locations (the 11 current stores are added for you).
--   * Each item has a location, an owner (the department it belongs to),
--     a quantity held, a count of units reported missing and an optional
--     low-stock level. Its status (In stock, Low stock, Out of stock,
--     Missing) is worked out by the database.
--   * Every stock change (added, removed, missing, found, written off,
--     stock take, moved) is kept in a history.
--
-- Equipment Loans
--   * A separate area for department leads on the borrowers list. They
--     only see Equipment Loans: search the catalogue, request an item for
--     a date range, and follow their requests.
--   * The Storage department admin approves or rejects requests, with an
--     optional message. The team marks items collected and returned.
--   * Messages between Storage and the borrower, per request.
--   * The Storage department admin manages the borrowers list on the
--     Storage page (Borrowers tab). No SQL needed to add someone.
--
-- Run after approved_access.sql and 0010_jaidat.sql. Safe to run again.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The Equipment Loans area
-- ---------------------------------------------------------------------

insert into public.departments (slug, name) values ('equipment-loans', 'Equipment Loans')
on conflict (slug) do update set name = excluded.name;

-- Storage staff can see the names of borrowers (for requests and the activity log).
create or replace function public.can_see_profile(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    target = auth.uid()
    or public.is_admin()
    or coalesce((select is_admin from public.profiles where id = target), false)
    or exists (
      select 1
      from public.user_departments mine
      join public.user_departments theirs on theirs.department = mine.department
      where mine.user_id = auth.uid() and theirs.user_id = target
    )
    or (
      public.has_department_access('storage')
      and exists (select 1 from public.user_departments where user_id = target and department = 'equipment-loans')
    );
$$;

create or replace function public.storage_actor_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(trim(full_name), '') from public.profiles where id = auth.uid()), 'MKA Storage');
$$;

-- ---------------------------------------------------------------------
-- 2. Locations
-- ---------------------------------------------------------------------

create table if not exists public.storage_locations (
  id        uuid primary key default gen_random_uuid(),
  name      text not null unique check (length(trim(name)) between 1 and 120),
  site      text check (site is null or length(site) <= 120),
  position  integer not null default 0,
  notes     text check (notes is null or length(notes) <= 1000),
  active    boolean not null default true
);
select public.mka_register_table('storage_locations', 'storage');
select public.mka_manager_only('storage_locations', 'storage', false);

do $$
begin
  perform set_config('mka.skip_audit', 'on', true);
  insert into public.storage_locations (name, site, position, notes) values
    ('Islamabad Muqami Store',             'Islamabad',       10, null),
    ('SeM Garage',                         'Islamabad',       20, null),
    ('AeM Container 1',                    'AeM',             30, null),
    ('AeM Container 2',                    'AeM',             40, 'New container'),
    ('AeM Container 3',                    'AeM',             50, 'New container'),
    ('Baitul Futuh Container',             'Baitul Futuh',    60, null),
    ('Baitul Futuh Khuddam Office',        'Baitul Futuh',    70, null),
    ('Baitul Futuh Tahir Hall Store Room', 'Baitul Futuh',    80, null),
    ('Baitul Ehsan Store',                 'Other locations', 90, null),
    ('HM Storage',                         'Other locations', 100, null),
    ('Kingsley Storage',                   'Other locations', 110, null)
  on conflict (name) do nothing;
  perform set_config('mka.skip_audit', 'off', true);
end $$;

-- ---------------------------------------------------------------------
-- 3. Items
-- ---------------------------------------------------------------------

alter table public.storage_items add column if not exists location_id uuid references public.storage_locations(id) on delete set null;
alter table public.storage_items add column if not exists owned_by text;
alter table public.storage_items add column if not exists missing_qty integer not null default 0;
alter table public.storage_items add column if not exists min_qty integer;
alter table public.storage_items add column if not exists loanable boolean not null default true;

alter table public.storage_items drop constraint if exists storage_items_counts_check;
alter table public.storage_items add constraint storage_items_counts_check
  check (quantity >= 0 and quantity <= 1000000 and missing_qty >= 0 and missing_qty <= 1000000 and (min_qty is null or min_qty >= 0));

create index if not exists storage_items_location_idx on public.storage_items(location_id);

-- Items added before this keep their location if the name matches one above.
update public.storage_items i
set location_id = l.id
from public.storage_locations l
where i.location_id is null and i.location is not null and lower(trim(i.location)) = lower(l.name);

-- Status follows the numbers; the location text follows the chosen location.
create or replace function public.storage_item_rules()
returns trigger language plpgsql set search_path = public as $$
begin
  new.status := case
    when new.quantity = 0 and new.missing_qty > 0 then 'Missing'
    when new.quantity = 0 then 'Out of stock'
    when new.min_qty is not null and new.quantity <= new.min_qty then 'Low stock'
    else 'In stock'
  end;
  if new.location_id is not null then
    select name into new.location from public.storage_locations where id = new.location_id;
  end if;
  return new;
end $$;

drop trigger if exists storage_item_rules on public.storage_items;
create trigger storage_item_rules before insert or update on public.storage_items
  for each row execute function public.storage_item_rules();

-- Bring existing items' statuses in line (quietly).
do $$
begin
  perform set_config('mka.skip_audit', 'on', true);
  update public.storage_items set quantity = quantity;
  perform set_config('mka.skip_audit', 'off', true);
end $$;

-- ---------------------------------------------------------------------
-- 4. Stock history
-- ---------------------------------------------------------------------

create table if not exists public.storage_movements (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid not null references public.storage_items(id) on delete cascade,
  kind            text not null check (kind in ('Created', 'Added', 'Removed', 'Missing', 'Found', 'Written off', 'Stock take', 'Moved')),
  change          integer not null default 0,
  quantity_after  integer,
  missing_after   integer,
  note            text check (note is null or length(note) <= 500),
  actor_name      text
);
select public.mka_register_table('storage_movements', 'storage');
create index if not exists storage_movements_item_idx on public.storage_movements(item_id, created_at desc);

create or replace function public.storage_item_history()
returns trigger language plpgsql set search_path = public as $$
declare
  from_name text;
  to_name text;
begin
  if tg_op = 'INSERT' then
    insert into public.storage_movements (item_id, kind, change, quantity_after, missing_after, note, actor_name)
    values (new.id, 'Created', new.quantity, new.quantity, new.missing_qty, null, public.storage_actor_name());
  elsif new.location_id is distinct from old.location_id then
    select name into from_name from public.storage_locations where id = old.location_id;
    select name into to_name from public.storage_locations where id = new.location_id;
    insert into public.storage_movements (item_id, kind, change, quantity_after, missing_after, note, actor_name)
    values (new.id, 'Moved', 0, new.quantity, new.missing_qty,
            coalesce(from_name, 'No location') || ' → ' || coalesce(to_name, 'No location'), public.storage_actor_name());
  end if;
  return null;
end $$;

drop trigger if exists storage_item_history on public.storage_items;
create trigger storage_item_history after insert or update on public.storage_items
  for each row execute function public.storage_item_history();

-- One stock change, done in one go so the numbers and the history always agree.
-- Runs as the signed-in user, so only people who can edit Storage can use it.
create or replace function public.storage_adjust(p_item uuid, p_kind text, p_amount integer, p_note text default null)
returns void language plpgsql security invoker set search_path = public as $$
declare
  i public.storage_items;
  q integer;
  m integer;
  delta integer;
begin
  if not public.can_edit_department('storage') then
    raise exception 'Your Storage access is view only.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 1000000 then
    raise exception 'Enter a number from 0 to 1,000,000.' using errcode = '22023';
  end if;
  select * into i from public.storage_items where id = p_item for update;
  if not found then
    raise exception 'That item no longer exists.' using errcode = 'P0002';
  end if;
  q := i.quantity;
  m := i.missing_qty;

  if p_kind <> 'Stock take' and p_amount = 0 then
    raise exception 'Enter how many.' using errcode = '22023';
  end if;

  case p_kind
    when 'Added' then q := q + p_amount; delta := p_amount;
    when 'Removed' then
      if p_amount > q then raise exception 'Only % in stock.', q using errcode = '22023'; end if;
      q := q - p_amount; delta := -p_amount;
    when 'Missing' then
      if p_amount > q then raise exception 'Only % in stock to mark as missing.', q using errcode = '22023'; end if;
      q := q - p_amount; m := m + p_amount; delta := -p_amount;
    when 'Found' then
      if p_amount > m then raise exception 'Only % marked as missing.', m using errcode = '22023'; end if;
      q := q + p_amount; m := m - p_amount; delta := p_amount;
    when 'Written off' then
      if p_amount > m then raise exception 'Only % marked as missing.', m using errcode = '22023'; end if;
      m := m - p_amount; delta := 0;
    when 'Stock take' then delta := p_amount - q; q := p_amount;
    else raise exception 'Unknown stock change.' using errcode = '22023';
  end case;

  update public.storage_items set quantity = q, missing_qty = m where id = p_item;
  insert into public.storage_movements (item_id, kind, change, quantity_after, missing_after, note, actor_name)
  values (p_item, p_kind, delta, q, m, nullif(trim(coalesce(p_note, '')), ''), public.storage_actor_name());
end $$;

grant execute on function public.storage_adjust(uuid, text, integer, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Borrowers list
-- ---------------------------------------------------------------------

create table if not exists public.storage_borrowers (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique check (email = lower(trim(email)) and email like '%_@_%.__%'),
  full_name     text check (full_name is null or length(full_name) <= 120),
  department    text check (department is null or length(department) <= 120),
  -- True when this list added them to approved_users (so removing them takes them off it too).
  created_user  boolean not null default false
);
select public.mka_register_table('storage_borrowers', 'storage');
-- Changes go through the functions below (Storage department admin only).
drop policy if exists "mka create" on public.storage_borrowers;
drop policy if exists "mka edit" on public.storage_borrowers;
drop policy if exists "mka remove" on public.storage_borrowers;

create or replace function public.storage_borrower_add(p_email text, p_name text, p_department text)
returns void language plpgsql security definer set search_path = public as $$
declare
  mail text := lower(trim(coalesce(p_email, '')));
  name text := nullif(trim(coalesce(p_name, '')), '');
  dept text := nullif(trim(coalesce(p_department, '')), '');
  made boolean := false;
begin
  if not public.is_department_manager('storage') then
    raise exception 'Only the Storage department admin can change the borrowers list.' using errcode = '42501';
  end if;
  if mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'That email address doesn''t look right.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.approved_users where email = mail) then
    insert into public.approved_users (email, full_name, is_admin) values (mail, name, false);
    made := true;
  end if;
  insert into public.storage_borrowers (email, full_name, department, created_user)
  values (mail, name, dept, made)
  on conflict (email) do update
  set full_name = coalesce(excluded.full_name, storage_borrowers.full_name),
      department = coalesce(excluded.department, storage_borrowers.department);
  insert into public.approved_departments (email, department, role)
  values (mail, 'equipment-loans', 'member')
  on conflict (email, department) do update set role = 'member';
end $$;

create or replace function public.storage_borrower_remove(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare
  mail text := lower(trim(coalesce(p_email, '')));
  b public.storage_borrowers;
begin
  if not public.is_department_manager('storage') then
    raise exception 'Only the Storage department admin can change the borrowers list.' using errcode = '42501';
  end if;
  select * into b from public.storage_borrowers where email = mail;
  delete from public.approved_departments where email = mail and department = 'equipment-loans';
  if found and b.created_user
     and not exists (select 1 from public.approved_departments where email = mail)
     and not coalesce((select is_admin from public.approved_users where email = mail), false) then
    delete from public.approved_users where email = mail;
  end if;
  delete from public.storage_borrowers where email = mail;
end $$;

-- The list as Storage sees it, with whether each person has signed in yet.
create or replace function public.storage_borrower_list()
returns table (email text, full_name text, department text, signed_in boolean, requests bigint, added_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_department_access('storage') then
    raise exception 'Storage isn''t on your account.' using errcode = '42501';
  end if;
  return query
  select b.email, coalesce(b.full_name, p.full_name), b.department, p.id is not null,
         (select count(*) from public.storage_loans l where l.requested_by = p.id), b.created_at
  from public.storage_borrowers b
  left join public.profiles p on lower(p.email) = b.email
  order by coalesce(b.full_name, p.full_name, b.email);
end $$;

revoke all on function public.storage_borrower_add(text, text, text) from public, anon;
revoke all on function public.storage_borrower_remove(text) from public, anon;
grant execute on function public.storage_borrower_add(text, text, text) to authenticated;
grant execute on function public.storage_borrower_remove(text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Loan requests
-- ---------------------------------------------------------------------

create sequence if not exists public.storage_loan_ref_seq;

create table if not exists public.storage_loans (
  id                   uuid primary key default gen_random_uuid(),
  ref                  text not null unique default ('LN-' || lpad(nextval('public.storage_loan_ref_seq')::text, 4, '0')),
  item_id              uuid references public.storage_items(id) on delete set null,
  -- Copied from the item when requested, so borrowers can see them without catalogue access.
  item_name            text not null,
  location_name        text,
  owned_by             text,
  quantity             integer not null default 1 check (quantity between 1 and 100000),
  start_date           date not null,
  end_date             date not null,
  purpose              text check (purpose is null or length(purpose) <= 1000),
  borrower_department  text check (borrower_department is null or length(borrower_department) <= 120),
  phone                text check (phone is null or length(phone) <= 40),
  requested_by         uuid references public.profiles(id) on delete set null default auth.uid(),
  requester_name       text,
  requester_email      text,
  status               text not null default 'Pending'
                       check (status in ('Pending', 'Approved', 'Rejected', 'Collected', 'Returned', 'Cancelled')),
  decision_note        text check (decision_note is null or length(decision_note) <= 2000),
  decided_by_name      text,
  decided_at           timestamptz,
  collected_at         timestamptz,
  returned_at          timestamptz,
  return_note          text check (return_note is null or length(return_note) <= 1000),
  constraint storage_loans_dates_check check (end_date >= start_date)
);
select public.mka_register_table('storage_loans', 'storage');
create index if not exists storage_loans_item_idx on public.storage_loans(item_id, status);
create index if not exists storage_loans_requester_idx on public.storage_loans(requested_by);

-- Borrowers see and request their own; Storage sees everything ("mka" policies).
drop policy if exists "borrower read own" on public.storage_loans;
create policy "borrower read own" on public.storage_loans
  for select to authenticated using (requested_by = auth.uid());
drop policy if exists "borrower request" on public.storage_loans;
create policy "borrower request" on public.storage_loans
  for insert to authenticated with check (requested_by = auth.uid() and public.can_edit_department('equipment-loans'));
drop policy if exists "borrower update own" on public.storage_loans;
create policy "borrower update own" on public.storage_loans
  for update to authenticated using (requested_by = auth.uid()) with check (requested_by = auth.uid());

-- Units of an item already promised (approved or out) on any day between two dates.
create or replace function public.storage_booked(p_item uuid, p_from date, p_to date, p_skip uuid default null)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(quantity), 0)::integer
  from public.storage_loans
  where item_id = p_item
    and status in ('Approved', 'Collected')
    and start_date <= p_to and end_date >= p_from
    and (p_skip is null or id <> p_skip);
$$;

create or replace function public.storage_loan_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Europe/London')::date;
  it public.storage_items;
  loc text;
  staff boolean := auth.uid() is null or public.can_edit_department('storage');
  boss boolean := auth.uid() is null or public.is_department_manager('storage');
  mine boolean;
  free integer;
begin
  if tg_op = 'INSERT' then
    select * into it from public.storage_items where id = new.item_id;
    if not found then
      raise exception 'That item is no longer in the catalogue.' using errcode = '23503';
    end if;
    if not it.loanable then
      raise exception 'That item isn''t available to borrow.' using errcode = '42501';
    end if;
    if new.start_date < today then
      raise exception 'The loan can''t start in the past.' using errcode = '22023';
    end if;
    if new.quantity > it.quantity then
      raise exception 'Only % of that item are held.', it.quantity using errcode = '22023';
    end if;
    select name into loc from public.storage_locations where id = it.location_id;
    new.item_name := it.item_name;
    new.location_name := coalesce(loc, it.location);
    new.owned_by := it.owned_by;
    new.requested_by := coalesce(auth.uid(), new.requested_by);
    select full_name, email into new.requester_name, new.requester_email from public.profiles where id = new.requested_by;
    new.borrower_department := coalesce(
      nullif(trim(coalesce(new.borrower_department, '')), ''),
      (select department from public.storage_borrowers where email = lower(new.requester_email))
    );
    new.status := 'Pending';
    new.decision_note := null;
    new.decided_by_name := null;
    new.decided_at := null;
    new.collected_at := null;
    new.returned_at := null;
    return new;
  end if;

  -- UPDATE: what was requested, and by whom, never changes.
  -- (The item or person can be cleared when they're removed: the copied names stay.)
  if (new.item_id is distinct from old.item_id and new.item_id is not null)
     or new.item_name is distinct from old.item_name
     or (new.requested_by is distinct from old.requested_by and new.requested_by is not null)
     or new.ref is distinct from old.ref then
    raise exception 'The item and the person who asked for it can''t be changed. Make a new request instead.' using errcode = '42501';
  end if;
  new.location_name := old.location_name;
  new.owned_by := old.owned_by;
  new.requester_name := old.requester_name;
  new.requester_email := old.requester_email;

  mine := auth.uid() = old.requested_by;

  if not staff then
    -- Borrowers: change the details while it's pending, or cancel before collection.
    new.decision_note := old.decision_note;
    new.return_note := old.return_note;
    if new.status is distinct from old.status then
      if not (new.status = 'Cancelled' and old.status in ('Pending', 'Approved')) then
        raise exception 'Only MKA Storage can change where a request has got to.' using errcode = '42501';
      end if;
      new.quantity := old.quantity;
      new.start_date := old.start_date;
      new.end_date := old.end_date;
    elsif old.status <> 'Pending' then
      raise exception 'This request has been decided, so it can''t be changed. Send Storage a message instead.' using errcode = '42501';
    end if;
    new.decided_by_name := old.decided_by_name;
    new.decided_at := old.decided_at;
    new.collected_at := old.collected_at;
    new.returned_at := old.returned_at;
    if new.status = 'Pending' and new.start_date < today and new.start_date is distinct from old.start_date then
      raise exception 'The loan can''t start in the past.' using errcode = '22023';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if old.status = 'Pending' and new.status in ('Approved', 'Rejected') then
      if not boss then
        raise exception 'Only the Storage department admin can approve or reject requests.' using errcode = '42501';
      end if;
      new.decided_by_name := public.storage_actor_name();
      new.decided_at := now();
    elsif old.status = 'Approved' and new.status = 'Collected' then
      new.collected_at := now();
    elsif old.status = 'Collected' and new.status = 'Returned' then
      new.returned_at := now();
    elsif old.status in ('Pending', 'Approved') and new.status = 'Cancelled' then
      if not (boss or mine) then
        raise exception 'Only the Storage department admin can cancel someone else''s request.' using errcode = '42501';
      end if;
    elsif old.status = 'Rejected' and new.status = 'Pending' and boss then
      new.decided_by_name := null;
      new.decided_at := null;
    else
      raise exception 'A request can''t go from % to %.', old.status, new.status using errcode = '22023';
    end if;
  end if;

  -- Never promise more than is held for those dates.
  if new.status in ('Approved', 'Collected')
     and (new.status is distinct from old.status or new.start_date <> old.start_date
          or new.end_date <> old.end_date or new.quantity <> old.quantity) then
    select * into it from public.storage_items where id = new.item_id;
    if found then
      free := it.quantity - public.storage_booked(new.item_id, new.start_date, new.end_date, new.id);
      if new.quantity > free then
        raise exception 'Only % of % available for those dates (others are already on loan or approved).',
          greatest(free, 0), it.item_name using errcode = '22023';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists storage_loan_rules on public.storage_loans;
create trigger storage_loan_rules before insert or update on public.storage_loans
  for each row execute function public.storage_loan_rules();

-- Search for borrowers: only what they need (name, where it's kept, whose it is, how many are free).
create or replace function public.storage_loan_search(p_q text default '', p_from date default null, p_to date default null)
returns table (id uuid, item_name text, category text, location_name text, site text, owned_by text, quantity integer, available integer)
language plpgsql stable security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Europe/London')::date;
  f date := coalesce(p_from, today);
  t date := greatest(coalesce(p_to, p_from, today), coalesce(p_from, today));
  words text[] := array_remove(regexp_split_to_array(lower(trim(coalesce(p_q, ''))), '\s+'), '');
begin
  if not (public.has_department_access('equipment-loans') or public.has_department_access('storage')) then
    raise exception 'Equipment Loans isn''t on your account.' using errcode = '42501';
  end if;
  return query
  select i.id, i.item_name, i.category, coalesce(l.name, i.location), l.site, i.owned_by, i.quantity,
         greatest(i.quantity - public.storage_booked(i.id, f, t), 0)::integer
  from public.storage_items i
  left join public.storage_locations l on l.id = i.location_id
  where i.loanable
    and not exists (
      select 1 from unnest(words) w
      where position(w in lower(concat_ws(' ', i.item_name, i.category, i.owned_by, l.name, l.site, i.location))) = 0
    )
  order by (i.quantity > 0) desc, i.item_name
  limit 120;
end $$;

revoke all on function public.storage_loan_search(text, date, date) from public, anon;
grant execute on function public.storage_loan_search(text, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Messages
-- ---------------------------------------------------------------------

create table if not exists public.storage_loan_messages (
  id            uuid primary key default gen_random_uuid(),
  loan_id       uuid not null references public.storage_loans(id) on delete cascade,
  body          text not null check (length(trim(body)) between 1 and 2000),
  from_storage  boolean not null default false,
  author_name   text,
  read_at       timestamptz
);
select public.mka_register_table('storage_loan_messages', 'storage');
create index if not exists storage_loan_messages_loan_idx on public.storage_loan_messages(loan_id, created_at);

drop policy if exists "borrower read own" on public.storage_loan_messages;
create policy "borrower read own" on public.storage_loan_messages
  for select to authenticated using (exists (select 1 from public.storage_loans l where l.id = loan_id and l.requested_by = auth.uid()));
drop policy if exists "borrower write own" on public.storage_loan_messages;
create policy "borrower write own" on public.storage_loan_messages
  for insert to authenticated with check (
    public.can_edit_department('equipment-loans')
    and exists (select 1 from public.storage_loans l where l.id = loan_id and l.requested_by = auth.uid())
  );

create or replace function public.storage_message_rules()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- From Storage unless it's the borrower writing on their own request.
    new.from_storage := auth.uid() is distinct from (select requested_by from public.storage_loans where id = new.loan_id);
    new.author_name := public.storage_actor_name();
    new.read_at := null;
    new.body := trim(new.body);
  else
    new.loan_id := old.loan_id;
    new.body := old.body;
    new.from_storage := old.from_storage;
    new.author_name := old.author_name;
  end if;
  return new;
end $$;

drop trigger if exists storage_message_rules on public.storage_loan_messages;
create trigger storage_message_rules before insert or update on public.storage_loan_messages
  for each row execute function public.storage_message_rules();

-- Marks messages to me as read (quietly, without filling the activity log).
create or replace function public.storage_messages_read(p_side text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('mka.skip_audit', 'on', true);
  if p_side = 'storage' then
    if not public.has_department_access('storage') then return; end if;
    update public.storage_loan_messages set read_at = now() where not from_storage and read_at is null;
  else
    update public.storage_loan_messages m set read_at = now()
    from public.storage_loans l
    where l.id = m.loan_id and l.requested_by = auth.uid() and m.from_storage and m.read_at is null;
  end if;
  perform set_config('mka.skip_audit', 'off', true);
end $$;

revoke all on function public.storage_messages_read(text) from public, anon;
grant execute on function public.storage_messages_read(text) to authenticated;
