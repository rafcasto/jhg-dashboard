-- ============================================================
-- Migration 018: Time-period filter for the quadrant
--
-- get_people_list already filters by an activity window
-- (last_seen >= p_start AND first_seen <= p_end). The quadrant summary
-- didn't, so its counts couldn't match a filtered list. This adds the
-- same window to people_quadrant() so both agree under any period.
--
-- Window semantics = "people active in the window": a person is included
-- when their most recent interaction is on/after the start and their
-- first is on/before the end. Scoring itself is unchanged — this filters
-- WHICH people are counted, it does not re-score within the window.
-- ============================================================

-- Signature changes (0-arg → 2-arg); drop both possible forms so replays
-- stay clean and no stale overload lingers for PostgREST to resolve.
drop function if exists public.people_quadrant();
drop function if exists public.people_quadrant(timestamptz, timestamptz);

create function public.people_quadrant(
  p_start timestamptz default null,
  p_end   timestamptz default null
)
returns json
language sql
security definer
set search_path = public
stable
as $$
  with windowed as (
    select *
    from public.lead_people
    where (p_start is null or last_seen  >= p_start)
      and (p_end   is null or first_seen <= p_end)
  ),
  scored_rows as (
    select
      fit_band,
      (intent_score >= public.intent_high_threshold()) as intent_high
    from windowed
    where fit_band is not null
  ),
  seg as (
    select
      case
        when fit_band = 'high' and intent_high      then 'priority'
        when fit_band = 'high' and not intent_high  then 'nurture'
        when fit_band = 'low'  and intent_high      then 'qualify'
        else 'disqualify'
      end as segment,
      count(*)::int as n
    from scored_rows
    group by 1
  ),
  keys(segment) as (values ('priority'),('nurture'),('qualify'),('disqualify'))
  select json_build_object(
    'thresholds', json_build_object(
      'intent', public.intent_high_threshold(),
      'fit',    public.fit_high_threshold()
    ),
    'total_people', (select count(*)::int from windowed),
    'scored',       (select count(*)::int from windowed where fit_band is not null),
    'unknown_fit',  (select count(*)::int from windowed where fit_band is null),
    'segments', (
      select json_agg(json_build_object('segment', k.segment, 'count', coalesce(s.n, 0)))
      from keys k left join seg s on s.segment = k.segment
    )
  );
$$;

revoke all on function public.people_quadrant(timestamptz, timestamptz) from public;
grant execute on function public.people_quadrant(timestamptz, timestamptz) to authenticated, service_role;
