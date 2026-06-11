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
