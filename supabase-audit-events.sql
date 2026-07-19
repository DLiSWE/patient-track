create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_type text not null check (entity_type in ('member', 'service', 'claim', 'security')),
  entity_id uuid,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  actor_id uuid default auth.uid(),
  actor_email text,
  created_at timestamptz not null default now()
);

create index audit_events_created_at_idx
on public.audit_events (created_at desc);

create index audit_events_entity_idx
on public.audit_events (entity_type, entity_id);

alter table public.audit_events enable row level security;

create policy "Logged in users can read audit events"
on public.audit_events
for select
to authenticated
using (true);

create policy "Logged in users can add audit events"
on public.audit_events
for insert
to authenticated
with check (actor_id = auth.uid() or actor_id is null);
