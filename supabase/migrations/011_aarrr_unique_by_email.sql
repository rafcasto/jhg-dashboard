-- ============================================================
-- Migration 011: aarrr_funnel_metrics — unique-by-email stages
-- SECURITY DEFINER — browser uses anon key, never sees raw rows
--
-- Acquisition, Activation and Retention are now counted as DISTINCT
-- people (unique email per stage) rather than raw rows — the same
-- person signing up / activating / re-engaging multiple times counts
-- once per stage. Awareness, Referral and Revenue keep raw counts.
--
-- Email is normalised (lower + trim); rows with a blank email fall back
-- to their row id so they are never merged together.
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
    -- raw row counts
    'awareness',   count(*) filter (where stage = 'awareness'),
    'referral',    count(*) filter (where stage = 'referral'),
    'revenue',     count(*) filter (where stage = 'revenue'),
    -- unique-by-email-and-stage counts (one person per stage)
    'acquisition', count(distinct email_key) filter (where stage = 'acquisition'),
    'activation',  count(distinct email_key) filter (where stage = 'activation'),
    'retention',   count(distinct email_key) filter (where stage = 'retention'),
    'total',       count(*),
    'last_updated', max(created_at)
  )
  from (
    select
      stage,
      created_at,
      coalesce(nullif(lower(trim(email)), ''), id::text) as email_key
    from public.jobhackers_leads
    where (p_start  is null or created_at >= p_start)
      and (p_end    is null or created_at <= p_end)
      and (p_source is null or source     = p_source)
  ) l;
$$;

revoke all on function public.aarrr_funnel_metrics(timestamptz, timestamptz, text) from public;
grant execute on function public.aarrr_funnel_metrics(timestamptz, timestamptz, text)
  to anon, authenticated, service_role;
