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
          id, created_at, name, last_name, email,
          stage::text, source, score, archetype, tags
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
-- Each lead can have multiple tags (text[] column), so we unnest them.
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
      stage::text                   as stage,
      unnested_tag                  as tag,
      count(*)::int                 as count
    from public.jobhackers_leads,
         unnest(
           case
             when tags is null or array_length(tags, 1) = 0
             then array['(untagged)']::text[]
             else tags
           end
         ) as unnested_tag
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
