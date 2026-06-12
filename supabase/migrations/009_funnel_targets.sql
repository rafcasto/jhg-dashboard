-- ============================================================
-- Migration 009: funnel_targets table
-- Targets per funnel stage, for the main AARRR funnel
-- (dashboard_id is null) or any custom dashboard.
-- ============================================================

create table if not exists public.funnel_targets (
  id           uuid primary key default gen_random_uuid(),
  dashboard_id uuid references public.custom_dashboards(id) on delete cascade,
  stage_key    text not null,
  target_count int  not null default 0 check (target_count >= 0),
  updated_at   timestamptz not null default now()
);

-- One target per (funnel, stage). NULL dashboard_id = main AARRR funnel,
-- so use a coalesce-based unique index (NULLs are otherwise distinct).
create unique index if not exists funnel_targets_scope_stage_uq
  on public.funnel_targets (coalesce(dashboard_id::text, 'aarrr'), stage_key);

alter table public.funnel_targets enable row level security;

drop policy if exists "authenticated read targets" on public.funnel_targets;
create policy "authenticated read targets"
  on public.funnel_targets for select
  to authenticated
  using (true);

drop policy if exists "authenticated insert targets" on public.funnel_targets;
create policy "authenticated insert targets"
  on public.funnel_targets for insert
  to authenticated
  with check (true);

drop policy if exists "authenticated update targets" on public.funnel_targets;
create policy "authenticated update targets"
  on public.funnel_targets for update
  to authenticated
  using (true);

drop policy if exists "authenticated delete targets" on public.funnel_targets;
create policy "authenticated delete targets"
  on public.funnel_targets for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.funnel_targets to authenticated;
grant all on public.funnel_targets to service_role;
