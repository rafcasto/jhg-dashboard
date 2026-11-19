-- ============================================================
-- Migration 023: email_daily carries broadcast_id
--
-- A custom-dashboard stage can now be scoped to ONE broadcast (as well
-- as all email / all broadcasts / all sequences / one sequence), so the
-- daily view emits one row per broadcast instead of a per-day sum.
-- Readers always sum rows, so totals are unchanged.
-- ============================================================

drop view if exists public.email_daily;
create view public.email_daily
  with (security_invoker = true) as
  -- one row per broadcast, attributed to its send day
  select integration_id,
         'broadcast'::text                   as channel,
         broadcast_id,
         null::text                          as sequence_id,
         (send_at at time zone 'UTC')::date  as date,
         1::bigint                           as broadcasts,
         recipients, opens, clicks, unsubscribes,
         0::bigint                           as entered
  from public.email_broadcasts
  where send_at is not null
  union all
  -- sequences: per-day deltas + people who entered that day
  select coalesce(d.integration_id, e.integration_id),
         'sequence'::text,
         null::text,
         coalesce(d.sequence_id, e.sequence_id),
         coalesce(d.date, e.date),
         0::bigint,
         coalesce(d.recipients,   0)::bigint,
         coalesce(d.opens,        0)::bigint,
         coalesce(d.clicks,       0)::bigint,
         coalesce(d.unsubscribes, 0)::bigint,
         coalesce(e.entered,      0)::bigint
  from public.email_sequence_deltas d
  full outer join public.email_sequence_entries e
    on e.integration_id = d.integration_id and e.sequence_id = d.sequence_id and e.date = d.date;

grant select on public.email_daily to authenticated, service_role;
