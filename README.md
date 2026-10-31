# MKA Portal

MKA Portal: the internal portal for five sub-departments: Delegations, Fleet, Jaidat, Special Arrangements and Storage.

- Next.js 15 (App Router) + TypeScript, ready for Vercel
- Supabase Auth for logins (sessions held in secure server-side cookies)
- Each user sees only the departments they've been given. Someone with one department lands straight on it; someone with several can switch between them; administrators see everything
- Every record stores `created_by`, `created_at`, `updated_by`, `updated_at`, set **by the database** from the logged-in user
- Every add, edit and removal is written to an `audit_log` table with before/after data
- "Salam [name]" in the top right, from the user's profile

## 1. Set up Supabase (10 minutes)

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor** → New query → paste all of `supabase/migrations/0001_mka_portal.sql` → **Run**. Then do the same with `supabase/migrations/0002_department_privacy.sql`, `supabase/migrations/0003_fleet.sql`, `supabase/migrations/0004_delegations_calendar.sql` and `supabase/migrations/0005_delegation_planning.sql` (in that order).
3. **Authentication → Sign In / Providers → Email**: turn **off** "Allow new users to sign up". Only admins should create accounts.
4. **Authentication → Users → Add user → Create new user**: enter email and password, tick "Auto confirm user".
5. Open `supabase/grant_access.sql`, edit the emails and names, and run it in the SQL Editor. This sets each person's display name ("Salam …"), makes you an admin, and gives others their departments.

| Role | Can do |
| --- | --- |
| `member` (Member) | View, add and edit records in their department(s) |
| `manager` (Department admin) | All of the above, plus remove records |
| `profiles.is_admin` (Administrator) | Everything in every department |

People only ever see the departments they've been given, and the names of colleagues who share a department with them. This is enforced by the database, not just hidden in the app.

## 2. Run it locally

Needs Node 20 or newer.

```bash
npm install
cp .env.example .env.local   # then paste your Supabase URL and anon/publishable key
npm run dev
```

Open http://localhost:3000 and sign in.

Your keys are in Supabase → **Project Settings → API Keys**. Use the **anon** (or **publishable**) key. Never put the `service_role` / secret key in this app.

## 3. Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel: **Add New → Project** → import the repository.
3. Add the two environment variables from `.env.example`.
4. Deploy.
5. In Supabase → **Authentication → URL Configuration**, set **Site URL** to your Vercel address.

## Delegations calendar (Google Calendar)

The Delegations dashboard shows the `delegations@khuddam.co.uk` Google Calendar. The calendar stays private: the owner signs in once, and the server reads it read-only on everyone's behalf. Only people with the Delegations department see it, and viewers don't need Google access.

**One-time setup** (Google Cloud Console, project `khuddam-portal`):

1. **APIs & Services → Library**: make sure **Google Calendar API** is enabled.
2. **Google Auth Platform → Branding / Get started**: app name `MKA Portal`, your support email. For **Audience** choose **Internal** if offered. If only External is available, choose External, then on the Audience page click **Publish app** (left in "Testing", Google expires the sign-in after 7 days).
3. **Google Auth Platform → Clients → Create client**: type **Desktop app**, name `MKA Portal calendar`. Copy the client ID and secret into `.env.local` as `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.
4. Run `npm run calendar:auth`. Sign in as **delegations@khuddam.co.uk** and click **Allow** (on an External app, click *Advanced → Go to MKA Portal* past the "unverified" notice). The token is saved to `.env.local`.
5. Restart `npm run dev`. In Vercel, add `GOOGLE_CALENDAR_ID`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` and `GOOGLE_OAUTH_REFRESH_TOKEN`, then redeploy.

**Delegation records from the calendar.** Each time the Delegations page opens, delegation events (all-day events created by the delegations account) become delegation records: arrival and departure from the event's first and last day, name, country, member count and venue from the title (`MKA Germany - Taunus - 25 Members - Baitul Ehsan`). Events for the same group with overlapping dates merge into one record. Transport and airport bookings (`9 Seater`, `Airport pickup`) and meeting invites are skipped. Status follows the dates (Planned if the title says TBC, then Confirmed → Arrived → Departed), a record whose event is deleted becomes Cancelled, and one cancelled by hand stays cancelled. Removing a record stops it coming back. The logic is in `lib/delegation-sync.ts`.

If the calendar panel ever says to reconnect (access removed or the account changed), run step 4 again and update the token in Vercel.

## How it fits together

```
app/
  login/                  Sign-in page
  auth/signout/           Sign-out endpoint
  (portal)/layout.tsx     Shell: sidebar, top bar with "Salam [name]"
  (portal)/page.tsx       Overview of your departments
  (portal)/[dept]/        One dashboard per department (records, filters, add/edit, recent changes)
  (portal)/[dept]/[id]/   A delegation's own page: Info, Accommodation, Transport, Food, Mulaqat
  (portal)/activity/      Full activity log, filterable by department
lib/
  departments.ts          The five departments: names, colours, tables, form fields, statuses
  session.ts              Who's logged in and what they can access
  supabase/               Supabase clients for server and middleware
middleware.ts             Keeps sessions fresh and sends logged-out visitors to /login
supabase/                 SQL to set up and manage the database
```

### Why "created by" can't be faked

The app never sends `created_by` or `updated_by`. A database trigger (`mka_stamp`) fills them from `auth.uid()`, the user in the session token. A second trigger (`mka_audit`) writes the audit log. Row-level security stops anyone reading or changing another department's data, even if they call the Supabase API directly.

## Adding things later

### A new table (bookings, guest lists, records…)

```sql
create table public.guest_lists (
  id          uuid primary key default gen_random_uuid(),
  guest_name  text not null,
  delegation  uuid references public.delegations(id) on delete cascade,
  status      text not null default 'Invited'
);

-- Adds created_by / updated_by, audit logging and department security in one call:
select public.mka_register_table('guest_lists', 'delegations');
```

Every table needs an `id uuid` primary key for the audit log.

To show it in the app, either add a new page under `app/(portal)/[dept]/`, or, for a simple list, add another department-style entry to `lib/departments.ts`.

### A new field on an existing department

1. `alter table public.fleet_vehicles add column mot_due date;`
2. Add `{ name: "mot_due", label: "MOT due", type: "date", inTable: true }` to that department's `fields` in `lib/departments.ts`.

The form, table, validation and audit log pick it up automatically.

### Reading who made a change

```sql
select a.changed_at, p.full_name, a.action, a.table_name, a.old_data, a.new_data
from audit_log a
left join profiles p on p.id = a.changed_by
order by a.changed_at desc
limit 50;
```
