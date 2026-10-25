-- =====================================================================
-- Give people access. Edit the emails and run in the SQL Editor.
-- Users must already exist (Authentication → Users → Add user).
-- =====================================================================

-- Set the name shown as "Salam [name]".
update public.profiles set full_name = 'Your Name' where email = 'you@example.com';

-- Make someone an admin: sees every department and can delete anything.
update public.profiles set is_admin = true where email = 'you@example.com';

-- Give a user one or more departments.
-- role: 'member' (view, add, edit) or 'manager' (also delete).
insert into public.user_departments (user_id, department, role)
select p.id, d.department, d.role
from public.profiles p
cross join (values
  ('fleet',   'manager'),
  ('storage', 'member')
) as d(department, role)
where p.email = 'someone@example.com'
on conflict (user_id, department) do update set role = excluded.role;

-- Remove a department from a user.
-- delete from public.user_departments
-- where department = 'storage'
--   and user_id = (select id from public.profiles where email = 'someone@example.com');
