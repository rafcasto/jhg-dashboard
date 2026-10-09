-- ============================================================
-- Migration 019: Experiments + external integrations
--
--  1. cohorts  →  experiments   (rename, keeps all data)
--     + posting-window metadata: which LinkedIn accounts were
--       posting and which downstream sites to measure impact on
--  2. integrations            — connected LinkedIn accounts and
--                               GA4 properties (non-secret config)
--  3. integration_secrets     — tokens / service-account JSON.
--                               service_role ONLY, never the browser
--  4. awareness_posts         — per-post LinkedIn impressions/engagement
--  5. awareness_daily         — per-day LinkedIn impressions/engagement
--  6. site_daily              — per-day GA4 metrics per downstream site
-- ============================================================

-- ---------- 1. cohorts → experiments ----------
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'cohorts')
     and not exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'experiments') then
    alter table public.cohorts rename to experiments;
  end if;
end $$;

-- Fresh installs (no cohorts table to rename)
create table if not exists public.experiments (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  dashboard_id uuid references public.custom_dashboards(id) on delete cascade,
  start_date   date not null,
  end_date     date,
  targets      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.experiments
  add column if not exists hypothesis       text,
  -- integration ids (LinkedIn accounts) that were posting during the window
  add column if not exists channels         uuid[] not null default '{}',
  -- downstream site keys to measure (e.g. {eec, webinar, compass})
  add column if not exists downstream_sites text[] not null default '{}',
  -- length of the "before" comparison window; null = same length as the posting window
  add column if not exists baseline_days    int check (baseline_days is null or baseline_days > 0);

alter table public.experiments enable row level security;

drop policy if exists "authenticated read cohorts"   on public.experiments;
drop policy if exists "authenticated insert cohorts" on public.experiments;
drop policy if exists "authenticated update cohorts" on public.experiments;
drop policy if exists "authenticated delete cohorts" on public.experiments;

drop policy if exists "authenticated read experiments" on public.experiments;
create policy "authenticated read experiments"
  on public.experiments for select to authenticated using (true);
drop policy if exists "authenticated insert experiments" on public.experiments;
create policy "authenticated insert experiments"
  on public.experiments for insert to authenticated with check (true);
drop policy if exists "authenticated update experiments" on public.experiments;
create policy "authenticated update experiments"
  on public.experiments for update to authenticated using (true);
drop policy if exists "authenticated delete experiments" on public.experiments;
create policy "authenticated delete experiments"
  on public.experiments for delete to authenticated using (true);

grant select, insert, update, delete on public.experiments to authenticated;
grant all on public.experiments to service_role;

-- ---------- 2. integrations (non-secret) ----------
create table if not exists public.integrations (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('linkedin', 'ga4')),
  label          text not null,
  -- ga4 only: which downstream site this property belongs to (eec, webinar, compass, …)
  site_key       text,
  -- linkedin: { member_sub, member_name, orgs: [{urn,name,vanity}], author_urn, author_name }
  -- ga4:      { property_id, measurement_id, site_url, service_account_email }
  config         jsonb not null default '{}'::jsonb,
  status         text not null default 'connected'
                   check (status in ('connected', 'pending', 'error')),
  last_synced_at timestamptz,
  last_error     text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists integrations_kind_idx on public.integrations (kind);

alter table public.integrations enable row level security;

-- Browser may READ the catalogue (no secrets live here). Writes go through
-- the Vercel API with the service-role key, after an admin check.
drop policy if exists "authenticated read integrations" on public.integrations;
create policy "authenticated read integrations"
  on public.integrations for select to authenticated using (true);

grant select on public.integrations to authenticated;
grant all on public.integrations to service_role;

-- ---------- 3. integration_secrets (service_role only) ----------
create table if not exists public.integration_secrets (
  integration_id uuid primary key references public.integrations(id) on delete cascade,
  -- linkedin: { access_token, refresh_token, expires_at, refresh_expires_at }
  -- ga4:      { service_account: {...json...} }
  secrets        jsonb not null default '{}'::jsonb,
  updated_at     timestamptz not null default now()
);

alter table public.integration_secrets enable row level security;
-- No policies on purpose: RLS enabled + no policy = nobody but service_role.
revoke all on public.integration_secrets from anon, authenticated;
grant all on public.integration_secrets to service_role;

-- ---------- 4. awareness_posts (per LinkedIn post, lifetime stats) ----------
create table if not exists public.awareness_posts (
  id                 uuid primary key default gen_random_uuid(),
  integration_id     uuid not null references public.integrations(id) on delete cascade,
  post_id            text not null,          -- urn:li:share:… / urn:li:ugcPost:… / csv row key
  post_url           text,
  title              text,
  published_at       timestamptz,
  impressions        bigint not null default 0,
  unique_impressions bigint not null default 0,
  engagements        bigint not null default 0,   -- likes + comments + shares + clicks
  likes              bigint not null default 0,
  comments           bigint not null default 0,
  shares             bigint not null default 0,
  clicks             bigint not null default 0,
  source             text not null default 'api' check (source in ('api', 'csv')),
  fetched_at         timestamptz not null default now(),
  unique (integration_id, post_id)
);

create index if not exists awareness_posts_published_idx
  on public.awareness_posts (integration_id, published_at);

alter table public.awareness_posts enable row level security;
drop policy if exists "authenticated read awareness_posts" on public.awareness_posts;
create policy "authenticated read awareness_posts"
  on public.awareness_posts for select to authenticated using (true);
grant select on public.awareness_posts to authenticated;
grant all on public.awareness_posts to service_role;

-- ---------- 5. awareness_daily (per LinkedIn account, per day) ----------
create table if not exists public.awareness_daily (
  integration_id     uuid not null references public.integrations(id) on delete cascade,
  date               date not null,
  impressions        bigint not null default 0,
  unique_impressions bigint not null default 0,
  engagements        bigint not null default 0,
  likes              bigint not null default 0,
  comments           bigint not null default 0,
  shares             bigint not null default 0,
  clicks             bigint not null default 0,
  source             text not null default 'api' check (source in ('api', 'csv')),
  fetched_at         timestamptz not null default now(),
  primary key (integration_id, date)
);

alter table public.awareness_daily enable row level security;
drop policy if exists "authenticated read awareness_daily" on public.awareness_daily;
create policy "authenticated read awareness_daily"
  on public.awareness_daily for select to authenticated using (true);
grant select on public.awareness_daily to authenticated;
grant all on public.awareness_daily to service_role;

-- ---------- 6. site_daily (GA4, per downstream site, per day) ----------
create table if not exists public.site_daily (
  integration_id   uuid not null references public.integrations(id) on delete cascade,
  site_key         text not null,
  date             date not null,
  sessions         bigint not null default 0,
  total_users      bigint not null default 0,
  new_users        bigint not null default 0,
  page_views       bigint not null default 0,
  engaged_sessions bigint not null default 0,
  event_count      bigint not null default 0,
  key_events       bigint not null default 0,   -- GA4 "key events" (formerly conversions)
  fetched_at       timestamptz not null default now(),
  primary key (integration_id, date)
);

create index if not exists site_daily_site_date_idx on public.site_daily (site_key, date);

alter table public.site_daily enable row level security;
drop policy if exists "authenticated read site_daily" on public.site_daily;
create policy "authenticated read site_daily"
  on public.site_daily for select to authenticated using (true);
grant select on public.site_daily to authenticated;
grant all on public.site_daily to service_role;
