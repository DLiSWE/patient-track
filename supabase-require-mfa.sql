-- Run this after every approved user has enrolled and verified 2FA.
-- These restrictive policies require an aal2 session for app table access.

drop policy if exists "Require MFA for members" on public.members;
create policy "Require MFA for members"
  on public.members
  as restrictive
  for all
  to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists "Require MFA for service entries" on public.service_entries;
create policy "Require MFA for service entries"
  on public.service_entries
  as restrictive
  for all
  to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists "Require MFA for claims" on public.claims;
create policy "Require MFA for claims"
  on public.claims
  as restrictive
  for all
  to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists "Require MFA for security events" on public.security_events;
create policy "Require MFA for security events"
  on public.security_events
  as restrictive
  for all
  to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
