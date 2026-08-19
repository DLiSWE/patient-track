-- Tracks, per member, the furthest date their currently-known authorizations
-- cover ("confirmed through"). Deliberately minimal: no auth #, procedure
-- code, payer, or status -- just a date, keyed by this app's own member id
-- (an opaque UUID it already generates, not any healthcare-portal id).
-- Written by the claims-v2 bot's `sync-auths` command; read by the Service
-- Calendar to flag any day after this date as needing a new authorization.
alter table public.members
add column if not exists auth_expires_on date;

create index if not exists members_auth_expires_on_idx
on public.members (auth_expires_on);
