-- ============================================================
-- Migration 012: get_leads_export RPC
-- Full (non-paginated) lead export for CSV download.
--
-- Powers the "Download CSV" buttons on both the default AAARRR
-- funnel (filter by stage) and custom funnels (filter by the set
-- of tags mapped to a custom stage).
--
--   p_stage           default-funnel stage key (awareness, …)
--   p_source          optional source filter
--   p_start / p_end   optional created_at window
--   p_tags            optional set of tags — a lead matches when its
--                     (trimmed / '(untagged)'-normalised) tag is in the set.
--                     Used to export a custom stage.
--   p_unique_by_email when true (default), returns one row per person
--                     (most-recent record wins) → "unique details".
--   p_limit           hard cap to keep payloads sane (default 50k).
--
-- Authenticated dashboard users only — rows are PII.
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
      id,
      created_at,
      first_name,
      last_name,
      email,
      stage::text                                    as stage,
      source,
      score,
      archetype,
      coalesce(nullif(trim(tag), ''), '(untagged)')  as tag,
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
  select coalesce(
    json_agg(row_to_json(d) order by d.created_at desc),
    '[]'::json
  )
  from deduped d;
$$;

revoke all on function public.get_leads_export(text, text, timestamptz, timestamptz, text[], boolean, int) from public;
grant execute on function public.get_leads_export(text, text, timestamptz, timestamptz, text[], boolean, int)
  to authenticated, service_role;
