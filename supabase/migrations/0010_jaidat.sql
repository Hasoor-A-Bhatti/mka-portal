-- =====================================================================
-- 0010: MKA Jaidat (property and estate management)
--
-- Everything the Jaidad team needs to run the MKA properties:
--   * Properties     reference, use, ownership, address, lease, rooms
--   * Records        the document-gathering checklist for each property
--                    (ownership, leases, plans, compliance, insurance, costs)
--   * Compliance     a register of safety checks and legal duties per property,
--                    each with an applicability decision, dates and evidence
--   * Insurance      policies per property with renewal dates
--   * Tickets        maintenance issues (INC-0001…), P1–P4 with target dates,
--                    work notes and quotes
--   * Inspections    walk-rounds and inspections; flagged items become tickets
--   * Finance        costs and invoices: proposed, approved, paid
--   * Contractors    approved suppliers and tradespeople
--   * Contacts       the team and the people in other departments who help
--   * Documents      uploaded files and Google Drive links, with expiry dates
--   * Awaiting       requests sent to other departments, waiting for a reply
--   * Public reports anyone can report an issue at /report, without signing in
--
-- Who can do what
--   View only            sees everything, changes nothing
--   Member               adds and edits
--   Department admin     also removes, and is the only one who can approve or
--                        reject costs, mark them paid, approve contractors and
--                        accept quotes
--
-- Run after 0001–0009 and supabase/approved_access.sql. Safe to run again.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Quiet set-up: lets the database add starter rows without filling
--    the activity log. Nothing else changes in how changes are logged.
-- ---------------------------------------------------------------------

create or replace function public.mka_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('mka.skip_audit', true), '') = 'on' then
    return null;
  end if;
  insert into public.audit_log (department, table_name, record_id, action, changed_by, old_data, new_data)
  values (
    tg_argv[0],
    tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    lower(tg_op),
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;


-- ---------------------------------------------------------------------
-- 1. Properties
-- ---------------------------------------------------------------------

alter table public.jaidat_properties
  add column if not exists reference        text,
  add column if not exists short_name       text,
  add column if not exists use_description  text,
  add column if not exists location         text,
  add column if not exists ownership        text,
  add column if not exists address_verified boolean not null default false,
  add column if not exists initial_scope    boolean not null default false,
  add column if not exists caretaker_phone  text,
  add column if not exists rooms            text[] not null default '{}',
  add column if not exists lease_party      text,
  add column if not exists lease_start      date,
  add column if not exists lease_end        date,
  add column if not exists rent_monthly     numeric(10, 2),
  add column if not exists considerations   text;

alter table public.jaidat_properties drop constraint if exists jaidat_properties_rooms_size;
alter table public.jaidat_properties
  add constraint jaidat_properties_rooms_size check (cardinality(rooms) <= 80);
alter table public.jaidat_properties drop constraint if exists jaidat_properties_rent_check;
alter table public.jaidat_properties
  add constraint jaidat_properties_rent_check check (rent_monthly is null or rent_monthly >= 0);

-- References: JP-001, JP-002, …
create sequence if not exists public.jaidat_property_ref_seq;

-- The current properties. Rows already added by hand (same name) are kept and
-- given the missing details; anything missing is added.
do $seed$
begin
perform set_config('mka.skip_audit', 'on', true);
create temp table if not exists _jaidat_seed (
  reference text, name text, short_name text, use_description text, property_type text,
  ownership text, address text, location text, initial_scope boolean, considerations text
);
truncate _jaidat_seed;
insert into _jaidat_seed values
  ('JP-001', 'Aiwan-e-Mahmood', 'AeM', 'Khuddam office', 'Office', null,
   'Unit 2, Bourne Mill Business Park, Guildford Road, Farnham, Surrey, GU9 9PS', 'Farnham', true,
   'Workplace health and safety, fire safety, electrical safety, asbestos management where applicable, building maintenance, accessibility and anything else that applies to how the building is used.'),
  ('JP-002', 'Sarai Masroor', 'SeM', 'Guest house', 'Guest house', null,
   'Thursley Road, Elstead, Godalming, Surrey, GU8 6DH', 'Elstead', true,
   'Guest accommodation: fire risk and precautions, gas and electrical safety, water hygiene, cleaning, inspections, planning or licensing where applicable, and guest safety.'),
  ('JP-003', 'Sarai Khidmat', 'Sarai Khidmat', 'MKA-owned, currently rented out', 'MKA-owned, rented out', 'MKA UK',
   '31 Gressenhall Road, Southfields, London, SW18 5QH', 'Fazal Mosque, Southfields', true,
   'Landlord duties: repairs, gas and electrical safety, EPC and energy efficiency, alarms, deposit protection, licensing and current tenancy law.'),
  ('JP-004', 'Wrecclesham Residence', 'Wrecclesham', 'Privately rented home', 'Privately rented', null,
   '17 Beldham Road, Farnham, GU9 8TW', 'Wrecclesham, near Farnham', false,
   'Privately rented: check the landlord''s gas, electrical, EPC and alarm records, the tenancy terms and deposit protection.'),
  ('JP-005', 'Aldershot Residence', 'Aldershot', 'Privately rented home', 'Privately rented', null,
   '425 Stockbridge Drive, Aldershot, GU11 3RT', 'Aldershot', false,
   'Privately rented: check the landlord''s gas, electrical, EPC and alarm records, the tenancy terms and deposit protection.');

update public.jaidat_properties p
set reference       = coalesce(p.reference, s.reference),
    short_name      = coalesce(p.short_name, s.short_name),
    use_description = coalesce(p.use_description, s.use_description),
    location        = coalesce(p.location, s.location),
    ownership       = coalesce(p.ownership, s.ownership),
    address         = coalesce(p.address, s.address),
    considerations  = coalesce(p.considerations, s.considerations),
    initial_scope   = p.initial_scope or s.initial_scope
from _jaidat_seed s
where lower(trim(p.name)) = lower(s.name)
  and (p.reference is null or p.reference = s.reference);

insert into public.jaidat_properties
  (reference, name, short_name, use_description, property_type, ownership, address, location, initial_scope, considerations, status)
select s.reference, s.name, s.short_name, s.use_description, s.property_type, s.ownership, s.address, s.location, s.initial_scope, s.considerations, 'Active'
from _jaidat_seed s
where not exists (
  select 1 from public.jaidat_properties p
  where lower(trim(p.name)) = lower(s.name) or p.reference = s.reference
);
drop table _jaidat_seed;
perform set_config('mka.skip_audit', 'off', true);
end $seed$;

-- Any other property gets the next free reference.
do $$
declare
  n integer;
begin
  select coalesce(max(substring(reference from '^JP-(\d+)$')::integer), 0) into n from public.jaidat_properties;
  perform setval('public.jaidat_property_ref_seq', greatest(n, 1), n > 0);
end $$;
update public.jaidat_properties
set reference = 'JP-' || lpad(nextval('public.jaidat_property_ref_seq')::text, 3, '0')
where reference is null;
alter table public.jaidat_properties
  alter column reference set default ('JP-' || lpad(nextval('public.jaidat_property_ref_seq')::text, 3, '0'));
alter table public.jaidat_properties alter column reference set not null;
create unique index if not exists jaidat_properties_reference_key on public.jaidat_properties (reference);


-- ---------------------------------------------------------------------
-- 2. Starter lists: the records checklist and the compliance register
--    New properties get both automatically.
-- ---------------------------------------------------------------------

create table if not exists public.jaidat_record_template (
  workstream    text not null check (workstream in ('records', 'compliance', 'insurance', 'maintenance', 'finance')),
  position      integer not null,
  title         text not null,
  owner_name    text,
  support_name  text,
  primary key (workstream, position)
);

insert into public.jaidat_record_template (workstream, position, title, owner_name, support_name) values
  ('records',     1, 'Ownership records and title information',               'Waqas Ahmad',             'Touseef (Maal)'),
  ('records',     2, 'Full property address',                                 'Waqas Ahmad',             null),
  ('records',     3, 'Lease agreements and other agreements',                 'Waqas Ahmad',             'Touseef (Maal)'),
  ('records',     4, 'Floor plans and blueprints',                            'Waqas Ahmad',             'Shahab Sheikh'),
  ('records',     5, 'Planning permissions and building information',         'Waqas Ahmad',             'Shahab Sheikh'),
  ('records',     6, 'Occupiers and occupancy details',                       'Waqas Ahmad',             null),
  ('records',     7, 'Main property contacts',                                'Waqas Ahmad',             null),
  ('compliance',  1, 'Safety certificates',                                   'Anser Ahmad',             null),
  ('compliance',  2, 'Inspection records',                                    'Anser Ahmad',             null),
  ('compliance',  3, 'Statutory obligations',                                 'Anser Ahmad',             null),
  ('compliance',  4, 'Risk assessments',                                      'Anser Ahmad',             null),
  ('compliance',  5, 'Remedial actions and evidence of completion',           'Anser Ahmad',             null),
  ('insurance',   1, 'Building insurance',                                    'Noman Ahmad',             'Touseef (Maal)'),
  ('insurance',   2, 'Public liability insurance',                            'Noman Ahmad',             'Touseef (Maal)'),
  ('insurance',   3, 'Landlord insurance, where it applies',                  'Noman Ahmad',             'Touseef (Maal)'),
  ('insurance',   4, 'Policy documents and schedules',                        'Noman Ahmad',             null),
  ('insurance',   5, 'Insurer and policy details',                            'Noman Ahmad',             null),
  ('insurance',   6, 'Cover limits, exclusions and renewal dates',            'Noman Ahmad',             null),
  ('maintenance', 1, 'Current repairs and defects',                           'Waqas Ahmad',             null),
  ('maintenance', 2, 'Outstanding maintenance requests',                      'Dr Muhammad Yahya Ahmad', null),
  ('maintenance', 3, 'Inspection findings',                                   'Anser Ahmad',             null),
  ('maintenance', 4, 'Contractor and supplier details',                       'Dr Muhammad Yahya Ahmad', null),
  ('maintenance', 5, 'Quotations and work orders',                            'Anser Ahmad',             null),
  ('maintenance', 6, 'Planned and preventative works',                        'Anser Ahmad',             null),
  ('finance',     1, 'Budgets',                                               'Dr Muhammad Yahya Ahmad', 'Abdul Jalil'),
  ('finance',     2, 'Expenditure',                                           'Dr Muhammad Yahya Ahmad', 'Abdul Jalil'),
  ('finance',     3, 'Service charges',                                       'Noman Ahmad',             null),
  ('finance',     4, 'Council tax',                                           'Dr Muhammad Yahya Ahmad', 'Touseef (Maal)'),
  ('finance',     5, 'Utility bills',                                         'Dr Muhammad Yahya Ahmad', 'Abdul Jalil'),
  ('finance',     6, 'Insurance premiums and other property costs',           'Dr Muhammad Yahya Ahmad', 'Abdul Jalil'),
  ('finance',     7, 'Invoices and payment records',                          'Noman Ahmad',             null)
on conflict (workstream, position) do update
set title = excluded.title, owner_name = excluded.owner_name, support_name = excluded.support_name;

-- Safety checks and legal duties. Nothing is assumed to apply: each starts as
-- "To be confirmed" until someone decides. General guidance only; check gov.uk
-- or hse.gov.uk before relying on it.
create table if not exists public.jaidat_compliance_catalogue (
  key              text primary key,
  title            text not null,
  legislation      text not null,
  guidance         text,
  interval_months  integer check (interval_months between 1 and 240),
  position         integer not null default 0
);

insert into public.jaidat_compliance_catalogue (key, title, legislation, guidance, interval_months, position) values
  ('gas_safety', 'Gas safety check (CP12)', 'Gas Safety (Installation and Use) Regulations 1998',
   'Any building with gas appliances, flues or pipework. Checked by a Gas Safe registered engineer at least every 12 months; tenants get a copy within 28 days.', 12, 1),
  ('eicr', 'Electrical installation condition report (EICR)', 'Electrical Safety Standards in the Private Rented Sector (England) Regulations 2020',
   'Rented homes: by a qualified electrician at least every 5 years. Offices and guest houses: good practice every 5 years.', 60, 2),
  ('pat', 'Portable appliance testing (PAT)', 'Electricity at Work Regulations 1989',
   'Offices, guest houses and any appliances MKA supplies. Frequency depends on use; yearly is common.', 12, 3),
  ('fire_risk', 'Fire risk assessment', 'Regulatory Reform (Fire Safety) Order 2005; Fire Safety (England) Regulations 2022',
   'Any non-domestic building and the shared parts of residential buildings. Keep it under review, at least yearly, and act on its actions.', 12, 4),
  ('fire_alarm', 'Fire alarm service', 'Regulatory Reform (Fire Safety) Order 2005 (BS 5839-1)',
   'Where a fire alarm system is fitted: serviced by a competent person every 6 months, tested weekly.', 6, 5),
  ('emergency_lighting', 'Emergency lighting test', 'Regulatory Reform (Fire Safety) Order 2005 (BS 5266-1)',
   'Where emergency lighting is fitted: full-duration test every year, monthly flick tests.', 12, 6),
  ('extinguishers', 'Fire extinguisher service', 'Regulatory Reform (Fire Safety) Order 2005 (BS 5306-3)',
   'Where extinguishers are provided: serviced every year by a competent person.', 12, 7),
  ('alarms', 'Smoke and carbon monoxide alarms', 'Smoke and Carbon Monoxide Alarm (England) Regulations 2015, as amended 2022',
   'Rented homes: a smoke alarm on every storey, and a CO alarm in any room with a fixed combustion appliance. Test at the start of each tenancy.', 12, 8),
  ('epc', 'Energy performance certificate (EPC)', 'Energy Efficiency (Private Rented Property) (England and Wales) Regulations 2015',
   'Valid for 10 years. Let property needs a rating of E or above under the current minimum standard.', 120, 9),
  ('legionella', 'Legionella risk assessment', 'Health and Safety at Work etc. Act 1974; COSHH 2002; HSE ACoP L8',
   'Water systems, especially showers and stored hot water in shared buildings. Review every 2 years or after changes.', 24, 10),
  ('asbestos', 'Asbestos survey and management plan', 'Control of Asbestos Regulations 2012',
   'Non-domestic buildings built before 2000. Keep the survey, and review the management plan every year.', 12, 11),
  ('health_safety', 'Health and safety risk assessment', 'Health and Safety at Work etc. Act 1974; Management of Health and Safety at Work Regulations 1999',
   'Workplaces and buildings used by volunteers or guests. Review every year.', 12, 12),
  ('fitness', 'Fit for human habitation (HHSRS) check', 'Homes (Fitness for Human Habitation) Act 2018; Housing Act 2004',
   'Rented homes must be free of serious hazards such as damp, mould and cold.', 12, 13),
  ('tenancy', 'Tenancy terms and notices', 'Landlord and Tenant Act 1985; Renters'' Rights Act 2025',
   'Where MKA lets or rents a home: written terms, repair duties and current tenancy law.', null, 14),
  ('deposit', 'Tenancy deposit protection', 'Housing Act 2004',
   'Where MKA takes a deposit: protected within 30 days and the prescribed information given.', null, 15),
  ('licensing', 'Property licence (HMO or selective)', 'Housing Act 2004',
   'Check with the local council whether the property needs a licence.', 60, 16),
  ('furniture', 'Furniture fire safety labels', 'Furniture and Furnishings (Fire Safety) Regulations 1988',
   'Furnished lettings and guest accommodation: upholstered furniture must carry the fire safety label.', null, 17),
  ('planning', 'Planning permission and use', 'Town and Country Planning Act 1990; Building Regulations 2010',
   'Planning permission and building control approval for the way the building is used and any works.', null, 18),
  ('accessibility', 'Accessibility review', 'Equality Act 2010',
   'Buildings used by the public, guests or volunteers: reasonable adjustments for disabled people.', 36, 19)
on conflict (key) do update
set title = excluded.title, legislation = excluded.legislation, guidance = excluded.guidance,
    interval_months = excluded.interval_months, position = excluded.position;

alter table public.jaidat_record_template enable row level security;
alter table public.jaidat_compliance_catalogue enable row level security;
drop policy if exists "jaidat template read" on public.jaidat_record_template;
create policy "jaidat template read" on public.jaidat_record_template
  for select to authenticated using (public.has_department_access('jaidat'));
drop policy if exists "jaidat catalogue read" on public.jaidat_compliance_catalogue;
create policy "jaidat catalogue read" on public.jaidat_compliance_catalogue
  for select to authenticated using (public.has_department_access('jaidat'));


-- ---------------------------------------------------------------------
-- 3. Records checklist (document gathering)
-- ---------------------------------------------------------------------

create table if not exists public.jaidat_records (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.jaidat_properties(id) on delete cascade,
  workstream    text not null check (workstream in ('records', 'compliance', 'insurance', 'maintenance', 'finance')),
  position      integer not null default 0,
  title         text not null check (length(title) <= 200),
  owner_name    text check (length(owner_name) <= 120),
  support_name  text check (length(support_name) <= 120),
  status        text not null default 'Not started'
                check (status in ('Not started', 'Requested', 'Received', 'Under review', 'Verified', 'Outstanding')),
  requested_on  date,
  received_on   date,
  follow_up_on  date,
  notes         text check (length(notes) <= 5000),
  unique (property_id, workstream, title)
);
select public.mka_register_table('jaidat_records', 'jaidat');
create index if not exists jaidat_records_property_idx on public.jaidat_records (property_id, workstream, position);

-- Requested and received dates fill themselves in.
create or replace function public.jaidat_record_dates()
returns trigger language plpgsql set search_path = public as $$
declare
  today date := (now() at time zone 'Europe/London')::date;
begin
  if new.status in ('Requested', 'Received', 'Under review', 'Verified') and new.requested_on is null then
    new.requested_on := today;
  end if;
  if new.status in ('Received', 'Under review', 'Verified') and new.received_on is null then
    new.received_on := today;
  end if;
  return new;
end $$;
drop trigger if exists jaidat_record_dates on public.jaidat_records;
create trigger jaidat_record_dates before insert or update of status on public.jaidat_records
  for each row execute function public.jaidat_record_dates();


-- ---------------------------------------------------------------------
-- 4. Compliance register
-- ---------------------------------------------------------------------

create table if not exists public.jaidat_compliance (
  id               uuid primary key default gen_random_uuid(),
  property_id      uuid not null references public.jaidat_properties(id) on delete cascade,
  item_key         text not null check (length(item_key) <= 80),
  title            text not null check (length(title) <= 200),
  legislation      text check (length(legislation) <= 300),
  interval_months  integer check (interval_months between 1 and 240),
  position         integer not null default 100,
  applicability    text not null default 'To be confirmed'
                   check (applicability in ('To be confirmed', 'Applicable', 'Not applicable')),
  reason           text check (length(reason) <= 1000),
  last_done        date,
  next_due         date,
  officer          text check (length(officer) <= 120),
  contractor       text check (length(contractor) <= 200),
  evidence_ref     text check (length(evidence_ref) <= 200),
  status           text not null default 'Awaiting information'
                   check (status in ('Awaiting information', 'Requested', 'Received', 'Under review', 'Verified', 'Outstanding')),
  notes            text check (length(notes) <= 5000),
  unique (property_id, item_key)
);
select public.mka_register_table('jaidat_compliance', 'jaidat');


-- ---------------------------------------------------------------------
-- 5. Insurance
-- ---------------------------------------------------------------------

create table if not exists public.jaidat_insurance (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references public.jaidat_properties(id) on delete cascade,
  cover_type      text not null check (cover_type in ('Buildings', 'Public liability', 'Employers liability', 'Landlord', 'Contents', 'Other')),
  insurer         text check (length(insurer) <= 200),
  policy_number   text check (length(policy_number) <= 100),
  policyholder    text check (length(policyholder) <= 200),
  cover_amount    text check (length(cover_amount) <= 200),
  exclusions      text check (length(exclusions) <= 2000),
  starts_on       date,
  expires_on      date,
  premium         numeric(10, 2) check (premium >= 0),
  contact         text check (length(contact) <= 200),
  status          text not null default 'Awaiting information'
                  check (status in ('Awaiting information', 'Requested', 'Received', 'Under review', 'Verified', 'Outstanding')),
  notes           text check (length(notes) <= 5000),
  constraint jaidat_insurance_dates check (expires_on is null or starts_on is null or expires_on >= starts_on)
);
select public.mka_register_table('jaidat_insurance', 'jaidat');
create index if not exists jaidat_insurance_property_idx on public.jaidat_insurance (property_id, expires_on);


-- ---------------------------------------------------------------------
-- 6. Contractors and contacts
-- ---------------------------------------------------------------------

create table if not exists public.jaidat_contractors (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(name) <= 200),
  company           text check (length(company) <= 200),
  trade             text not null default 'Other'
                    check (trade in ('Plumber', 'Electrician', 'Gas engineer', 'Builder', 'Roofer', 'Carpenter', 'Decorator',
                                     'Locksmith', 'Window and glazing', 'Pest control', 'Cleaning', 'Gardener', 'Fire safety',
                                     'Surveyor', 'Handyman', 'Other')),
  phone             text check (length(phone) <= 40),
  email             text check (length(email) <= 200),
  areas             text check (length(areas) <= 300),
  insurance_expiry  date,
  certifications    text check (length(certifications) <= 1000),
  approved          boolean not null default false,
  approved_by       text,
  approved_on       date,
  rating            integer check (rating between 1 and 5),
  status            text not null default 'Not verified' check (status in ('Not verified', 'Verified', 'Suspended')),
  notes             text check (length(notes) <= 5000)
);
select public.mka_register_table('jaidat_contractors', 'jaidat');

create table if not exists public.jaidat_contacts (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null check (length(full_name) <= 120),
  role        text check (length(role) <= 200),
  department  text check (length(department) <= 120),
  in_team     boolean not null default false,
  phone       text check (length(phone) <= 40),
  email       text check (length(email) <= 200),
  responsibilities text check (length(responsibilities) <= 2000),
  position    integer not null default 100
);
select public.mka_register_table('jaidat_contacts', 'jaidat');

-- Starter contacts: the Jaidad team, and the people in other departments who help.
do $seed$
begin
perform set_config('mka.skip_audit', 'on', true);
insert into public.jaidat_contacts (full_name, role, department, in_team, email, responsibilities, position)
select v.full_name, v.role, v.department, v.in_team, v.email, v.responsibilities, v.position
from (values
  ('Waqas Ahmad', 'Jaidad Secretary', 'Jaidad', true, 'jaidad@khuddam.co.uk',
   'Property records (ownership, addresses, leases, occupiers, contacts, plans, planning) and current repairs. Leads and signs off each property.', 1),
  ('Dr Muhammad Yahya Ahmad', 'Admin', 'Jaidad', true, null,
   'Tracks and chases maintenance requests, contractors, budgets, expenditure, council tax, utility bills and insurance premiums. Keeps the records up to date.', 2),
  ('Anser Ahmad', 'Compliance and maintenance', 'Jaidad', true, null,
   'Safety certificates, inspection records, statutory obligations, risk assessments, remedial actions, quotations, work orders and planned works.', 3),
  ('Noman Ahmad', 'Insurance and financial control', 'Jaidad', true, null,
   'Insurance policies, insurers, cover and renewal dates, service charges, invoices and payment records.', 4),
  ('Hasoor Bhatti', 'App development', 'Operations', false, null,
   'Builds and looks after the MKA Portal.', 5),
  ('Touseef (Maal)', 'Mohtamim Maal', 'Maal', false, 'maal@khuddam.co.uk',
   'Ownership, lease, insurance and council documents for Jaidad.', 6),
  ('Shahab Sheikh', 'Naib Waqar-e-Amal', 'Waqar-e-Amal', false, null,
   'Blueprints, plans and planning information for Jaidad.', 7),
  ('Abdul Jalil', 'Muavin Sadr, Markaz Events', 'Markaz Events', false, null,
   'Budgets, expenditure and bills for Jaidad.', 8)
) as v(full_name, role, department, in_team, email, responsibilities, position)
where not exists (select 1 from public.jaidat_contacts c where lower(c.full_name) = lower(v.full_name));
perform set_config('mka.skip_audit', 'off', true);
end $seed$;


-- ---------------------------------------------------------------------
-- 7. Maintenance tickets, work notes and quotes
-- ---------------------------------------------------------------------

create sequence if not exists public.jaidat_issue_seq;

create table if not exists public.jaidat_issues (
  id                uuid primary key default gen_random_uuid(),
  ref               text not null unique default ('INC-' || lpad(nextval('public.jaidat_issue_seq')::text, 4, '0')),
  property_id       uuid references public.jaidat_properties(id) on delete set null,
  location          text check (length(location) <= 200),
  title             text not null check (length(title) <= 200),
  description       text check (length(description) <= 5000),
  category          text not null default 'Repair'
                    check (category in ('Repair', 'Defect', 'Safety', 'Damp or mould', 'Security or access', 'Pests',
                                        'Cleaning', 'Grounds', 'Inspection finding', 'Other')),
  priority          text not null default 'P3' check (priority in ('P1', 'P2', 'P3', 'P4')),
  status            text not null default 'New'
                    check (status in ('New', 'Assigned', 'Awaiting quote', 'Awaiting approval', 'In progress', 'On hold',
                                      'Completed', 'Closed', 'Cancelled')),
  officer           text check (length(officer) <= 120),
  contractor_id     uuid references public.jaidat_contractors(id) on delete set null,
  reported_by       text check (length(reported_by) <= 120),
  reporter_contact  text check (length(reporter_contact) <= 160),
  source            text not null default 'team' check (source in ('team', 'public', 'inspection')),
  target_date       date,
  cost              numeric(10, 2) check (cost >= 0),
  completed_on      date,
  lesson            text check (length(lesson) <= 2000)
);
select public.mka_register_table('jaidat_issues', 'jaidat');
grant usage, select on sequence public.jaidat_issue_seq, public.jaidat_property_ref_seq to authenticated;
create index if not exists jaidat_issues_property_idx on public.jaidat_issues (property_id, status);
create index if not exists jaidat_issues_created_idx on public.jaidat_issues (created_at desc);

-- Target date from the priority: P1 same day, P2 next day, P3 five days, P4 thirty.
-- Completed date fills itself in, and clears if the ticket is reopened.
create or replace function public.jaidat_issue_rules()
returns trigger language plpgsql set search_path = public as $$
declare
  opened date;
begin
  opened := ((case when tg_op = 'INSERT' then now() else old.created_at end) at time zone 'Europe/London')::date;
  if tg_op = 'INSERT' or new.priority is distinct from old.priority then
    new.target_date := opened + case new.priority when 'P1' then 0 when 'P2' then 1 when 'P3' then 5 else 30 end;
  end if;
  if new.status in ('Completed', 'Closed') and new.completed_on is null then
    new.completed_on := (now() at time zone 'Europe/London')::date;
  elsif new.status not in ('Completed', 'Closed') then
    new.completed_on := null;
  end if;
  return new;
end $$;
drop trigger if exists jaidat_issue_rules on public.jaidat_issues;
create trigger jaidat_issue_rules before insert or update on public.jaidat_issues
  for each row execute function public.jaidat_issue_rules();

create table if not exists public.jaidat_issue_notes (
  id        uuid primary key default gen_random_uuid(),
  issue_id  uuid not null references public.jaidat_issues(id) on delete cascade,
  body      text not null check (length(body) between 1 and 2000)
);
select public.mka_register_table('jaidat_issue_notes', 'jaidat');
create index if not exists jaidat_issue_notes_issue_idx on public.jaidat_issue_notes (issue_id, created_at);

create table if not exists public.jaidat_quotes (
  id             uuid primary key default gen_random_uuid(),
  issue_id       uuid not null references public.jaidat_issues(id) on delete cascade,
  contractor_id  uuid references public.jaidat_contractors(id) on delete set null,
  supplier       text check (length(supplier) <= 200),
  amount         numeric(10, 2) not null check (amount >= 0),
  received_on    date,
  notes          text check (length(notes) <= 2000),
  accepted       boolean not null default false,
  constraint jaidat_quotes_who check (contractor_id is not null or supplier is not null)
);
select public.mka_register_table('jaidat_quotes', 'jaidat');
create index if not exists jaidat_quotes_issue_idx on public.jaidat_quotes (issue_id);


-- ---------------------------------------------------------------------
-- 8. Inspections and walk-rounds
-- ---------------------------------------------------------------------

create table if not exists public.jaidat_inspections (
  id               uuid primary key default gen_random_uuid(),
  property_id      uuid not null references public.jaidat_properties(id) on delete cascade,
  inspection_type  text not null default 'Walk-round'
                   check (inspection_type in ('Walk-round', 'Routine inspection', 'Fire safety check', 'Health and safety',
                                              'Check-in or check-out', 'Other')),
  inspected_on     date not null,
  inspector        text check (length(inspector) <= 120),
  outcome          text not null default 'Satisfactory' check (outcome in ('Satisfactory', 'Actions needed', 'Unsatisfactory')),
  findings         text check (length(findings) <= 5000),
  actions          text check (length(actions) <= 5000),
  next_due         date,
  checklist        jsonb not null default '[]'::jsonb
                   check (jsonb_typeof(checklist) = 'array' and pg_column_size(checklist) <= 65536)
);
select public.mka_register_table('jaidat_inspections', 'jaidat');
create index if not exists jaidat_inspections_property_idx on public.jaidat_inspections (property_id, inspected_on desc);


-- ---------------------------------------------------------------------
-- 9. Finance: budgets, costs and invoices
-- ---------------------------------------------------------------------

create table if not exists public.jaidat_costs (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid references public.jaidat_properties(id) on delete set null,
  issue_id        uuid references public.jaidat_issues(id) on delete set null,
  category        text not null default 'Maintenance'
                  check (category in ('Budget', 'Maintenance', 'Repair', 'Utilities', 'Council tax', 'Insurance premium',
                                      'Service charge', 'Rent', 'Cleaning', 'Compliance check', 'Furniture and equipment', 'Other')),
  description     text not null check (length(description) <= 300),
  supplier        text check (length(supplier) <= 200),
  invoice_number  text check (length(invoice_number) <= 100),
  invoice_date    date,
  due_date        date,
  proposed        numeric(10, 2) check (proposed >= 0),
  approved        numeric(10, 2) check (approved >= 0),
  paid            numeric(10, 2) check (paid >= 0),
  status          text not null default 'Proposed' check (status in ('Proposed', 'Approved', 'Paid', 'Rejected')),
  approved_by     text,
  approved_on     date,
  paid_on         date,
  notes           text check (length(notes) <= 5000)
);
select public.mka_register_table('jaidat_costs', 'jaidat');
create index if not exists jaidat_costs_property_idx on public.jaidat_costs (property_id, status);


-- ---------------------------------------------------------------------
-- 10. Requests sent to other departments, waiting for a reply
-- ---------------------------------------------------------------------

create table if not exists public.jaidat_requests (
  id           uuid primary key default gen_random_uuid(),
  person       text not null check (length(person) <= 120),
  role         text check (length(role) <= 200),
  property_id  uuid references public.jaidat_properties(id) on delete set null,
  request      text not null check (length(request) <= 2000),
  sent_on      date,
  due_on       date,
  due_note     text check (length(due_note) <= 200),
  status       text not null default 'Awaiting reply' check (status in ('Awaiting reply', 'Partly replied', 'Replied')),
  reply        text check (length(reply) <= 5000),
  notes        text check (length(notes) <= 2000)
);
select public.mka_register_table('jaidat_requests', 'jaidat');

do $seed$
begin
perform set_config('mka.skip_audit', 'on', true);
insert into public.jaidat_requests (person, role, request, sent_on, due_on, due_note, notes)
select v.person, v.role, v.request, v.sent_on::date, v.due_on::date, v.due_note, v.notes
from (values
  ('Shahab Sheikh', 'Naib Waqar-e-Amal (other department)',
   'Plans, planning permissions, building regulation approvals and drawings for AeM, SeM and Sarai Khidmat',
   '2026-11-03', '2026-11-14', null, 'Scans to Yahya Ahmad, copy to Waqas Ahmad'),
  ('Touseef (Maal)', 'Mohtamim Maal (other department)',
   'Ownership and lease documents, insurance policies (building, liability, landlord) and council tax records for AeM, SeM and Sarai Khidmat',
   '2026-11-03', '2026-11-14', null, 'Noman Ahmad will follow up on insurance and finance items'),
  ('Abdul Jalil', 'Muavin Sadr, Markaz Events (other department)',
   'Annual budgets, expenditure to date, service charges, utility bills and arrears for AeM, SeM and Sarai Khidmat',
   '2026-11-03', '2026-11-21', null, 'Noman Ahmad will follow up'),
  ('Hasoor Bhatti', 'App development',
   'Meeting to finalise the portal layout, the file-naming rule and the fields held for each record',
   '2026-11-03', null, 'Week of 9 November 2026', 'Yahya Ahmad copied')
) as v(person, role, request, sent_on, due_on, due_note, notes)
where not exists (select 1 from public.jaidat_requests r where r.person = v.person and r.request = v.request);
perform set_config('mka.skip_audit', 'off', true);
end $seed$;


-- ---------------------------------------------------------------------
-- 11. Documents: uploaded files and Google Drive links
-- ---------------------------------------------------------------------

create table if not exists public.jaidat_files (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid references public.jaidat_properties(id) on delete cascade,
  category       text not null default 'Other'
                 check (category in ('Ownership', 'Leases and agreements', 'Plans and drawings', 'Planning', 'Occupancy',
                                     'Compliance', 'Insurance', 'Maintenance', 'Finance', 'SOPs and guidance',
                                     'Correspondence', 'Photos', 'Other')),
  title          text not null check (length(title) <= 200),
  file_path      text unique,
  file_name      text check (length(file_name) <= 200),
  mime_type      text,
  size_bytes     integer,
  link_url       text check (link_url ~* '^https://' and length(link_url) <= 1000),
  expires_on     date,
  version        text check (length(version) <= 40),
  verification   text not null default 'Received'
                 check (verification in ('Awaiting information', 'Requested', 'Received', 'Under review', 'Verified', 'Outstanding')),
  record_id      uuid references public.jaidat_records(id) on delete cascade,
  compliance_id  uuid references public.jaidat_compliance(id) on delete cascade,
  insurance_id   uuid references public.jaidat_insurance(id) on delete cascade,
  issue_id       uuid references public.jaidat_issues(id) on delete cascade,
  cost_id        uuid references public.jaidat_costs(id) on delete cascade,
  inspection_id  uuid references public.jaidat_inspections(id) on delete cascade,
  notes          text check (length(notes) <= 2000),
  constraint jaidat_files_source check (file_path is not null or link_url is not null)
);
select public.mka_register_table('jaidat_files', 'jaidat');
create index if not exists jaidat_files_property_idx on public.jaidat_files (property_id, category);

-- Private storage bucket: PDFs, images, Word and Excel, up to 15 MB each.
-- Files are stored as <property id or "general">/<random>-<name>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('jaidat', 'jaidat', false, 15728640, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "jaidat files read" on storage.objects;
create policy "jaidat files read" on storage.objects
  for select to authenticated using (bucket_id = 'jaidat' and public.has_department_access('jaidat'));
drop policy if exists "jaidat files upload" on storage.objects;
create policy "jaidat files upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'jaidat' and public.can_edit_department('jaidat'));
drop policy if exists "jaidat files remove" on storage.objects;
create policy "jaidat files remove" on storage.objects
  for delete to authenticated using (bucket_id = 'jaidat' and public.is_department_manager('jaidat'));


-- ---------------------------------------------------------------------
-- 12. Every property gets its checklist and compliance register
-- ---------------------------------------------------------------------

create or replace function public.jaidat_setup_property(pid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  was text := coalesce(nullif(current_setting('mka.skip_audit', true), ''), 'off');
begin
  -- Starter rows, not changes anyone made: keep them out of the activity log.
  perform set_config('mka.skip_audit', 'on', true);
  insert into public.jaidat_records (property_id, workstream, position, title, owner_name, support_name)
  select pid, t.workstream, t.position, t.title, t.owner_name, t.support_name
  from public.jaidat_record_template t
  on conflict (property_id, workstream, title) do nothing;
  insert into public.jaidat_compliance (property_id, item_key, title, legislation, interval_months, position)
  select pid, c.key, c.title, c.legislation, c.interval_months, c.position
  from public.jaidat_compliance_catalogue c
  on conflict (property_id, item_key) do nothing;
  perform set_config('mka.skip_audit', was, true);
end $$;
revoke all on function public.jaidat_setup_property(uuid) from public, anon, authenticated;

create or replace function public.jaidat_property_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.jaidat_setup_property(new.id);
  return null;
end $$;
drop trigger if exists jaidat_property_added on public.jaidat_properties;
create trigger jaidat_property_added after insert on public.jaidat_properties
  for each row execute function public.jaidat_property_added();

-- The properties already here.
do $$
declare
  p record;
begin
  for p in select id from public.jaidat_properties loop
    perform public.jaidat_setup_property(p.id);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 13. Approvals: only the Jaidad department admin (or an administrator)
--     approves money, contractors and quotes. Changes made directly in the
--     SQL Editor (no signed-in user) are allowed.
-- ---------------------------------------------------------------------

create or replace function public.jaidat_approver()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null or public.is_department_manager('jaidat');
$$;

create or replace function public.jaidat_actor_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select full_name from public.profiles where id = auth.uid()), 'Jaidad admin');
$$;

create or replace function public.jaidat_cost_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Europe/London')::date;
begin
  if (tg_op = 'INSERT' and new.status <> 'Proposed')
     or (tg_op = 'UPDATE' and (new.status is distinct from old.status or new.approved is distinct from old.approved or new.paid is distinct from old.paid)) then
    if not public.jaidat_approver() then
      raise exception 'Only the Jaidad department admin can approve, reject or mark costs as paid.' using errcode = '42501';
    end if;
  end if;
  if new.status in ('Approved', 'Paid', 'Rejected') and (tg_op = 'INSERT' or old.status = 'Proposed') then
    new.approved_by := coalesce(new.approved_by, public.jaidat_actor_name());
    new.approved_on := coalesce(new.approved_on, today);
  end if;
  if new.status in ('Approved', 'Paid') and new.approved is null then
    new.approved := new.proposed;
  end if;
  if new.status = 'Paid' then
    new.paid_on := coalesce(new.paid_on, today);
    new.paid := coalesce(new.paid, new.approved, new.proposed);
  end if;
  if new.status = 'Proposed' then
    new.approved_by := null;
    new.approved_on := null;
  end if;
  return new;
end $$;
drop trigger if exists jaidat_cost_rules on public.jaidat_costs;
create trigger jaidat_cost_rules before insert or update on public.jaidat_costs
  for each row execute function public.jaidat_cost_rules();

create or replace function public.jaidat_contractor_rules()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.approved) or (tg_op = 'UPDATE' and new.approved is distinct from old.approved) then
    if not public.jaidat_approver() then
      raise exception 'Only the Jaidad department admin can approve contractors.' using errcode = '42501';
    end if;
    if new.approved then
      new.approved_by := public.jaidat_actor_name();
      new.approved_on := (now() at time zone 'Europe/London')::date;
    else
      new.approved_by := null;
      new.approved_on := null;
    end if;
  elsif tg_op = 'UPDATE' then
    -- Who approved, and when, can't be edited by hand.
    new.approved_by := old.approved_by;
    new.approved_on := old.approved_on;
  else
    new.approved_by := null;
    new.approved_on := null;
  end if;
  return new;
end $$;
drop trigger if exists jaidat_contractor_rules on public.jaidat_contractors;
create trigger jaidat_contractor_rules before insert or update on public.jaidat_contractors
  for each row execute function public.jaidat_contractor_rules();

create or replace function public.jaidat_quote_rules()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.accepted) or (tg_op = 'UPDATE' and new.accepted is distinct from old.accepted) then
    if not public.jaidat_approver() then
      raise exception 'Only the Jaidad department admin can accept quotes.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists jaidat_quote_rules on public.jaidat_quotes;
create trigger jaidat_quote_rules before insert or update on public.jaidat_quotes
  for each row execute function public.jaidat_quote_rules();


-- ---------------------------------------------------------------------
-- 14. Public reports (/report): anyone can report an issue without signing in.
--     They can only add a new ticket. They can't read or change anything.
-- ---------------------------------------------------------------------

-- Property names and rooms for the report form. No addresses or anything else.
create or replace function public.jaidat_report_places()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'rooms', rooms) order by name), '[]'::jsonb)
  from public.jaidat_properties
  where status <> 'Disposed';
$$;

create or replace function public.jaidat_report(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  who      text := left(nullif(trim(p->>'name'), ''), 120);
  contact  text := left(nullif(trim(p->>'contact'), ''), 160);
  what     text := nullif(trim(p->>'description'), '');
  place    text := left(nullif(trim(p->>'location'), ''), 200);
  cat      text := coalesce(nullif(p->>'category', ''), 'Other');
  pid      uuid;
  pri      text;
  heading  text;
  r        text;
begin
  -- A hidden field people never see. Only bots fill it in.
  if coalesce(p->>'website', '') <> '' then
    raise exception 'This report could not be sent.' using errcode = 'P0001';
  end if;
  if who is null or contact is null or what is null then
    raise exception 'Please give your name, a way to contact you and what happened.' using errcode = 'P0001';
  end if;
  if length(what) > 4000 then
    raise exception 'Please keep the description under 4,000 characters.' using errcode = 'P0001';
  end if;
  if coalesce(p->>'consent', '') <> 'true' then
    raise exception 'Please tick the box to say Jaidad may use these details.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.jaidat_issues where source = 'public' and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'A lot of reports have come in just now. Please try again in a little while, or email jaidad@khuddam.co.uk.' using errcode = 'P0001';
  end if;

  if coalesce(p->>'property_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into pid from public.jaidat_properties where id = (p->>'property_id')::uuid;
  end if;
  if cat not in ('Repair', 'Defect', 'Safety', 'Damp or mould', 'Security or access', 'Pests', 'Cleaning', 'Grounds', 'Other') then
    cat := 'Other';
  end if;
  -- Emergencies go to 999, not this form. Jaidad sets the final priority.
  pri := case p->>'urgency' when 'urgent' then 'P2' when 'week' then 'P3' else 'P4' end;
  heading := left(coalesce(nullif(trim(p->>'title'), ''), split_part(what, E'\n', 1)), 120);

  insert into public.jaidat_issues
    (property_id, location, title, description, category, priority, status, reported_by, reporter_contact, source)
  values (pid, place, heading, what, cat, pri, 'New', who, contact, 'public')
  returning ref into r;
  return r;
end $$;

revoke all on function public.jaidat_report_places() from public;
revoke all on function public.jaidat_report(jsonb) from public;
grant execute on function public.jaidat_report_places() to anon, authenticated;
grant execute on function public.jaidat_report(jsonb) to anon, authenticated;


-- ---------------------------------------------------------------------
-- Check the result
-- ---------------------------------------------------------------------

select p.reference, p.name, p.property_type,
       (select count(*) from public.jaidat_records r where r.property_id = p.id) as checklist_items,
       (select count(*) from public.jaidat_compliance c where c.property_id = p.id) as compliance_items
from public.jaidat_properties p
order by p.reference;
