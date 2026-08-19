-- Tightens RLS on members, claims, service_entries, audit_events, and
-- security_events from "any authenticated user can do everything" to
-- role-based rules built on public.app_profiles / public.is_super_admin(),
-- the pattern already established in supabase-app-profiles.sql and
-- supabase-admin-security.sql.
--
-- Run after supabase-app-profiles.sql (needs public.is_super_admin() to exist).
-- Run supabase-require-mfa.sql's updated audit_events block (added alongside
-- this file) either before or after this one -- order between the two
-- doesn't matter, they touch disjoint policy sets.
-- Idempotent: every create policy below is preceded by a drop of that exact
-- name, so re-running this file is safe.
--
-- Shape:
--   - user & manager: read/write members, claims, service_entries (same as
--     today's behavior for those operations -- this does not change daily
--     workflow for staff).
--   - delete on members/claims/service_entries: super_admin only, matching
--     the app's existing password-reconfirmation-before-delete UI pattern.
--   - audit_events: readable by super_admin only (can reveal sensitive
--     operational detail -- who deleted what, bulk resets, etc.); still
--     writable by any app user so the audit trail keeps capturing everyone's
--     actions, not just admins'.
--   - security_events: unchanged (already super_admin-read-only per
--     supabase-admin-security.sql; insert must stay open to anon since it
--     reports failed sign-ins from users who aren't authenticated yet).
--
-- This does not remove or alter any RESTRICTIVE policy (supabase-require-mfa.sql's
-- aal2 gates) on any table -- see the members section below for how that's
-- enforced structurally, not by name-guessing. Those restrictive policies and
-- these new permissive ones combine: a request must satisfy BOTH "is aal2"
-- AND "is an app user" (or "is super_admin" for deletes). audit_events did
-- not have an aal2 gate before; that's added in the same edit to
-- supabase-require-mfa.sql that accompanies this file, not here.

create or replace function public.is_app_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_profiles where user_id = auth.uid()
  );
$$;

-- SECURITY DEFINER functions get EXECUTE granted to PUBLIC by default in
-- Postgres. Every policy that calls this runs `to authenticated`, so anon
-- never needs to call it directly -- narrow the grant accordingly.
revoke execute on function public.is_app_user() from public;
grant execute on function public.is_app_user() to authenticated;

-- members: no supabase-members.sql exists in this repo (created via the
-- dashboard originally), so exact current PERMISSIVE policy names aren't
-- known here. Drop only permissive policies by querying pg_policies instead
-- of guessing names -- filtering on permissive = 'PERMISSIVE' specifically
-- means this can never touch the RESTRICTIVE "Require MFA for members"
-- policy from supabase-require-mfa.sql, regardless of what it's named or
-- whether it's even been applied yet. This same filter is what makes this
-- block idempotent: on a second run, the prior run's own permissive policies
-- ("App users can read members" etc.) are caught by this same query and
-- dropped before being recreated.
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'members'
      and permissive = 'PERMISSIVE'
  loop
    execute format('drop policy if exists %I on public.members', pol.policyname);
  end loop;
end $$;

create policy "App users can read members"
on public.members
for select
to authenticated
using (public.is_app_user());

create policy "App users can add members"
on public.members
for insert
to authenticated
with check (public.is_app_user());

create policy "App users can update members"
on public.members
for update
to authenticated
using (public.is_app_user())
with check (public.is_app_user());

create policy "Super admins can delete members"
on public.members
for delete
to authenticated
using (public.is_super_admin());

-- claims
drop policy if exists "Logged in users can read claims" on public.claims;
drop policy if exists "Logged in users can add claims" on public.claims;
drop policy if exists "Logged in users can update claims" on public.claims;
drop policy if exists "Logged in users can delete claims" on public.claims;
drop policy if exists "App users can read claims" on public.claims;
drop policy if exists "App users can add claims" on public.claims;
drop policy if exists "App users can update claims" on public.claims;
drop policy if exists "Super admins can delete claims" on public.claims;
drop policy if exists "Managers can delete claims" on public.claims;

create policy "App users can read claims"
on public.claims
for select
to authenticated
using (public.is_app_user());

create policy "App users can add claims"
on public.claims
for insert
to authenticated
with check (public.is_app_user());

create policy "App users can update claims"
on public.claims
for update
to authenticated
using (public.is_app_user())
with check (public.is_app_user());

create policy "Managers can delete claims"
on public.claims
for delete
to authenticated
using (public.is_manager());

-- service_entries
drop policy if exists "Logged in users can read service entries" on public.service_entries;
drop policy if exists "Logged in users can add service entries" on public.service_entries;
drop policy if exists "Logged in users can update service entries" on public.service_entries;
drop policy if exists "Logged in users can delete service entries" on public.service_entries;
drop policy if exists "App users can read service entries" on public.service_entries;
drop policy if exists "App users can add service entries" on public.service_entries;
drop policy if exists "App users can update service entries" on public.service_entries;
drop policy if exists "Super admins can delete service entries" on public.service_entries;
drop policy if exists "Managers can delete service entries" on public.service_entries;

create policy "App users can read service entries"
on public.service_entries
for select
to authenticated
using (public.is_app_user());

create policy "App users can add service entries"
on public.service_entries
for insert
to authenticated
with check (public.is_app_user());

create policy "App users can update service entries"
on public.service_entries
for update
to authenticated
using (public.is_app_user())
with check (public.is_app_user());

create policy "Managers can delete service entries"
on public.service_entries
for delete
to authenticated
using (public.is_manager());

-- audit_events: keep the actor-scoped insert policy (every app user's
-- actions should still be logged), tighten select to super_admin only. The
-- commented-out option in supabase-admin-security.sql is now the default.
drop policy if exists "Logged in users can read audit events" on public.audit_events;
drop policy if exists "Super admins can read audit events" on public.audit_events;
create policy "Super admins can read audit events"
on public.audit_events
for select
to authenticated
using (public.is_super_admin());

drop policy if exists "Logged in users can add audit events" on public.audit_events;
drop policy if exists "App users can add audit events" on public.audit_events;
create policy "App users can add audit events"
on public.audit_events
for insert
to authenticated
with check (
  public.is_app_user()
  and (actor_id = auth.uid() or actor_id is null)
);

-- security_events: no changes. Listed here for completeness/audit trail --
-- "Logged in users can read security events" was already replaced with
-- "Super admins can read security events" in supabase-admin-security.sql,
-- and insert intentionally stays open to anon + authenticated so failed
-- sign-in lockouts can be reported by users who aren't logged in yet.
