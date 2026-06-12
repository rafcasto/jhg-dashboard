-- ============================================================
-- Migration 008: custom_dashboards table
-- User-defined funnels (e.g. L-A-P-S) — each stage maps to a
-- set of lead tags. Stage counts are computed client-side from
-- the aarrr_tag_breakdown RPC.
--
-- stages jsonb shape:
--   [
--     { "key": "l", "label": "Leads", "emoji": "🧲",
--       "color": "#7a1ec2", "tags": ["EVENT -> RSVP -> WEBINAR"] },
--     ...
--   ]
-- ============================================================

create table if not exists public.custom_dashboards (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  stages      jsonb not null default '[]'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.custom_dashboards enable row level security;

-- All logged-in dashboard users can see and manage custom dashboards
drop policy if exists "authenticated read custom dashboards" on public.custom_dashboards;
create policy "authenticated read custom dashboards"
  on public.custom_dashboards for select
  to authenticated
  using (true);

drop policy if exists "authenticated insert custom dashboards" on public.custom_dashboards;
create policy "authenticated insert custom dashboards"
  on public.custom_dashboards for insert
  to authenticated
  with check (true);

drop policy if exists "authenticated update custom dashboards" on public.custom_dashboards;
create policy "authenticated update custom dashboards"
  on public.custom_dashboards for update
  to authenticated
  using (true);

drop policy if exists "authenticated delete custom dashboards" on public.custom_dashboards;
create policy "authenticated delete custom dashboards"
  on public.custom_dashboards for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.custom_dashboards to authenticated;
grant all on public.custom_dashboards to service_role;
