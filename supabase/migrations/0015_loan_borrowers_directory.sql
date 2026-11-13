-- =====================================================================
-- 0015: Equipment Loans for the National Amila and Regional Qaideen
--
-- Everyone in the MKA UK National Amila & Regional Qaideen directory
-- 2026/27 (18 Oct 2026) can request equipment on Equipment Loans.
--
-- This only ADDS Equipment Loans. Anyone who already has access keeps it:
--   * people already on the approved list keep their departments and roles
--   * people given access some other way have it copied onto the approved
--     list first, so nothing is taken away (administrators stay administrators)
--
-- They appear on the Storage page's Borrowers tab, where the Storage
-- department admin can remove anyone later. Wajahat Karim (Delegations +
-- Jaidad, TBC in the directory) is included through operations@. Other
-- positions without an email aren't included: add them on the Borrowers
-- tab once they have one.
--
-- Run after 0014_storage_loans.sql. Safe to run again.
-- =====================================================================

-- Quietly: these additions don't each need a line in the activity log.
select set_config('mka.skip_audit', 'on', false);
drop table if exists loan_directory, loan_keep, loan_new;
create temporary table loan_directory (email text primary key, full_name text, department text);

insert into loan_directory (email, full_name, department) values
  ('sadr@khuddam.co.uk',                'Farhad Ahmad',         'Sadr Majlis'),
  ('mobushar.raja@khuddam.co.uk',       'Mobushar Raja',        'Naib Sadr'),
  ('ansar.bajwa@khuddam.co.uk',         'Ansar Bajwa',          'Naib Sadr'),
  ('usman.butt@khuddam.co.uk',          'Usman Shahzad Butt',   'Naib Sadr'),
  ('zeeshan.bashir@khuddam.co.uk',      'Zeeshan Bashir',       'Naib Sadr'),
  ('motamid@khuddam.co.uk',             'Zartashat Latif',      'Motamid'),
  ('amoomi@khuddam.co.uk',              'Khalique Ahmed',       'Amoomi'),
  ('add.amoomi@khuddam.co.uk',          'Surfaraz Mustafa',     'Amoomi'),
  ('aet@khuddam.co.uk',                 'Mudassar Ahmad',       'Amoor-e-Tuluba'),
  ('atfal@khuddam.co.uk',               'Muhammad Akbar Butt',  'Atfal'),
  ('ishaat@khuddam.co.uk',              'Waleed Dawood',        'Isha''at'),
  ('kek@khuddam.co.uk',                 'Nadeem Ahmad',         'Khidmat-e-Khalq'),
  ('maal@khuddam.co.uk',                'Tauseef Ahmad',        'Maal'),
  ('add.maal@khuddam.co.uk',            'Ejaz Sheikh',          'Maal'),
  ('mohasib@khuddam.co.uk',             'Atiq Ahmad Yousaf',    'Mohasib'),
  ('sot@khuddam.co.uk',                 'Shahzad Bashir',       'Sanat-o-Tijarat'),
  ('sej@khuddam.co.uk',                 'Sameer Ahmad',         'Sehat-e-Jismani'),
  ('talim@khuddam.co.uk',               'Nauman Hadi',          'Ta''lim'),
  ('tabligh@khuddam.co.uk',             'Sajid Zahid',          'Tabligh'),
  ('tej@khuddam.co.uk',                 null,                   'Tahrik-e-Jadid'),      -- name TBC: taken from their Google account
  ('tajneed@khuddam.co.uk',             'Shahmeer Baloch',      'Tajneed'),
  ('tarbiyyat@khuddam.co.uk',           'Umair Bashir',         'Tarbiyyat'),
  ('newahmadis@khuddam.co.uk',          'Dr Shahzaib Ahmad',    'Tarbiyyat - New Ahmadis'),
  ('wea@khuddam.co.uk',                 'Talha Niazi',          'Waqar-e-Amal'),
  ('muqami@khuddam.co.uk',              'Haroon Ahmad Khan',    'Muqami'),
  ('rishtanata@khuddam.co.uk',          'Rawahuddin Arif Khan', 'Rishta Nata'),
  ('masq@khuddam.co.uk',                'Mansoor Ahmed Dahri',  'MASQ'),
  ('press@khuddam.co.uk',               'Ehtesham Ahmad Arif',  'Press and Media'),
  ('ijtema@khuddam.co.uk',              'Sammar Malik',         'Ijtema'),
  ('send@khuddam.co.uk',                'Muhammad Ali Ahmad',   'SEND & Safeguarding'),
  ('waqfenau@khuddam.co.uk',            'Luqman Ahmed',         'Waqf-e-Nau'),
  ('ziafat@khuddam.co.uk',              null,                   'Ziafat'),              -- name TBC
  ('tarbiyyat.youth@khuddam.co.uk',     'Danish Nasir',         'Tarbiyyat 15-18 years'),
  ('operations@khuddam.co.uk',          'Wajahat Karim',        'Delegations + Jaidad'),  -- TBC in the directory: uses his operations account
  ('rq.baitulehsan@khuddam.co.uk',      'Abdul Fater Chaudhry', 'Baitul Ehsan Region'),
  ('rq.baitulfutuh@khuddam.co.uk',      'Fahad Mahmood',        'Baitul Futuh Region'),
  ('rq.baitunnoor@khuddam.co.uk',       'Khalid Ahmad',         'Baitun Noor Region'),
  ('rq.baitussubhan@khuddam.co.uk',     'Shahzaib Tayab',       'Baitus Subhan Region'),
  ('rq.bashir@khuddam.co.uk',           'Kaleem Ahmed',         'Bashir Region'),
  ('rq.east@khuddam.co.uk',             'Sheikh Sammar Ahmad',  'East Region'),
  ('rq.eastmidlands@khuddam.co.uk',     'Jamal Chughtai',       'East Midlands Region'),
  ('rq.fazlmosque@khuddam.co.uk',       'Qasim Mahmood',        'Fazl Mosque Region'),
  ('rq.hertfordshire@khuddam.co.uk',    'Zafar Ahmad',          'Hertfordshire Region'),
  ('rq.masroor@khuddam.co.uk',          'Shafeef Faizi',        'Masroor Region'),
  ('rq.middlesex@khuddam.co.uk',        'Adeel Minhas',         'Middlesex Region'),
  ('rq.northeast@khuddam.co.uk',        'Adnan Aamer Virk',     'North East Region'),
  ('rq.northwest@khuddam.co.uk',        'Balal Tahir',          'North West Region'),
  ('rq.scotland@khuddam.co.uk',         'Sajeel Ahmad Sajjad',  'Scotland Region'),
  ('rq.south@khuddam.co.uk',            'Shafkat Mahmood',      'South Region'),
  ('rq.southwest@khuddam.co.uk',        'Rohail Sadat',         'South West Region'),
  ('rq.tahir@khuddam.co.uk',            'Kamil Ahmed Zahid',    'Tahir Region'),
  ('rq.westmidlands@khuddam.co.uk',     'Faiz Chughtai',        'West Midlands Region'),
  ('rq.yorkshire@khuddam.co.uk',        'Arfan Ijaz',           'Yorkshire Region');

-- People not yet on the approved list: remember the access they have now, so
-- putting them on the list doesn't take it away.
create temporary table loan_keep as
select lower(p.email) as email, ud.department, ud.role, p.is_admin
from loan_directory d
join public.profiles p on lower(p.email) = d.email
left join public.user_departments ud on ud.user_id = p.id
where not exists (select 1 from public.approved_users a where a.email = d.email);

create temporary table loan_new as
select d.email from loan_directory d
where not exists (select 1 from public.approved_users a where a.email = d.email);

-- On the approved list (existing entries keep their name and administrator setting).
insert into public.approved_users (email, full_name, is_admin)
select d.email, d.full_name, coalesce((select bool_or(k.is_admin) from loan_keep k where k.email = d.email), false)
from loan_directory d
on conflict (email) do update
set full_name = coalesce(approved_users.full_name, excluded.full_name);

-- Their existing departments, exactly as they were.
insert into public.approved_departments (email, department, role)
select email, department, role from loan_keep where department is not null
on conflict (email, department) do nothing;

-- Plus Equipment Loans. (Anyone already given it keeps their current role.)
insert into public.approved_departments (email, department, role)
select email, 'equipment-loans', 'member' from loan_directory
on conflict (email, department) do nothing;

-- Shown on the Storage page's Borrowers tab.
insert into public.storage_borrowers (email, full_name, department, created_user)
select d.email, d.full_name, d.department, exists (select 1 from loan_new n where n.email = d.email)
from loan_directory d
on conflict (email) do update
set full_name = coalesce(storage_borrowers.full_name, excluded.full_name),
    department = coalesce(storage_borrowers.department, excluded.department);

select set_config('mka.skip_audit', 'off', false);

-- Check the result: everyone added and what they can open.
select u.email, u.full_name, u.is_admin,
       string_agg(ad.department || ' (' || ad.role || ')', ', ' order by ad.department) as access
from loan_directory d
join public.approved_users u using (email)
left join public.approved_departments ad on ad.email = u.email
group by u.email, u.full_name, u.is_admin
order by u.email;
