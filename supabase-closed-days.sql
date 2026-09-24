-- Center-wide closed days (holidays, emergency closures). A closed date is
-- skipped everywhere the app works out expected service days -- service
-- calendar, bulk fill, continue holds, status extend, missed/expected counts,
-- claim review -- and can't be clicked in the service calendar. Closing a day
-- never touches service entries or claims already recorded on it.
--
-- Run after supabase-app-profiles.sql and supabase-role-based-access.sql
-- (needs public.is_app_user() and public.is_manager()).
-- Idempotent: safe to re-run.

create table if not exists public.closed_days (
  service_date date primary key,
  reason text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.closed_days enable row level security;

-- Every app user needs the list (it shapes their calendars); only managers
-- and super admins can open or close a day. No update policy: changing a
-- reason is a remove + add.
drop policy if exists "App users can read closed days" on public.closed_days;
create policy "App users can read closed days"
on public.closed_days
for select
to authenticated
using (public.is_app_user());

drop policy if exists "Managers can add closed days" on public.closed_days;
create policy "Managers can add closed days"
on public.closed_days
for insert
to authenticated
with check (public.is_manager() and created_by = auth.uid());

drop policy if exists "Managers can remove closed days" on public.closed_days;
create policy "Managers can remove closed days"
on public.closed_days
for delete
to authenticated
using (public.is_manager());

-- Same aal2 gate as every other app table (see supabase-require-mfa.sql).
drop policy if exists "Require MFA for closed days" on public.closed_days;
create policy "Require MFA for closed days"
  on public.closed_days
  as restrictive
  for all
  to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
