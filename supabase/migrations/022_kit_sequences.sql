-- ============================================================
-- Migration 022: Kit sequences (automated email series)
--
-- Kit reports sequence stats as LIFETIME totals with no dates, so:
--  1. email_sequences          — one row per sequence, lifetime stats
--  2. email_sequence_emails    — per email inside a sequence, lifetime stats
--  3. email_sequence_snapshots — the lifetime totals as seen each day the
--                                sync ran; today − yesterday = sent today
--  4. email_sequence_entries   — subscribers who ENTERED the sequence per
--                                day (the one dated number Kit gives us)
--  5. email_sequence_deltas    — view: per-day change between snapshots
--  6. email_daily              — REBUILT: broadcasts (by send day) UNION
--                                sequence deltas + entries, with a
--                                `channel` / `sequence_id` so a stage can
--                                read all email, broadcasts only, or one
--                                sequence. Existing readers that only
--                                select date + metrics keep working.
-- ============================================================

-- ---------- 1. email_sequences ----------
create table if not exists public.email_sequences (
  integration_id   uuid not null references public.integrations(id) on delete cascade,
  sequence_id      text not null,
  name             text,
  active           boolean not null default true,
  email_count      int    not null default 0,
  subscriber_count bigint not null default 0,
  recipients       bigint not null default 0,   -- lifetime emails sent
  opens            bigint not null default 0,
  clicks           bigint not null default 0,
  unsubscribes     bigint not null default 0,
  bounces          bigint not null default 0,
  fetched_at       timestamptz not null default now(),
  primary key (integration_id, sequence_id)
);

-- ---------- 2. email_sequence_emails ----------
create table if not exists public.email_sequence_emails (
  integration_id uuid not null references public.integrations(id) on delete cascade,
  sequence_id    text not null,
  email_id       text not null,
  subject        text,
  position       int,
  published      boolean not null default true,
  recipients     bigint not null default 0,
  opens          bigint not null default 0,
  clicks         bigint not null default 0,
  unsubscribes   bigint not null default 0,
  fetched_at     timestamptz not null default now(),
  primary key (integration_id, email_id)
);
create index if not exists email_sequence_emails_seq_idx
  on public.email_sequence_emails (integration_id, sequence_id, position);

-- ---------- 3. email_sequence_snapshots ----------
create table if not exists public.email_sequence_snapshots (
  integration_id uuid not null references public.integrations(id) on delete cascade,
  sequence_id    text not null,
  date           date not null,
  recipients     bigint not null default 0,
  opens          bigint not null default 0,
  clicks         bigint not null default 0,
  unsubscribes   bigint not null default 0,
  fetched_at     timestamptz not null default now(),
  primary key (integration_id, sequence_id, date)
);

-- ---------- 4. email_sequence_entries ----------
create table if not exists public.email_sequence_entries (
  integration_id uuid not null references public.integrations(id) on delete cascade,
  sequence_id    text not null,
  date           date not null,
  entered        bigint not null default 0,
  fetched_at     timestamptz not null default now(),
  primary key (integration_id, sequence_id, date)
);

-- RLS: dashboard users read, service_role writes
do $$
declare t text;
begin
  foreach t in array array['email_sequences', 'email_sequence_emails', 'email_sequence_snapshots', 'email_sequence_entries']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "authenticated read %s" on public.%I', t, t);
    execute format('create policy "authenticated read %s" on public.%I for select to authenticated using (true)', t, t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- ---------- 5. email_sequence_deltas ----------
-- Change since the previous snapshot. First snapshot = 0 (it is the baseline).
create or replace view public.email_sequence_deltas
  with (security_invoker = true) as
  select integration_id, sequence_id, date,
         greatest(recipients   - lag(recipients,   1, recipients)   over w, 0)::bigint as recipients,
         greatest(opens        - lag(opens,        1, opens)        over w, 0)::bigint as opens,
         greatest(clicks       - lag(clicks,       1, clicks)       over w, 0)::bigint as clicks,
         greatest(unsubscribes - lag(unsubscribes, 1, unsubscribes) over w, 0)::bigint as unsubscribes
  from public.email_sequence_snapshots
  window w as (partition by integration_id, sequence_id order by date);

grant select on public.email_sequence_deltas to authenticated, service_role;

-- ---------- 6. email_daily (rebuilt) ----------
drop view if exists public.email_daily;
create view public.email_daily
  with (security_invoker = true) as
  -- broadcasts, attributed to their send day
  select integration_id,
         'broadcast'::text                   as channel,
         null::text                          as sequence_id,
         (send_at at time zone 'UTC')::date  as date,
         count(*)::bigint                    as broadcasts,
         sum(recipients)::bigint             as recipients,
         sum(opens)::bigint                  as opens,
         sum(clicks)::bigint                 as clicks,
         sum(unsubscribes)::bigint           as unsubscribes,
         0::bigint                           as entered
  from public.email_broadcasts
  where send_at is not null
  group by integration_id, (send_at at time zone 'UTC')::date
  union all
  -- sequences: per-day deltas + people who entered that day
  select coalesce(d.integration_id, e.integration_id),
         'sequence'::text,
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
