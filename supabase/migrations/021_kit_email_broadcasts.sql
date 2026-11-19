-- ============================================================
-- Migration 021: Kit (ConvertKit) email broadcasts
--
--  1. integrations.kind gains 'kit'
--  2. email_broadcasts — one row per Kit broadcast (lifetime stats:
--     recipients, opens, clicks, unsubscribes), attributed to send date
--  3. email_daily     — view: the same rolled up per account per day,
--     so custom dashboards / experiments can sum it like awareness_daily
--
-- Secrets (the Kit API key) live in integration_secrets as { api_key }.
-- ============================================================

-- ---------- 1. allow kind = 'kit' ----------
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.integrations'::regclass
      and contype  = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.integrations drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.integrations
  add constraint integrations_kind_check check (kind in ('linkedin', 'ga4', 'kit'));

-- ---------- 2. email_broadcasts ----------
create table if not exists public.email_broadcasts (
  integration_id uuid not null references public.integrations(id) on delete cascade,
  broadcast_id   text not null,            -- Kit broadcast id
  subject        text,
  send_at        timestamptz,
  status         text,                     -- draft | scheduled | sending | completed | aborted
  recipients     bigint not null default 0,   -- emails sent
  opens          bigint not null default 0,   -- unique subscribers who opened
  clicks         bigint not null default 0,   -- total link clicks
  unsubscribes   bigint not null default 0,
  fetched_at     timestamptz not null default now(),
  primary key (integration_id, broadcast_id)
);

create index if not exists email_broadcasts_send_idx
  on public.email_broadcasts (integration_id, send_at);

alter table public.email_broadcasts enable row level security;
drop policy if exists "authenticated read email_broadcasts" on public.email_broadcasts;
create policy "authenticated read email_broadcasts"
  on public.email_broadcasts for select to authenticated using (true);
grant select on public.email_broadcasts to authenticated;
grant all on public.email_broadcasts to service_role;

-- ---------- 3. email_daily (per account, per send day) ----------
create or replace view public.email_daily
  with (security_invoker = true) as
  select integration_id,
         (send_at at time zone 'UTC')::date as date,
         count(*)::bigint          as broadcasts,
         sum(recipients)::bigint   as recipients,
         sum(opens)::bigint        as opens,
         sum(clicks)::bigint       as clicks,
         sum(unsubscribes)::bigint as unsubscribes
  from public.email_broadcasts
  where send_at is not null
  group by integration_id, (send_at at time zone 'UTC')::date;

grant select on public.email_daily to authenticated, service_role;
