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

-- ============================================================
-- Migration 002: aarrr_funnel_metrics RPC
-- SECURITY DEFINER — browser uses anon key, never sees raw rows
-- Updated for AAARRR (6 stages including Awareness)
-- ============================================================

create or replace function public.aarrr_funnel_metrics(
  p_start  timestamptz default null,
  p_end    timestamptz default null,
  p_source text        default null
)
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
    'awareness',   count(*) filter (where stage = 'awareness'),
    'acquisition', count(*) filter (where stage = 'acquisition'),
    'activation',  count(*) filter (where stage = 'activation'),
    'retention',   count(*) filter (where stage = 'retention'),
    'referral',    count(*) filter (where stage = 'referral'),
    'revenue',     count(*) filter (where stage = 'revenue'),
    'total',       count(*),
    'last_updated', max(created_at)
  )
  from public.jobhackers_leads
  where (p_start  is null or created_at >= p_start)
    and (p_end    is null or created_at <= p_end)
    and (p_source is null or source     = p_source);
$$;

revoke all on function public.aarrr_funnel_metrics(timestamptz, timestamptz, text) from public;
grant execute on function public.aarrr_funnel_metrics(timestamptz, timestamptz, text)
  to anon, authenticated, service_role;

-- ============================================================
-- Migration 003: aarrr_trend_by_week RPC
-- Returns weekly lead counts per stage for trend charts
-- ============================================================

create or replace function public.aarrr_trend_by_week(
  p_start timestamptz default now() - interval '90 days',
  p_end   timestamptz default now()
)
returns json
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(json_agg(row_to_json(t) order by t.week, t.stage), '[]'::json)
  from (
    select
      date_trunc('week', created_at)::date as week,
      stage::text                          as stage,
      count(*)::int                        as count
    from public.jobhackers_leads
    where created_at between p_start and p_end
    group by 1, 2
    order by 1, 2
  ) t;
$$;

revoke all on function public.aarrr_trend_by_week(timestamptz, timestamptz) from public;
grant execute on function public.aarrr_trend_by_week(timestamptz, timestamptz)
  to anon, authenticated, service_role;

-- ============================================================
-- Migration 004: aarrr_source_breakdown RPC
-- Returns source × stage counts for the matrix chart
-- ============================================================

create or replace function public.aarrr_source_breakdown(
  p_start timestamptz default null,
  p_end   timestamptz default null
)
returns json
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(json_agg(row_to_json(t)), '[]'::json)
  from (
    select
      coalesce(source, 'unknown') as source,
      stage::text                 as stage,
      count(*)::int               as count
    from public.jobhackers_leads
    where (p_start is null or created_at >= p_start)
      and (p_end   is null or created_at <= p_end)
    group by 1, 2
    order by 1, 2
  ) t;
$$;

revoke all on function public.aarrr_source_breakdown(timestamptz, timestamptz) from public;
grant execute on function public.aarrr_source_breakdown(timestamptz, timestamptz)
  to anon, authenticated, service_role;

-- ============================================================
-- Migration 005: get_leads_list RPC
-- Paginated lead rows — authenticated users only (not anon)
-- NOTE: matches live schema — first_name / last_name / tag (singular)
-- ============================================================

create or replace function public.get_leads_list(
  p_stage  text        default null,
  p_source text        default null,
  p_start  timestamptz default null,
  p_end    timestamptz default null,
  p_limit  int         default 100,
  p_offset int         default 0
)
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
    'rows', (
      select coalesce(json_agg(row_to_json(t)), '[]'::json)
      from (
        select
          id, created_at, first_name, last_name, email,
          stage::text, source, score, archetype, tag, location
        from public.jobhackers_leads
        where (p_stage  is null or stage::text = p_stage)
          and (p_source is null or source      = p_source)
          and (p_start  is null or created_at  >= p_start)
          and (p_end    is null or created_at  <= p_end)
        order by created_at desc
        limit  p_limit
        offset p_offset
      ) t
    ),
    'total', (
      select count(*)::int
      from public.jobhackers_leads
      where (p_stage  is null or stage::text = p_stage)
        and (p_source is null or source      = p_source)
        and (p_start  is null or created_at  >= p_start)
        and (p_end    is null or created_at  <= p_end)
    )
  );
$$;

-- Only authenticated (logged-in) dashboard users can list leads
revoke all on function public.get_leads_list(text, text, timestamptz, timestamptz, int, int) from public;
grant execute on function public.get_leads_list(text, text, timestamptz, timestamptz, int, int)
  to authenticated, service_role;

-- ============================================================
-- Migration 006: Add 'awareness' to lead_stage enum
-- AAARRR = Awareness, Acquisition, Activation, Retention, Referral, Revenue
-- ============================================================

-- PostgreSQL requires ALTER TYPE to add enum values; IF NOT EXISTS is pg14+
ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'awareness' BEFORE 'acquisition';

-- ============================================================
-- Migration 007: aarrr_tag_breakdown RPC
-- Returns tag distribution per stage — sub-steps within each AAARRR stage
-- NOTE: matches live schema — each lead has ONE tag (text column).
-- ============================================================

create or replace function public.aarrr_tag_breakdown(
  p_start  timestamptz default null,
  p_end    timestamptz default null,
  p_stage  text        default null
)
returns json
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(json_agg(row_to_json(t)), '[]'::json)
  from (
    select
      stage::text                          as stage,
      coalesce(nullif(trim(tag), ''), '(untagged)') as tag,
      count(*)::int                        as count
    from public.jobhackers_leads
    where (p_start is null or created_at >= p_start)
      and (p_end   is null or created_at <= p_end)
      and (p_stage is null or stage::text = p_stage)
    group by 1, 2
    order by 1, count(*) desc
  ) t;
$$;

revoke all on function public.aarrr_tag_breakdown(timestamptz, timestamptz, text) from public;
grant execute on function public.aarrr_tag_breakdown(timestamptz, timestamptz, text)
  to anon, authenticated, service_role;

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

