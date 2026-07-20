-- ============================================================
-- Migration 016: Per-tag count mode — cumulative vs distinct
--
-- Until now person-level tag scoring was DISTINCT: a behaviour counted
-- once no matter how often it recurred. This makes that a per-behaviour
-- switch, defaulting to CUMULATIVE (every occurrence counts).
--
--   cumulative — weight × number of times the person did it
--   distinct   — weight once, however many times they did it
--
-- Mode lives on the tag rule alongside weight, and resolves per tag with
-- the same exact-overrides-like precedence as weight:
--   • an exact (pinned) rule's mode wins outright
--   • otherwise the highest-weight matching 'like' rule decides
--   • no rule at all → cumulative (the default)
--
-- Row-level scoring (the Leads table) is unaffected: a row is a single
-- event scored once, so cumulative vs distinct is meaningless there.
-- Only the People grain, where occurrences aggregate, changes.
--
-- NOTE: defaulting to cumulative shifts existing People scores upward for
-- anyone who repeated a behaviour (e.g. 5× the same webinar RSVP goes
-- from +5 to +25). Flip high-frequency behaviours to distinct to tame it.
-- ============================================================


-- ------------------------------------------------------------
-- 1. count_mode column (idempotent)
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lead_intent_tag_rules'
      and column_name = 'count_mode'
  ) then
    alter table public.lead_intent_tag_rules
      add column count_mode text not null default 'cumulative';
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'lead_intent_tag_rules_count_mode_chk'
  ) then
    alter table public.lead_intent_tag_rules
      add constraint lead_intent_tag_rules_count_mode_chk
      check (count_mode in ('cumulative', 'distinct'));
  end if;
end $$;


-- ------------------------------------------------------------
-- 2. Resolve a tag's mode — exact overrides like, highest weight wins
-- ------------------------------------------------------------
create or replace function public.lead_tag_mode(p_tag text)
returns text
language sql
stable
as $$
  with n as (select public.normalize_tag(p_tag) as tag),
  exact_rule as (
    select r.count_mode
    from public.lead_intent_tag_rules r, n
    where r.enabled and r.match_type = 'exact' and n.tag = r.pattern
    order by r.weight desc
    limit 1
  ),
  like_rule as (
    select r.count_mode
    from public.lead_intent_tag_rules r, n
    where r.enabled and r.match_type = 'like' and n.tag like r.pattern
    order by r.weight desc
    limit 1
  )
  select coalesce(
    (select count_mode from exact_rule),
    (select count_mode from like_rule),
    'cumulative'
  );
$$;


-- ------------------------------------------------------------
-- 3. matched-rules helper now carries mode too
-- ------------------------------------------------------------
create or replace function public.lead_intent_matched_rules(p_tag text)
returns json
language sql
stable
as $$
  with n as (select public.normalize_tag(p_tag) as tag),
  matched as (
    select r.id, r.label, r.pattern, r.match_type, r.weight, r.count_mode
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
           'match_type', match_type, 'weight', weight, 'count_mode', count_mode
         ) order by weight desc), '[]'::json)
  from winning;
$$;


-- ------------------------------------------------------------
-- 4. Rebuild the people view with mode-aware tag scoring
-- ------------------------------------------------------------
drop view if exists public.lead_people;

create view public.lead_people as
with stage_ord as (
  select t.label::text as stage_key, t.ord::int as ord
  from unnest(enum_range(null::public.lead_stage)) with ordinality as t(label, ord)
),
ev as (
  select
    lower(btrim(l.email))        as person_email,
    l.id,
    l.first_name, l.last_name, l.location, l.archetype, l.source, l.score,
    l.stage::text                as stage_key,
    so.ord                       as stage_ord,
    l.tag,
    public.normalize_tag(l.tag)  as ntag,
    l.created_at
  from public.jobhackers_leads l
  join stage_ord so on so.stage_key = l.stage::text
  where l.email is not null and btrim(l.email) <> ''
),
latest as (
  select distinct on (person_email)
    person_email, stage_key as latest_stage, created_at as latest_at
  from ev
  order by person_email, created_at desc, id desc
),
furthest as (
  select distinct on (person_email)
    person_email, stage_key as furthest_stage, stage_ord as furthest_ord
  from ev
  where stage_key <> 'churn'
  order by person_email, stage_ord desc, created_at desc
),
-- Per (person, tag): count once (distinct) or per-occurrence (cumulative)
tagpts as (
  select person_email, coalesce(sum(contribution), 0)::int as tag_points
  from (
    select
      person_email,
      ntag,
      case when public.lead_tag_mode(ntag) = 'cumulative'
           then public.lead_tag_weight(ntag) * count(*)
           else public.lead_tag_weight(ntag)
      end as contribution
    from ev
    where ntag is not null
    group by person_email, ntag
  ) d
  group by person_email
),
ident as (
  select
    person_email,
    (array_agg(first_name order by created_at desc)
       filter (where first_name is not null and btrim(first_name) <> ''))[1] as first_name,
    (array_agg(last_name  order by created_at desc)
       filter (where last_name  is not null and btrim(last_name)  <> ''))[1] as last_name,
    (array_agg(location   order by created_at desc)
       filter (where location   is not null and btrim(location)   <> ''))[1] as location,
    (array_agg(archetype  order by created_at desc)
       filter (where archetype  is not null and btrim(archetype)  <> ''))[1] as archetype,
    max(score)::int                                    as best_quiz_score,
    count(*)::int                                      as interaction_count,
    count(distinct ntag)::int                          as distinct_tags,
    min(created_at)                                    as first_seen,
    max(created_at)                                    as last_seen,
    array_agg(distinct source) filter (where source is not null) as sources
  from ev
  group by person_email
)
select
  i.person_email                                        as email,
  nullif(btrim(concat_ws(' ', i.first_name, i.last_name)), '') as full_name,
  i.first_name,
  i.last_name,
  i.location,
  i.archetype,
  i.best_quiz_score,
  i.interaction_count,
  i.distinct_tags,
  i.first_seen,
  i.last_seen,
  i.sources,
  l.latest_stage,
  coalesce(f.furthest_stage, l.latest_stage)            as furthest_stage,
  (l.latest_stage = 'churn')                            as is_churned,
  case when l.latest_stage = 'churn'
       then 'churn'
       else coalesce(f.furthest_stage, l.latest_stage)
  end                                                   as effective_stage,
  coalesce(t.tag_points, 0)                             as tag_points,
  public.lead_months_inactive(i.last_seen)              as months_inactive,
  public.lead_decay_penalty(i.last_seen)                as decay_penalty,
  (public.lead_decay_penalty(i.last_seen) <> 0)         as is_decayed,
  public.compute_person_intent(
    case when l.latest_stage = 'churn' then 'churn'
         else coalesce(f.furthest_stage, l.latest_stage) end,
    coalesce(t.tag_points, 0), 0
  )                                                     as intent_before_decay,
  public.compute_person_intent(
    case when l.latest_stage = 'churn' then 'churn'
         else coalesce(f.furthest_stage, l.latest_stage) end,
    coalesce(t.tag_points, 0),
    public.lead_decay_penalty(i.last_seen)
  )                                                     as intent_score
from ident i
join      latest   l on l.person_email = i.person_email
left join furthest f on f.person_email = i.person_email
left join tagpts   t on t.person_email = i.person_email;

comment on view public.lead_people is
  'One row per unique email. Tags scored per count_mode (cumulative default), stage = furthest reached (churn overrides), intent decayed by inactivity.';

grant select on public.lead_people to authenticated, service_role;


-- ------------------------------------------------------------
-- 5. Timeline: mode-aware per-event points
--    cumulative → every occurrence contributes weight
--    distinct   → only the first occurrence contributes; rest are +0
-- ------------------------------------------------------------
create or replace function public.get_person_timeline(p_email text)
returns json
language sql
security definer
set search_path = public
stable
as $$
  with ev as (
    select
      l.id,
      l.created_at,
      l.stage::text               as stage,
      l.source,
      l.tag,
      public.normalize_tag(l.tag) as ntag,
      l.score                     as quiz_score,
      row_number() over (
        partition by public.normalize_tag(l.tag)
        order by l.created_at, l.id
      ) as occurrence
    from public.jobhackers_leads l
    where lower(btrim(l.email)) = lower(btrim(p_email))
  )
  select json_build_object(
    'email', lower(btrim(p_email)),
    'person', (select row_to_json(p) from public.lead_people p
                where p.email = lower(btrim(p_email))),
    'timeline', (
      select coalesce(json_agg(row_to_json(t) order by t.created_at), '[]'::json)
      from (
        select
          e.id, e.created_at, e.stage, e.source, e.tag, e.ntag, e.quiz_score,
          e.occurrence,
          public.lead_tag_mode(e.ntag)                as count_mode,
          coalesce(public.lead_tag_weight(e.ntag), 0) as tag_weight,
          (e.ntag is not null
             and (public.lead_tag_mode(e.ntag) = 'cumulative' or e.occurrence = 1)) as counted,
          case
            when e.ntag is null then 0
            when public.lead_tag_mode(e.ntag) = 'cumulative'
              then coalesce(public.lead_tag_weight(e.ntag), 0)
            when e.occurrence = 1
              then coalesce(public.lead_tag_weight(e.ntag), 0)
            else 0
          end                                         as points_contributed,
          public.lead_intent_matched_rules(e.ntag)    as matched_rules
        from ev e
      ) t
    )
  );
$$;

revoke all on function public.get_person_timeline(text) from public;
grant execute on function public.get_person_timeline(text) to authenticated, service_role;


-- ------------------------------------------------------------
-- 6. Config RPC surfaces mode on rules and per resolved tag
-- ------------------------------------------------------------
create or replace function public.lead_intent_config()
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
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
    'tags', (
      select coalesce(json_agg(row_to_json(t) order by t.lead_count desc), '[]'::json)
      from (
        select
          coalesce(public.normalize_tag(l.tag), '(untagged)') as tag,
          min(l.tag)                                          as sample_raw,
          count(*)::int                                       as lead_count,
          public.lead_tag_weight(min(l.tag))                  as weight,
          public.lead_tag_mode(min(l.tag))                    as count_mode,
          public.lead_intent_matched_rules(min(l.tag))        as matched_rules
        from public.jobhackers_leads l
        group by 1
      ) t
    ),
    'rules', (
      select coalesce(json_agg(row_to_json(r) order by r.weight desc, r.label), '[]'::json)
      from (
        select id, label, pattern, match_type, weight, enabled, count_mode
        from public.lead_intent_tag_rules
      ) r
    )
  );
$$;

revoke all on function public.lead_intent_config() from public;
grant execute on function public.lead_intent_config() to authenticated, service_role;


grant execute on function public.lead_tag_mode(text) to authenticated, service_role;
