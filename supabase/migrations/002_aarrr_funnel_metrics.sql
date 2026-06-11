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
