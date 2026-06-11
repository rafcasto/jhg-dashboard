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
