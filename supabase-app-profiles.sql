-- App roles and lightweight online presence.
-- Run this without deleting existing member/service/claim data.

create table if not exists public.app_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'user' check (role in ('user', 'manager', 'super_admin')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_profiles enable row level security;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_profiles
    where user_id = auth.uid()
      and role = 'super_admin'
  );
$$;

create or replace function public.set_app_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_app_profiles_updated_at on public.app_profiles;
create trigger set_app_profiles_updated_at
before update on public.app_profiles
for each row
execute function public.set_app_profiles_updated_at();

drop policy if exists "Users can read own profile and super admins can read all" on public.app_profiles;
create policy "Users can read own profile and super admins can read all"
on public.app_profiles
for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists "Users can create only their own basic profile" on public.app_profiles;
create policy "Users can create only their own basic profile"
on public.app_profiles
for insert
to authenticated
with check (user_id = auth.uid() and role = 'user');

drop policy if exists "Users can touch own profile without changing role" on public.app_profiles;
create policy "Users can touch own profile without changing role"
on public.app_profiles
for update
to authenticated
using (user_id = auth.uid() or public.is_super_admin())
with check (
  public.is_super_admin()
  or (
    user_id = auth.uid()
    and role = (
      select current_profile.role
      from public.app_profiles as current_profile
      where current_profile.user_id = auth.uid()
    )
  )
);

create index if not exists app_profiles_role_idx on public.app_profiles(role);
create index if not exists app_profiles_last_seen_at_idx on public.app_profiles(last_seen_at desc);

-- Bootstrap yourself after signing in once, replacing the email below.
-- This does not delete or overwrite app data.
--
-- insert into public.app_profiles (user_id, email, display_name, role, last_seen_at)
-- select id, email, coalesce(raw_user_meta_data ->> 'name', split_part(email, '@', 1)), 'super_admin', now()
-- from auth.users
-- where email = 'YOUR_EMAIL@example.com'
-- on conflict (user_id) do update
-- set role = 'super_admin',
--     email = excluded.email,
--     display_name = coalesce(public.app_profiles.display_name, excluded.display_name),
--     last_seen_at = now();
