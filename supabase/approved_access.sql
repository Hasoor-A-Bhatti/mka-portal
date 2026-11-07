-- =====================================================================
-- MKA Portal: Google sign-in access. The only file to run for this.
-- Run in the Supabase SQL Editor after migrations 0001–0005. Safe to re-run:
-- to change someone's access later, edit PART B and run the whole file again.
--
-- PART A sets things up (once is enough, re-running does no harm):
--   * a "viewer" role (View only: can open a department, can't change anything)
--   * an approved list: people on it get their access the first time they sign
--     in with Google, and changes to the list update people already signed in
--   * only @khuddam.co.uk accounts (or emails on the list) can be created
-- PART B is the list of people.
--
-- Roles
--   viewer    View only
--   member    Adds and edits, can't remove
--   manager   Department admin: adds, edits and removes
--   is_admin  Administrator: everything, in every department
-- =====================================================================


-- #####################################################################
-- PART A: setup
-- #####################################################################

-- ---------------------------------------------------------------------
-- 1. View-only role
-- ---------------------------------------------------------------------

alter table public.user_departments drop constraint if exists user_departments_role_check;
alter table public.user_departments
  add constraint user_departments_role_check check (role in ('viewer', 'member', 'manager'));

-- Can add and edit in a department (everyone with access except viewers).
create or replace function public.can_edit_department(dept text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.user_departments
    where user_id = auth.uid() and department = dept and role in ('member', 'manager')
  );
$$;

-- Every insert/update rule that only asked "has access?" now asks "can edit?".
-- Reading is unchanged, and rules that already need a department admin stay as they are.
do $$
declare
  p record;
  q text;
  c text;
begin
  for p in
    select schemaname, tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
      and cmd in ('INSERT', 'UPDATE')
      and (coalesce(qual, '') like '%has_department_access%' or coalesce(with_check, '') like '%has_department_access%')
  loop
    q := replace(p.qual, 'has_department_access', 'can_edit_department');
    c := replace(p.with_check, 'has_department_access', 'can_edit_department');
    if p.cmd = 'INSERT' then
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, c);
    else
      execute format('alter policy %I on %I.%I using (%s) with check (%s)',
        p.policyname, p.schemaname, p.tablename, coalesce(q, 'true'), coalesce(c, q, 'true'));
    end if;
  end loop;
end $$;

-- Tables added in future migrations get the same rules.
create or replace function public.mka_register_table(tbl text, dept text)
returns void language plpgsql as $$
begin
  execute format('alter table public.%I add column if not exists created_at timestamptz not null default now()', tbl);
  execute format('alter table public.%I add column if not exists created_by uuid references public.profiles(id) on delete set null default auth.uid()', tbl);
  execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', tbl);
  execute format('alter table public.%I add column if not exists updated_by uuid references public.profiles(id) on delete set null default auth.uid()', tbl);

  execute format('drop trigger if exists mka_stamp on public.%I', tbl);
  execute format('create trigger mka_stamp before insert or update on public.%I for each row execute function public.mka_stamp()', tbl);
  execute format('drop trigger if exists mka_audit on public.%I', tbl);
  execute format('create trigger mka_audit after insert or update or delete on public.%I for each row execute function public.mka_audit(%L)', tbl, dept);

  execute format('alter table public.%I enable row level security', tbl);
  execute format('drop policy if exists "mka read" on public.%I', tbl);
  execute format('create policy "mka read" on public.%I for select to authenticated using (public.has_department_access(%L))', tbl, dept);
  execute format('drop policy if exists "mka create" on public.%I', tbl);
  execute format('create policy "mka create" on public.%I for insert to authenticated with check (public.can_edit_department(%L))', tbl, dept);
  execute format('drop policy if exists "mka edit" on public.%I', tbl);
  execute format('create policy "mka edit" on public.%I for update to authenticated using (public.can_edit_department(%L)) with check (public.can_edit_department(%L))', tbl, dept, dept);
  execute format('drop policy if exists "mka remove" on public.%I', tbl);
  execute format('create policy "mka remove" on public.%I for delete to authenticated using (public.is_department_manager(%L))', tbl, dept);
end $$;

-- ---------------------------------------------------------------------
-- 2. Approved list
-- ---------------------------------------------------------------------

create table if not exists public.approved_users (
  email      text primary key check (email = lower(trim(email))),
  full_name  text,
  is_admin   boolean not null default false
);

create table if not exists public.approved_departments (
  email       text not null references public.approved_users(email) on delete cascade on update cascade,
  department  text not null references public.departments(slug) on delete cascade,
  role        text not null check (role in ('viewer', 'member', 'manager')),
  primary key (email, department)
);

alter table public.approved_users enable row level security;
alter table public.approved_departments enable row level security;

drop policy if exists "approved users admin" on public.approved_users;
create policy "approved users admin" on public.approved_users
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "approved departments admin" on public.approved_departments;
create policy "approved departments admin" on public.approved_departments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Gives one person the access on the approved list. Does nothing if they aren't on it.
create or replace function public.apply_approved_access(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  mail text;
  a public.approved_users;
begin
  select lower(email) into mail from public.profiles where id = uid;
  select * into a from public.approved_users where email = mail;
  if not found then return; end if;

  update public.profiles
  set full_name = coalesce(nullif(trim(a.full_name), ''), full_name),
      is_admin  = a.is_admin
  where id = uid;

  -- The list is the source of truth for listed people: departments are set to match it.
  delete from public.user_departments ud
  where ud.user_id = uid
    and not exists (select 1 from public.approved_departments ad where ad.email = mail and ad.department = ud.department);

  insert into public.user_departments (user_id, department, role)
  select uid, ad.department, ad.role
  from public.approved_departments ad
  where ad.email = mail
  on conflict (user_id, department) do update set role = excluded.role;
end $$;

revoke all on function public.apply_approved_access(uuid) from public, anon, authenticated;

-- New users: create the profile (name from the Google account), then apply the list.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    lower(new.email),
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  perform public.apply_approved_access(new.id);
  return new;
end $$;

-- Editing the list updates anyone on it who has already signed in.
create or replace function public.approved_list_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  mail text;
  uid uuid;
begin
  for mail in select distinct m from unnest(array[
    case when tg_op <> 'INSERT' then lower(old.email) end,
    case when tg_op <> 'DELETE' then lower(new.email) end
  ]) as m where m is not null
  loop
    for uid in select id from public.profiles where lower(email) = mail loop
      if exists (select 1 from public.approved_users where email = mail) then
        perform public.apply_approved_access(uid);
      else
        -- Taken off the list: remove what the list gave them.
        update public.profiles set is_admin = false where id = uid;
        delete from public.user_departments where user_id = uid;
      end if;
    end loop;
  end loop;
  return null;
end $$;

drop trigger if exists approved_users_changed on public.approved_users;
create trigger approved_users_changed
  after insert or update or delete on public.approved_users
  for each row execute function public.approved_list_changed();

drop trigger if exists approved_departments_changed on public.approved_departments;
create trigger approved_departments_changed
  after insert or update or delete on public.approved_departments
  for each row execute function public.approved_list_changed();

-- ---------------------------------------------------------------------
-- 3. Only Khuddam accounts
-- ---------------------------------------------------------------------
-- Google's "Internal" consent screen already blocks other accounts. This is a
-- second lock in the database. Existing accounts aren't affected.

create or replace function public.only_khuddam_accounts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if lower(coalesce(new.email, '')) like '%@khuddam.co.uk'
     or exists (select 1 from public.approved_users where email = lower(new.email)) then
    return new;
  end if;
  raise exception 'Only @khuddam.co.uk accounts can use the MKA Portal.';
end $$;

drop trigger if exists only_khuddam_accounts on auth.users;
create trigger only_khuddam_accounts
  before insert on auth.users
  for each row execute function public.only_khuddam_accounts();

-- Same for the Fleet helper: "members may add" now means members and admins, not viewers.
create or replace function public.mka_manager_only(tbl text, dept text, members_may_add boolean)
returns void language plpgsql as $$
begin
  execute format('drop policy if exists "mka create" on public.%I', tbl);
  if members_may_add then
    execute format('create policy "mka create" on public.%I for insert to authenticated with check (public.can_edit_department(%L))', tbl, dept);
  else
    execute format('create policy "mka create" on public.%I for insert to authenticated with check (public.is_department_manager(%L))', tbl, dept);
  end if;
  execute format('drop policy if exists "mka edit" on public.%I', tbl);
  execute format('create policy "mka edit" on public.%I for update to authenticated using (public.is_department_manager(%L)) with check (public.is_department_manager(%L))', tbl, dept, dept);
end $$;


-- #####################################################################
-- PART B: who gets what
-- #####################################################################

insert into public.approved_users (email, full_name, is_admin) values
  ('apps.operations@khuddam.co.uk',      'Hasoor Ahmed',   true),
  ('operations@khuddam.co.uk',           'Wajahat',        false),
  ('add.operations@khuddam.co.uk',       'Faiz Rasheed',   false),
  ('add1.operations@khuddam.co.uk',      'Shuaib Ahmed',   false),
  ('admin.operations@khuddam.co.uk',     'Danyal Arif',    false),
  ('delegations@khuddam.co.uk',          'Modassar Raja',  false),
  ('fleet@khuddam.co.uk',                'Bilal Rasheed',  false),
  ('jaidad@khuddam.co.uk',               'Waqas Ahmed',    false),
  ('stores@khuddam.co.uk',               'Nabeel Qamar',   false),
  ('specialarrangments@khuddam.co.uk',   'Fateh Rasheed',  false),
  ('sadr@khuddam.co.uk',                 null,             false),  -- name comes from their Google account
  ('mobushar.raja@khuddam.co.uk',        'Mobushar Raja',  false),
  ('ansar.bajwa@khuddam.co.uk',          'Ansar Bajwa',    false)
on conflict (email) do update
set full_name = coalesce(excluded.full_name, approved_users.full_name),
    is_admin  = excluded.is_admin;

insert into public.approved_departments (email, department, role)
select o.email, d.slug, 'viewer'
from (values
  ('operations@khuddam.co.uk'),
  ('add.operations@khuddam.co.uk'),
  ('add1.operations@khuddam.co.uk'),
  ('admin.operations@khuddam.co.uk'),
  ('sadr@khuddam.co.uk'),
  ('mobushar.raja@khuddam.co.uk')
) as o(email)
cross join public.departments d          -- every department, view only
union all
select * from (values
  ('delegations@khuddam.co.uk',        'delegations',          'manager'),
  ('fleet@khuddam.co.uk',              'fleet',                'manager'),
  ('jaidad@khuddam.co.uk',             'jaidat',               'manager'),
  ('stores@khuddam.co.uk',             'storage',              'manager'),
  ('specialarrangments@khuddam.co.uk', 'special-arrangements', 'manager'),
  -- View only in Jaidad, Fleet and Storage
  ('ansar.bajwa@khuddam.co.uk',        'jaidat',               'viewer'),
  ('ansar.bajwa@khuddam.co.uk',        'fleet',                'viewer'),
  ('ansar.bajwa@khuddam.co.uk',        'storage',              'viewer')
) as m(email, department, role)
on conflict (email, department) do update set role = excluded.role;

-- Check the result
select u.email, u.full_name, u.is_admin,
       string_agg(d.department || ' (' || d.role || ')', ', ' order by d.department) as access
from public.approved_users u
left join public.approved_departments d using (email)
group by u.email, u.full_name, u.is_admin
order by u.is_admin desc, u.email;
