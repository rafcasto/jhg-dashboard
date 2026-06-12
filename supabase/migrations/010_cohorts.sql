-- ============================================================
-- Migration 010: cohorts table
-- Time-boxed target-vs-actual experiments. Each cohort captures:
--   - a date window (start/end) for the leads it measures
--   - a description of WHAT CHANGED in the sales funnel
--   - per-stage targets (jsonb: { stage_key: target_count })
--   - which funnel it applies to (null = main AARRR)
-- Multiple cohorts can run in parallel to validate multiple changes.
-- ============================================================

create table if not exists public.cohorts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,                 -- what change is being validated
  dashboard_id uuid references public.custom_dashboards(id) on delete cascade,
  start_date   date not null,
  end_date     date,                 -- null = open-ended / still running
  targets      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.cohorts enable row level security;

drop policy if exists "authenticated read cohorts" on public.cohorts;
create policy "authenticated read cohorts"
  on public.cohorts for select
  to authenticated
  using (true);

drop policy if exists "authenticated insert cohorts" on public.cohorts;
create policy "authenticated insert cohorts"
  on public.cohorts for insert
  to authenticated
  with check (true);

drop policy if exists "authenticated update cohorts" on public.cohorts;
create policy "authenticated update cohorts"
  on public.cohorts for update
  to authenticated
  using (true);

drop policy if exists "authenticated delete cohorts" on public.cohorts;
create policy "authenticated delete cohorts"
  on public.cohorts for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.cohorts to authenticated;
grant all on public.cohorts to service_role;
