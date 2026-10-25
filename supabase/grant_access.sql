-- =====================================================================
-- Give people access. Edit the emails and run in the SQL Editor.
-- Users must already exist (Authentication → Users → Add user).
--
-- Access levels
--   Administrator     profiles.is_admin = true. Sees and manages every department.
--   Department admin  role 'manager'. Add, edit and remove records in their department(s).
--   Member            role 'member'.  View, add and edit records, but can't remove.
--
-- What people see
--   One department   → they land straight on it. No overview, nothing to switch between.
--   Two or more      → overview of just those departments, and they can switch between them.
--   Administrator    → everything.
-- =====================================================================

-- Set the name shown as "Salam [name]".
update public.profiles set full_name = 'Your Name' where email = 'you@example.com';

-- Make someone an administrator (sees everything).
update public.profiles set is_admin = true where email = 'you@example.com';


-- Example 1: a Fleet department admin. Sees only Fleet.
insert into public.user_departments (user_id, department, role)
select p.id, 'fleet', 'manager'
from public.profiles p
where p.email = 'fleet.lead@example.com'
on conflict (user_id, department) do update set role = excluded.role;


-- Example 2: someone working in Storage. Sees only Storage, can't remove records.
insert into public.user_departments (user_id, department, role)
select p.id, 'storage', 'member'
from public.profiles p
where p.email = 'storage.team@example.com'
on conflict (user_id, department) do update set role = excluded.role;


-- Example 3: a director overseeing three departments. Can switch between them.
insert into public.user_departments (user_id, department, role)
select p.id, d.department, d.role
from public.profiles p
cross join (values
  ('delegations',          'manager'),
  ('fleet',                'manager'),
  ('special-arrangements', 'manager')
) as d(department, role)
where p.email = 'director@example.com'
on conflict (user_id, department) do update set role = excluded.role;

-- Department slugs: delegations, fleet, jaidat, special-arrangements, storage


-- Remove a department from someone.
-- delete from public.user_departments
-- where department = 'storage'
--   and user_id = (select id from public.profiles where email = 'someone@example.com');

-- Take away administrator.
-- update public.profiles set is_admin = false where email = 'someone@example.com';

-- See who has what.
-- select p.full_name, p.email, p.is_admin, ud.department, ud.role
-- from public.profiles p
-- left join public.user_departments ud on ud.user_id = p.id
-- order by p.full_name, ud.department;
