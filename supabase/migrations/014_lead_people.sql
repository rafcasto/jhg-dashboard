-- ============================================================
-- Migration 014: People view — unique leads and their interactions
--
-- public.jobhackers_leads is an EVENT LOG, not a lead table:
-- ~1,706 rows represent ~1,536 people. Each row is one interaction.
-- Migration 013 scores a single ROW, which is the wrong grain for
-- "who should I contact today". This adds the person grain.
--
-- Person-level rules:
--   • identity  — most recent non-null name/location/archetype wins
--   • stage     — the FURTHEST stage ever reached, not the latest one.
--                 Event stages are not monotonic (clicking an old
--                 onboarding email logs an 'activation' row long after
--                 someone reached 'retention'), so "latest" would
--                 demote your most engaged people.
--   • churn     — overrides the above. If the MOST RECENT event is
--                 'churn', the person is churned and scores negative.
--                 Churn is a state you are in, not a milestone passed.
--   • tags      — DISTINCT behaviours only. Five webinar RSVPs score
--                 +5 once, not +25. 1,475 of 1,706 rows are RSVPs, so
--                 cumulative scoring would flood the top of the list
--                 with people who never touched the product.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Split the churn/positive rule out so row-level and person-level
--    scoring share one definition instead of drifting apart.
-- ------------------------------------------------------------
create or replace function public.compute_intent_from_parts(
  p_stage      text,
  p_tag_points int
)
returns int
language sql
stable
as $$
  with base as (
    select coalesce(
             (select w.weight from public.lead_intent_stage_weights w
               where w.stage_key = p_stage),
             0
           ) + coalesce(p_tag_points, 0) as raw
  )
  select case
           when p_stage = 'churn' then least(-abs(raw), -1)
           else greatest(raw, 0)
         end::int
  from base;
$$;

-- Row-level scoring now delegates, so the invariants can't diverge
create or replace function public.compute_lead_intent(p_stage text, p_tag text)
returns int
language sql
stable
as $$
  select public.compute_intent_from_parts(p_stage, public.lead_tag_weight(p_tag));
$$;


-- ------------------------------------------------------------
-- 2. The people view — one row per unique email
-- ------------------------------------------------------------
create or replace view public.lead_people as
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
-- Most recent event decides churn status
latest as (
  select distinct on (person_email)
    person_email, stage_key as latest_stage, created_at as latest_at
  from ev
  order by person_email, created_at desc, id desc
),
-- Deepest non-churn stage ever reached
furthest as (
  select distinct on (person_email)
    person_email, stage_key as furthest_stage, stage_ord as furthest_ord
  from ev
  where stage_key <> 'churn'
  order by person_email, stage_ord desc, created_at desc
),
-- DISTINCT tag behaviours only — each scores once
tagpts as (
  select person_email, coalesce(sum(w), 0)::int as tag_points
  from (
    select distinct person_email, ntag, public.lead_tag_weight(ntag) as w
    from ev
    where ntag is not null
  ) d
  group by person_email
),
-- Identity: newest non-null value for each field
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
  -- The stage the person is actually scored on
  case when l.latest_stage = 'churn'
       then 'churn'
       else coalesce(f.furthest_stage, l.latest_stage)
  end                                                   as effective_stage,
  coalesce(t.tag_points, 0)                             as tag_points,
  public.compute_intent_from_parts(
    case when l.latest_stage = 'churn'
         then 'churn'
         else coalesce(f.furthest_stage, l.latest_stage)
    end,
    coalesce(t.tag_points, 0)
  )                                                     as intent_score
from ident i
join      latest   l on l.person_email = i.person_email
left join furthest f on f.person_email = i.person_email
left join tagpts   t on t.person_email = i.person_email;

comment on view public.lead_people is
  'One row per unique email. Stage = furthest reached (churn overrides), tags counted distinctly.';


-- ------------------------------------------------------------
-- 3. Paginated people list
-- ------------------------------------------------------------
create or replace function public.get_people_list(
  p_search     text        default null,
  p_stage      text        default null,
  p_source     text        default null,
  p_start      timestamptz default null,
  p_end        timestamptz default null,
  p_min_intent int         default null,
  p_sort       text        default 'intent',
  p_limit      int         default 50,
  p_offset     int         default 0
)
returns json
language sql
security definer
set search_path = public
stable
as $$
  with filtered as (
    select *
    from public.lead_people p
    where (p_search     is null or p_search = ''
             or p.email ilike '%' || p_search || '%'
             or coalesce(p.full_name, '') ilike '%' || p_search || '%')
      and (p_stage      is null or p.effective_stage = p_stage)
      and (p_source     is null or p_source = any(p.sources))
      and (p_start      is null or p.last_seen  >= p_start)
      and (p_end        is null or p.first_seen <= p_end)
      and (p_min_intent is null or p.intent_score >= p_min_intent)
  )
  select json_build_object(
    'rows', (
      select coalesce(json_agg(row_to_json(t)), '[]'::json)
      from (
        select * from filtered
        order by
          case when p_sort = 'intent'       then intent_score      end desc nulls last,
          case when p_sort = 'interactions' then interaction_count end desc nulls last,
          case when p_sort = 'last_seen'    then last_seen         end desc nulls last,
          case when p_sort = 'first_seen'   then first_seen        end desc nulls last,
          intent_score desc, last_seen desc
        limit p_limit offset p_offset
      ) t
    ),
    'total',       (select count(*)::int from filtered),
    'total_people',(select count(*)::int from public.lead_people)
  );
$$;

revoke all on function public.get_people_list(text, text, text, timestamptz, timestamptz, int, text, int, int) from public;
grant execute on function public.get_people_list(text, text, text, timestamptz, timestamptz, int, text, int, int)
  to authenticated, service_role;


-- ------------------------------------------------------------
-- 4. One person's full interaction timeline
--    Flags repeats: with distinct scoring, only the FIRST occurrence
--    of a tag contributes points. The UI shows the rest as +0 repeats
--    so the arithmetic is auditable.
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
          (e.ntag is not null and e.occurrence = 1)            as counted,
          coalesce(public.lead_tag_weight(e.ntag), 0)          as tag_weight,
          case when e.ntag is not null and e.occurrence = 1
               then coalesce(public.lead_tag_weight(e.ntag), 0)
               else 0 end                                     as points_contributed,
          public.lead_intent_matched_rules(e.ntag)             as matched_rules
        from ev e
      ) t
    )
  );
$$;

revoke all on function public.get_person_timeline(text) from public;
grant execute on function public.get_person_timeline(text) to authenticated, service_role;


-- ------------------------------------------------------------
-- 5. Person-grain band distribution (mirrors lead_intent_distribution)
-- ------------------------------------------------------------
create or replace function public.people_intent_distribution()
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
               when intent_score < 0  then 'churned'
               when intent_score < 20 then 'cold'
               when intent_score < 40 then 'warm'
               when intent_score < 70 then 'hot'
               else                        'sales_ready'
             end as band,
             case
               when intent_score < 0  then 0
               when intent_score < 20 then 1
               when intent_score < 40 then 2
               when intent_score < 70 then 3
               else                        4
             end as sort
      from public.lead_people
    ) x
    group by band, sort
  ) b;
$$;

revoke all on function public.people_intent_distribution() from public;
grant execute on function public.people_intent_distribution() to authenticated, service_role;


grant select on public.lead_people to authenticated, service_role;
grant execute on function public.compute_intent_from_parts(text, int) to authenticated, service_role;
