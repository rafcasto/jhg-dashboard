-- ============================================================
-- PATCH: Apply only missing migrations (001 + 006 already done)
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ============================================================
-- Migration 002: aarrr_funnel_metrics RPC
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
-- Migration 005: get_leads_list RPC (FIXED — uses first_name, tag, location)
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

revoke all on function public.get_leads_list(text, text, timestamptz, timestamptz, int, int) from public;
grant execute on function public.get_leads_list(text, text, timestamptz, timestamptz, int, int)
  to authenticated, service_role;

-- ============================================================
-- Migration 007: aarrr_tag_breakdown RPC
-- FIXED — tag is a plain TEXT column, not text[]; no unnest needed
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
      stage::text                         as stage,
      coalesce(nullif(trim(tag), ''), '(untagged)') as tag,
      count(*)::int                       as count
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
-- Migration 012: get_leads_export RPC
-- Full (non-paginated) lead export for CSV download — default
-- funnel (by stage) or custom funnel (by tag set). p_unique_by_email
-- returns one row per person. Authenticated users only (PII).
-- ============================================================

create or replace function public.get_leads_export(
  p_stage           text        default null,
  p_source          text        default null,
  p_start           timestamptz default null,
  p_end             timestamptz default null,
  p_tags            text[]      default null,
  p_unique_by_email boolean     default true,
  p_limit           int         default 50000
)
returns json
language sql
security definer
set search_path = public
stable
as $$
  with filtered as (
    select
      id, created_at, first_name, last_name, email,
      stage::text as stage, source, score, archetype,
      coalesce(nullif(trim(tag), ''), '(untagged)') as tag,
      location
    from public.jobhackers_leads
    where (p_stage  is null or stage::text = p_stage)
      and (p_source is null or source      = p_source)
      and (p_start  is null or created_at  >= p_start)
      and (p_end    is null or created_at  <= p_end)
      and (
        p_tags is null
        or coalesce(nullif(trim(tag), ''), '(untagged)') = any(p_tags)
      )
  ),
  deduped as (
    select distinct on (
      case when p_unique_by_email then lower(coalesce(email, id::text))
           else id::text end
    ) *
    from filtered
    order by
      case when p_unique_by_email then lower(coalesce(email, id::text))
           else id::text end,
      created_at desc
    limit p_limit
  )
  select coalesce(json_agg(row_to_json(d) order by d.created_at desc), '[]'::json)
  from deduped d;
$$;

revoke all on function public.get_leads_export(text, text, timestamptz, timestamptz, text[], boolean, int) from public;
grant execute on function public.get_leads_export(text, text, timestamptz, timestamptz, text[], boolean, int)
  to authenticated, service_role;
