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
