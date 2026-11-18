-- =====================================================================
-- 0020: Equipment owned by departments
--
-- Each item in the store has an Owner: one of the departments on the
-- borrowers list (the office leads with accounts), or "Other" (MKA Store).
--
--   * Department-owned items: a request goes to that department's head(s).
--     They approve or reject it, with a message, under "Borrowing requests"
--     on their Equipment Loans page, and handle collection and return.
--   * "Other" items: the Storage department admin decides, as before.
--   * MKA Storage sees every loan and conversation on its Loan log
--     ("RQ Masroor is borrowing 100 chairs from Sehat-e-Jismani, 3 to 5
--     Dec"), but only takes part in the "Other" ones.
--
-- A person heads a department when their email is on the borrowers list
-- with that department. Requests record the owning department when they're
-- made, so later edits to an item don't move a request mid-way.
--
-- Loans, messages and items are added to Supabase Realtime, so pages update
-- live when anything changes.
--
-- Run after 0014_storage_loans.sql (and 0015). Safe to run again.
-- =====================================================================

alter table public.storage_loans
  add column if not exists owner_department text check (owner_department is null or length(owner_department) <= 120);

alter table public.storage_loan_messages
  add column if not exists author_role text check (author_role in ('borrower', 'owner', 'store'));
update public.storage_loan_messages
set author_role = case when from_storage then 'store' else 'borrower' end
where author_role is null;

-- ---------------------------------------------------------------------
-- Departments and their heads
-- ---------------------------------------------------------------------

-- The departments an item can belong to: those on the borrowers list.
create or replace function public.storage_owner_departments()
returns setof text language sql stable security definer set search_path = public as $$
  select d from (
    select distinct on (lower(trim(department))) trim(department) as d
    from public.storage_borrowers
    where nullif(trim(department), '') is not null
    order by lower(trim(department)), trim(department)
  ) x
  where public.has_department_access('storage') or public.has_department_access('equipment-loans')
  order by d;
$$;

-- The department an item's Owner names, spelt as on the borrowers list.
-- Null for "Other", blank, or anything that isn't a department there (MKA Store decides).
create or replace function public.storage_owner_of(p_owner text)
returns text language sql stable security definer set search_path = public as $$
  select min(trim(b.department))
  from public.storage_borrowers b
  where nullif(trim(coalesce(p_owner, '')), '') is not null
    and lower(trim(b.department)) = lower(trim(p_owner));
$$;

-- The signed-in person's department on the borrowers list, if any.
create or replace function public.storage_my_department()
returns text language sql stable security definer set search_path = public as $$
  select trim(b.department)
  from public.storage_borrowers b
  join public.profiles p on lower(p.email) = b.email
  where p.id = auth.uid() and nullif(trim(b.department), '') is not null
  limit 1;
$$;

-- Does the signed-in person head this department?
create or replace function public.storage_is_owner(p_department text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_department is not null and auth.uid() is not null and exists (
    select 1
    from public.storage_borrowers b
    join public.profiles p on lower(p.email) = b.email
    where p.id = auth.uid() and lower(trim(b.department)) = lower(trim(p_department))
  );
$$;

revoke all on function public.storage_owner_departments() from public, anon;
revoke all on function public.storage_owner_of(text) from public, anon;
revoke all on function public.storage_my_department() from public, anon;
revoke all on function public.storage_is_owner(text) from public, anon;
grant execute on function public.storage_owner_departments() to authenticated;
grant execute on function public.storage_owner_of(text) to authenticated;
grant execute on function public.storage_my_department() to authenticated;
grant execute on function public.storage_is_owner(text) to authenticated;

-- Requests made before this change go to their item's department too.
update public.storage_loans
set owner_department = public.storage_owner_of(owned_by)
where owner_department is null and public.storage_owner_of(owned_by) is not null;

-- ---------------------------------------------------------------------
-- Department heads see and decide requests for their department's items
-- ---------------------------------------------------------------------

drop policy if exists "owner read" on public.storage_loans;
create policy "owner read" on public.storage_loans
  for select to authenticated using (public.storage_is_owner(owner_department));
drop policy if exists "owner decide" on public.storage_loans;
create policy "owner decide" on public.storage_loans
  for update to authenticated
  using (public.storage_is_owner(owner_department))
  with check (public.storage_is_owner(owner_department));

drop policy if exists "owner read" on public.storage_loan_messages;
create policy "owner read" on public.storage_loan_messages
  for select to authenticated
  using (exists (select 1 from public.storage_loans l where l.id = loan_id and public.storage_is_owner(l.owner_department)));
drop policy if exists "owner write" on public.storage_loan_messages;
create policy "owner write" on public.storage_loan_messages
  for insert to authenticated
  with check (
    public.can_edit_department('equipment-loans')
    and exists (select 1 from public.storage_loans l where l.id = loan_id and public.storage_is_owner(l.owner_department))
  );

-- ---------------------------------------------------------------------
-- Who can move a request on
-- ---------------------------------------------------------------------

create or replace function public.storage_loan_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Europe/London')::date;
  it public.storage_items;
  loc text;
  system boolean := auth.uid() is null;
  staff boolean := system or public.can_edit_department('storage');
  boss boolean := system or public.is_department_manager('storage');
  owner boolean;
  dept text;
  decider boolean;
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
    -- Who decides: the owning department, or MKA Store when there isn't one.
    new.owner_department := public.storage_owner_of(it.owned_by);
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

  -- UPDATE: what was requested, by whom, and who decides never change.
  if (new.item_id is distinct from old.item_id and new.item_id is not null)
     or new.item_name is distinct from old.item_name
     or (new.requested_by is distinct from old.requested_by and new.requested_by is not null)
     or new.ref is distinct from old.ref then
    raise exception 'The item and the person who asked for it can''t be changed. Make a new request instead.' using errcode = '42501';
  end if;
  new.location_name := old.location_name;
  new.owned_by := old.owned_by;
  new.owner_department := old.owner_department;
  new.requester_name := old.requester_name;
  new.requester_email := old.requester_email;

  dept := old.owner_department;
  owner := system or public.storage_is_owner(dept);
  -- Department items: that department's heads. Everything else: the Storage department admin.
  decider := case when dept is not null then owner else boss end;
  mine := auth.uid() = old.requested_by;

  if not staff and not owner then
    -- Borrowers: change the details while it's pending, or cancel before collection.
    new.decision_note := old.decision_note;
    new.return_note := old.return_note;
    if new.status is distinct from old.status then
      if not (new.status = 'Cancelled' and old.status in ('Pending', 'Approved')) then
        raise exception 'Only % can change where a request has got to.', coalesce(dept, 'MKA Storage') using errcode = '42501';
      end if;
      new.quantity := old.quantity;
      new.start_date := old.start_date;
      new.end_date := old.end_date;
    elsif old.status <> 'Pending' then
      raise exception 'This request has been decided, so it can''t be changed. Send % a message instead.', coalesce(dept, 'MKA Storage') using errcode = '42501';
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

  -- MKA Storage can't change the terms of another department's loan.
  if dept is not null and not owner and not mine
     and (new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date or new.quantity is distinct from old.quantity) then
    raise exception 'Only % can change the dates of this loan.', dept using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'Pending' and new.status in ('Approved', 'Rejected') then
      if not decider then
        if dept is not null then
          raise exception 'Only the head of % can approve or reject this request.', dept using errcode = '42501';
        end if;
        raise exception 'Only the Storage department admin can approve or reject requests.' using errcode = '42501';
      end if;
      new.decided_by_name := case when dept is not null and not system
                                  then concat_ws(' · ', public.storage_actor_name(), dept)
                                  else public.storage_actor_name() end;
      new.decided_at := now();
    elsif old.status = 'Approved' and new.status = 'Collected' then
      if dept is not null and not owner and not staff then
        raise exception 'Only % can mark this collected.', dept using errcode = '42501';
      end if;
      new.collected_at := now();
    elsif old.status = 'Collected' and new.status = 'Returned' then
      new.returned_at := now();
    elsif old.status in ('Pending', 'Approved') and new.status = 'Cancelled' then
      if not (decider or mine) then
        raise exception 'Only % can cancel someone else''s request.', coalesce(dept, 'the Storage department admin') using errcode = '42501';
      end if;
    elsif old.status = 'Rejected' and new.status = 'Pending' and decider then
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

-- ---------------------------------------------------------------------
-- Messages: borrower, owning department, or MKA Store
-- ---------------------------------------------------------------------

create or replace function public.storage_message_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  l public.storage_loans;
begin
  if tg_op = 'INSERT' then
    select * into l from public.storage_loans where id = new.loan_id;
    if auth.uid() is not null and auth.uid() = l.requested_by then
      new.author_role := 'borrower';
    elsif l.owner_department is not null and public.storage_is_owner(l.owner_department) then
      new.author_role := 'owner';
    elsif l.owner_department is null or auth.uid() is null then
      new.author_role := 'store';
    else
      raise exception 'This loan is between % and the borrower. MKA Storage can read the conversation but not write in it.', l.owner_department
        using errcode = '42501';
    end if;
    -- "From the lender's side": anyone but the borrower.
    new.from_storage := new.author_role <> 'borrower';
    new.author_name := public.storage_actor_name();
    new.read_at := null;
    new.body := trim(new.body);
  else
    new.loan_id := old.loan_id;
    new.body := old.body;
    new.from_storage := old.from_storage;
    new.author_role := old.author_role;
    new.author_name := old.author_name;
  end if;
  return new;
end $$;

drop trigger if exists storage_message_rules on public.storage_loan_messages;
create trigger storage_message_rules before insert or update on public.storage_loan_messages
  for each row execute function public.storage_message_rules();

-- Marks messages to me as read (quietly, without filling the activity log).
--   'storage'  : borrowers' messages on MKA Store's own loans
--   'owner'    : borrowers' messages on my department's loans
--   'borrower' : replies on my own requests
create or replace function public.storage_messages_read(p_side text)
returns void language plpgsql security definer set search_path = public as $$
declare
  mine text := public.storage_my_department();
begin
  perform set_config('mka.skip_audit', 'on', true);
  if p_side = 'storage' then
    if public.has_department_access('storage') then
      update public.storage_loan_messages m set read_at = now()
      from public.storage_loans l
      where l.id = m.loan_id and l.owner_department is null and m.author_role = 'borrower' and m.read_at is null;
    end if;
  elsif p_side = 'owner' then
    if mine is not null then
      update public.storage_loan_messages m set read_at = now()
      from public.storage_loans l
      where l.id = m.loan_id and lower(l.owner_department) = lower(mine)
        and l.requested_by is distinct from auth.uid()
        and m.author_role = 'borrower' and m.read_at is null;
    end if;
  else
    update public.storage_loan_messages m set read_at = now()
    from public.storage_loans l
    where l.id = m.loan_id and l.requested_by = auth.uid() and m.author_role <> 'borrower' and m.read_at is null;
  end if;
  perform set_config('mka.skip_audit', 'off', true);
end $$;

revoke all on function public.storage_messages_read(text) from public, anon;
grant execute on function public.storage_messages_read(text) to authenticated;

-- ---------------------------------------------------------------------
-- Search: says who decides each item
-- ---------------------------------------------------------------------

drop function if exists public.storage_loan_search(text, date, date);
create function public.storage_loan_search(p_q text default '', p_from date default null, p_to date default null)
returns table (id uuid, item_name text, category text, location_name text, site text, owned_by text,
               owner_department text, quantity integer, available integer)
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
  select i.id, i.item_name, i.category, coalesce(l.name, i.location), l.site, i.owned_by,
         public.storage_owner_of(i.owned_by), i.quantity,
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
-- Live updates (Supabase Realtime). Each person still only receives the
-- rows they're allowed to read.
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['storage_loans', 'storage_loan_messages', 'storage_items'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
