-- ============================================================
-- Migration 001: dashboard_users table
-- Maps Supabase Auth UIDs → display name + role
-- ============================================================

create table if not exists public.dashboard_users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text,
  role       text not null default 'viewer'
               check (role in ('admin', 'viewer')),
  created_at timestamptz default now()
);

-- RLS on — only authenticated users, only their own row
alter table public.dashboard_users enable row level security;

create policy "user reads own profile"
  on public.dashboard_users for select
  to authenticated
  using (auth.uid() = id);
