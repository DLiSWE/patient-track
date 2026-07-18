alter table public.members
add column if not exists archived_at timestamptz;

create index if not exists members_archived_at_idx
on public.members (archived_at);
