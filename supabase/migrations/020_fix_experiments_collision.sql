-- ============================================================
-- Migration 020: Fix experiments table name collision
--
-- Migration 019 tried to rename cohorts → experiments, but this
-- Supabase project already had an unrelated public.experiments
-- table (A/B test config owned by the JobHackers site:
-- key, enabled, weight_a, weight_b). Because it existed, 019
-- skipped the rename and instead bolted dashboard columns and
-- permissive policies onto the A/B table. The dashboard's data
-- was never moved out of public.cohorts.
--
-- This migration:
--   1. renames cohorts → dashboard_experiments (keeps all rows)
--   2. adds the 019 columns to dashboard_experiments
--   3. removes the stray columns + policies 019 left on the
--      A/B public.experiments table
-- ============================================================

-- ---------- 1. cohorts → dashboard_experiments ----------
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'cohorts')
     and not exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'dashboard_experiments') then
    alter table public.cohorts rename to dashboard_experiments;
  end if;
end $$;

-- Fresh installs
create table if not exists public.dashboard_experiments (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  dashboard_id uuid references public.custom_dashboards(id) on delete cascade,
  start_date   date not null,
  end_date     date,
  targets      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------- 2. columns from 019 ----------
alter table public.dashboard_experiments
  add column if not exists hypothesis       text,
  add column if not exists channels         uuid[] not null default '{}',
  add column if not exists downstream_sites text[] not null default '{}',
  add column if not exists baseline_days    int check (baseline_days is null or baseline_days > 0);

alter table public.dashboard_experiments enable row level security;

-- Policies carried over from 010 under their old "cohorts" names; recreate
-- under clear names so the rename is complete.
drop policy if exists "authenticated read cohorts"   on public.dashboard_experiments;
drop policy if exists "authenticated insert cohorts" on public.dashboard_experiments;
drop policy if exists "authenticated update cohorts" on public.dashboard_experiments;
drop policy if exists "authenticated delete cohorts" on public.dashboard_experiments;

drop policy if exists "authenticated read dashboard_experiments" on public.dashboard_experiments;
create policy "authenticated read dashboard_experiments"
  on public.dashboard_experiments for select to authenticated using (true);
drop policy if exists "authenticated insert dashboard_experiments" on public.dashboard_experiments;
create policy "authenticated insert dashboard_experiments"
  on public.dashboard_experiments for insert to authenticated with check (true);
drop policy if exists "authenticated update dashboard_experiments" on public.dashboard_experiments;
create policy "authenticated update dashboard_experiments"
  on public.dashboard_experiments for update to authenticated using (true);
drop policy if exists "authenticated delete dashboard_experiments" on public.dashboard_experiments;
create policy "authenticated delete dashboard_experiments"
  on public.dashboard_experiments for delete to authenticated using (true);

grant select, insert, update, delete on public.dashboard_experiments to authenticated;
grant all on public.dashboard_experiments to service_role;

-- ---------- 3. undo what 019 did to the A/B public.experiments table ----------
-- Only touch it if it is the A/B table (has weight_a), never a dashboard table.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'experiments'
               and column_name = 'weight_a') then
    alter table public.experiments
      drop column if exists hypothesis,
      drop column if exists channels,
      drop column if exists downstream_sites,
      drop column if exists baseline_days;

    drop policy if exists "authenticated read experiments"   on public.experiments;
    drop policy if exists "authenticated insert experiments" on public.experiments;
    drop policy if exists "authenticated update experiments" on public.experiments;
    drop policy if exists "authenticated delete experiments" on public.experiments;

    -- 019 also granted authenticated full CRUD on this table. Revoke the
    -- write grants; a logged-in dashboard user should not be able to flip
    -- the other site's A/B weights. (select is left as-is in case the
    -- JobHackers site reads it as an authenticated user.)
    revoke insert, update, delete on public.experiments from authenticated;
  end if;
end $$;

notify pgrst, 'reload schema';
