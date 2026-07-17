create table public.service_entries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  service_date date not null,
  service_label text not null default 'Attended',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, service_date)
);

create index service_entries_service_date_idx
on public.service_entries (service_date desc);

create index service_entries_member_id_idx
on public.service_entries (member_id);

alter table public.service_entries enable row level security;

create policy "Logged in users can read service entries"
on public.service_entries
for select
to authenticated
using (true);

create policy "Logged in users can add service entries"
on public.service_entries
for insert
to authenticated
with check (true);

create policy "Logged in users can update service entries"
on public.service_entries
for update
to authenticated
using (true)
with check (true);

create policy "Logged in users can delete service entries"
on public.service_entries
for delete
to authenticated
using (true);
