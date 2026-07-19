create table public.claims (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  service_date date not null,
  status text not null default 'Pending',
  attempt_count integer not null default 0,
  last_attempted_at timestamptz,
  last_failure_reason text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, service_date)
);

create index claims_service_date_idx
on public.claims (service_date desc);

create index claims_member_id_idx
on public.claims (member_id);

create index claims_status_idx
on public.claims (status);

alter table public.claims enable row level security;

create policy "Logged in users can read claims"
on public.claims
for select
to authenticated
using (true);

create policy "Logged in users can add claims"
on public.claims
for insert
to authenticated
with check (true);

create policy "Logged in users can update claims"
on public.claims
for update
to authenticated
using (true)
with check (true);

create policy "Logged in users can delete claims"
on public.claims
for delete
to authenticated
using (true);
