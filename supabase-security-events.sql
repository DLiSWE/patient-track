create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('sign_in_lockout')),
  attempted_email text,
  attempt_count integer not null,
  locked_until timestamptz not null,
  alert_day date not null default ((now() at time zone 'utc')::date),
  user_agent text,
  created_at timestamptz not null default now()
);

create index security_events_created_at_idx
on public.security_events (created_at desc);

create unique index security_events_one_lockout_alert_per_day_idx
on public.security_events (event_type, alert_day)
where event_type = 'sign_in_lockout';

alter table public.security_events enable row level security;

create policy "Anyone can report sign in lockouts"
on public.security_events
for insert
to anon, authenticated
with check (
  event_type = 'sign_in_lockout'
  and attempt_count >= 5
);

create policy "Logged in users can read security events"
on public.security_events
for select
to authenticated
using (true);
