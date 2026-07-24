-- Super-admin-only admin/security visibility hardening.
-- Run after supabase-app-profiles.sql.

create index if not exists audit_events_action_created_at_idx
on public.audit_events(action, created_at desc);

create index if not exists security_events_alert_day_idx
on public.security_events(alert_day desc);

drop policy if exists "Logged in users can read security events" on public.security_events;
create policy "Super admins can read security events"
on public.security_events
for select
to authenticated
using (public.is_super_admin());

-- Optional hardening: only super admins can read all audit rows. Keep disabled if managers need Audit tab access.
-- drop policy if exists "Logged in users can read audit events" on public.audit_events;
-- create policy "Super admins can read audit events"
-- on public.audit_events
-- for select
-- to authenticated
-- using (public.is_super_admin());
