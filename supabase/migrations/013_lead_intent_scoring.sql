-- ============================================================
-- Migration 013: Buying-Intent Scoring
--
-- Intent = how close a lead is to buying, derived from TWO signals:
--   1. Stage progression  → public.lead_intent_stage_weights
--   2. Behavioural tags   → public.lead_intent_tag_rules
--
-- Rules of the model:
--   • stage 'churn'  ALWAYS yields a negative score (capped at -1)
--   • every other stage ALWAYS yields a score >= 0
--   • tag rules resolve with OVERRIDE semantics:
--       an 'exact' rule on a tag WINS outright over broad 'like' patterns.
--       If no exact rule matches, all matching 'like' rules SUM.
--     This is what makes "set the weight for this one tag" behave predictably
--     in the admin UI instead of silently stacking on top of a pattern.
--
-- Scores are computed on READ (never stored on the lead), so editing a
-- weight in the admin UI re-scores the whole base instantly with no job.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Tag normalisation
--    Live tags use inconsistent delimiters:
--      'EVENT -> RSVP -> WEBINAR'  vs  'EVENT->QUIZ_COMPLETE->COMPASS'
--    Both must normalise to 'EVENT->RSVP->WEBINAR' style so one rule matches.
-- ------------------------------------------------------------
create or replace function public.normalize_tag(p_tag text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(
      regexp_replace(                      -- collapse leftover whitespace runs
        regexp_replace(                    -- tighten arrows: ' -> ' => '->'
          upper(btrim(coalesce(p_tag, ''))),
          '\s*->\s*', '->', 'g'
        ),
        '\s+', ' ', 'g'
      )
    ),
    ''
  );
$$;


-- ------------------------------------------------------------
-- 2. Stage weights — the base intent of simply being in a stage
-- ------------------------------------------------------------
create table if not exists public.lead_intent_stage_weights (
  stage_key  text primary key,
  weight     int  not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.lead_intent_stage_weights is
  'Base buying-intent points per funnel stage. The churn row should stay negative.';


-- ------------------------------------------------------------
-- 3. Tag rules — behavioural points
--    match_type 'exact' → normalized tag must equal pattern (OVERRIDES 'like')
--    match_type 'like'  → normalized tag LIKE pattern (use % wildcards)
-- ------------------------------------------------------------
create table if not exists public.lead_intent_tag_rules (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  pattern    text not null,
  match_type text not null default 'like' check (match_type in ('like', 'exact')),
  weight     int  not null default 0,
  enabled    boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lead_intent_tag_rules_pattern_uq
  on public.lead_intent_tag_rules (match_type, pattern);

comment on table public.lead_intent_tag_rules is
  'Buying-intent points per behavioural tag. An exact rule overrides like rules; like rules sum.';


-- ------------------------------------------------------------
-- 4. Scoring functions
-- ------------------------------------------------------------

-- Resolved tag points, with exact-overrides-like semantics
create or replace function public.lead_tag_weight(p_tag text)
returns int
language sql
stable
as $$
  with n as (select public.normalize_tag(p_tag) as tag),
  exact_rules as (
    select coalesce(sum(r.weight), 0)::int as w, count(*) as n
    from public.lead_intent_tag_rules r, n
    where r.enabled and r.match_type = 'exact' and n.tag = r.pattern
  ),
  like_rules as (
    select coalesce(sum(r.weight), 0)::int as w
    from public.lead_intent_tag_rules r, n
    where r.enabled and r.match_type = 'like' and n.tag like r.pattern
  )
  select case when e.n > 0 then e.w else l.w end
  from exact_rules e, like_rules l;
$$;

-- Final intent score: stage base + tag points, with the churn/positive guarantee
create or replace function public.compute_lead_intent(p_stage text, p_tag text)
returns int
language sql
stable
as $$
  with base as (
    select coalesce(
             (select w.weight from public.lead_intent_stage_weights w
               where w.stage_key = p_stage),
             0
           ) + public.lead_tag_weight(p_tag) as raw
  )
  select case
           when p_stage = 'churn' then least(-abs(raw), -1)
           else greatest(raw, 0)
         end::int
  from base;
$$;

-- Which rules actually counted — powers the "why is this tag worth 20?" UI
create or replace function public.lead_intent_matched_rules(p_tag text)
returns json
language sql
stable
as $$
  with n as (select public.normalize_tag(p_tag) as tag),
  matched as (
    select r.id, r.label, r.pattern, r.match_type, r.weight
    from public.lead_intent_tag_rules r, n
    where r.enabled
      and (
        (r.match_type = 'exact' and n.tag =    r.pattern)
        or
        (r.match_type = 'like'  and n.tag like r.pattern)
      )
  ),
  winning as (
    select * from matched
    where match_type = (
      case when exists (select 1 from matched where match_type = 'exact')
           then 'exact' else 'like' end
    )
  )
  select coalesce(json_agg(json_build_object(
           'id', id, 'label', label, 'pattern', pattern,
           'match_type', match_type, 'weight', weight
         ) order by weight desc), '[]'::json)
  from winning;
$$;


-- ------------------------------------------------------------
-- 5. Seed defaults — every stage, plus a rule per live tag family
--    ON CONFLICT DO NOTHING so re-running never clobbers tuned weights.
-- ------------------------------------------------------------
insert into public.lead_intent_stage_weights (stage_key, weight) values
  ('awareness',    5),
  ('acquisition', 15),
  ('activation',  30),
  ('retention',   45),
  ('referral',    55),
  ('revenue',     70),
  ('churn',      -50)
on conflict (stage_key) do nothing;

insert into public.lead_intent_tag_rules (label, pattern, match_type, weight) values
  -- Event / webinar funnel
  ('RSVP to an event',         '%->RSVP->%',           'like',   5),
  ('Registered for a program', '%->REGISTRATION->%',   'like',  15),
  ('Joined the waiting list',  '%->JOIN->WAITINGLIST%','like',  12),
  -- Quiz behaviour
  ('Started the quiz',         '%->QUIZ_START->%',     'like',   8),
  ('Completed the quiz',       '%->QUIZ_COMPLETE->%',  'like',  20),
  ('Answered a quiz',          '%->ANSWER->QUIZ%',     'like',  15),
  -- Product activation (Compass)
  ('Grant created',            '%->GRANT_CREATED->%',  'like',  15),
  ('Grant redeemed',           '%->GRANT_REDEEMED->%', 'like',  25),
  ('Onboarded',                '%->ONBOARDED->%',      'like',  30),
  ('Opened coaching',          '%->COACHING_OPEN->%',  'like',  35),
  ('Logged in',                '%->LOGIN->%',          'like',  10),
  ('Password reset',           '%->PASSWORD_RESET->%', 'like',   2),
  -- Tracker engagement
  ('Added a reminder',         '%->ADD_REMINDER->%',   'like',   8),
  ('Completed a reminder',     '%->REMINDER_DONE->%',  'like',  12),
  -- Email engagement
  ('Clicked an email link',    '%LINK CLICKED%',       'like',   8),
  ('Email bounced',            '%->BOUNCED%',          'like', -15)
on conflict (match_type, pattern) do nothing;


-- ------------------------------------------------------------
-- 6. Admin RPC — every stage and every live tag, with counts + weights
--    This is what the Intent Scoring page renders.
-- ------------------------------------------------------------
create or replace function public.lead_intent_config()
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(

    -- All 7 enum stages (even ones with zero leads), in funnel order
    'stages', (
      select coalesce(json_agg(row_to_json(s) order by s.ord), '[]'::json)
      from (
        select
          e.stage_key,
          e.ord,
          coalesce(w.weight, 0)     as weight,
          (w.stage_key is not null) as configured,
          coalesce(c.lead_count, 0) as lead_count
        from (
          select t.label::text as stage_key, t.ord
          from unnest(enum_range(null::public.lead_stage))
               with ordinality as t(label, ord)
        ) e
        left join public.lead_intent_stage_weights w on w.stage_key = e.stage_key
        left join (
          select stage::text as stage_key, count(*)::int as lead_count
          from public.jobhackers_leads
          group by 1
        ) c on c.stage_key = e.stage_key
      ) s
    ),

    -- Every distinct normalised tag in the base, with its resolved weight
    'tags', (
      select coalesce(json_agg(row_to_json(t) order by t.lead_count desc), '[]'::json)
      from (
        select
          coalesce(public.normalize_tag(l.tag), '(untagged)') as tag,
          min(l.tag)                                          as sample_raw,
          count(*)::int                                       as lead_count,
          public.lead_tag_weight(min(l.tag))                  as weight,
          public.lead_intent_matched_rules(min(l.tag))        as matched_rules
        from public.jobhackers_leads l
        group by 1
      ) t
    ),

    -- The rule set itself
    'rules', (
      select coalesce(json_agg(row_to_json(r) order by r.weight desc, r.label), '[]'::json)
      from (
        select id, label, pattern, match_type, weight, enabled
        from public.lead_intent_tag_rules
      ) r
    )
  );
$$;

revoke all on function public.lead_intent_config() from public;
grant execute on function public.lead_intent_config() to authenticated, service_role;


-- ------------------------------------------------------------
-- 7. Intent distribution — band histogram for the dashboard
-- ------------------------------------------------------------
create or replace function public.lead_intent_distribution(
  p_start timestamptz default null,
  p_end   timestamptz default null
)
returns json
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(json_agg(row_to_json(b) order by b.sort), '[]'::json)
  from (
    select band, sort, count(*)::int as lead_count
    from (
      select case
               when s < 0  then 'churned'
               when s < 20 then 'cold'
               when s < 40 then 'warm'
               when s < 70 then 'hot'
               else             'sales_ready'
             end as band,
             case
               when s < 0  then 0
               when s < 20 then 1
               when s < 40 then 2
               when s < 70 then 3
               else             4
             end as sort
      from (
        select public.compute_lead_intent(stage::text, tag) as s
        from public.jobhackers_leads
        where (p_start is null or created_at >= p_start)
          and (p_end   is null or created_at <= p_end)
      ) x
    ) y
    group by band, sort
  ) b;
$$;

revoke all on function public.lead_intent_distribution(timestamptz, timestamptz) from public;
grant execute on function public.lead_intent_distribution(timestamptz, timestamptz)
  to authenticated, service_role;


-- ------------------------------------------------------------
-- 8. Extend get_leads_list with the live intent score
--    (replaces the 005 definition — same signature, extra column)
-- ------------------------------------------------------------
create or replace function public.get_leads_list(
  p_stage  text        default null,
  p_source text        default null,
  p_start  timestamptz default null,
  p_end    timestamptz default null,
  p_limit  int         default 100,
  p_offset int         default 0
)
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
    'rows', (
      select coalesce(json_agg(row_to_json(t)), '[]'::json)
      from (
        select
          id, created_at, first_name, last_name, email,
          stage::text, source, score, archetype, tag, location,
          public.compute_lead_intent(stage::text, tag) as intent_score
        from public.jobhackers_leads
        where (p_stage  is null or stage::text = p_stage)
          and (p_source is null or source      = p_source)
          and (p_start  is null or created_at  >= p_start)
          and (p_end    is null or created_at  <= p_end)
        order by created_at desc
        limit  p_limit
        offset p_offset
      ) t
    ),
    'total', (
      select count(*)::int
      from public.jobhackers_leads
      where (p_stage  is null or stage::text = p_stage)
        and (p_source is null or source      = p_source)
        and (p_start  is null or created_at  >= p_start)
        and (p_end    is null or created_at  <= p_end)
    )
  );
$$;

revoke all on function public.get_leads_list(text, text, timestamptz, timestamptz, int, int) from public;
grant execute on function public.get_leads_list(text, text, timestamptz, timestamptz, int, int)
  to authenticated, service_role;


-- ------------------------------------------------------------
-- 9. RLS — authenticated dashboard users manage the weights
-- ------------------------------------------------------------
alter table public.lead_intent_stage_weights enable row level security;
alter table public.lead_intent_tag_rules     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['lead_intent_stage_weights', 'lead_intent_tag_rules'] loop
    execute format('drop policy if exists "authenticated read %1$s"  on public.%1$I', t);
    execute format('drop policy if exists "authenticated write %1$s" on public.%1$I', t);
    execute format('create policy "authenticated read %1$s"  on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "authenticated write %1$s" on public.%1$I for all    to authenticated using (true) with check (true)', t);
  end loop;
end $$;

grant select, insert, update, delete on public.lead_intent_stage_weights to authenticated;
grant select, insert, update, delete on public.lead_intent_tag_rules     to authenticated;
grant all on public.lead_intent_stage_weights to service_role;
grant all on public.lead_intent_tag_rules     to service_role;

grant execute on function public.normalize_tag(text)             to authenticated, service_role;
grant execute on function public.lead_tag_weight(text)           to authenticated, service_role;
grant execute on function public.compute_lead_intent(text, text) to authenticated, service_role;
grant execute on function public.lead_intent_matched_rules(text) to authenticated, service_role;
