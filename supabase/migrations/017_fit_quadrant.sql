-- ============================================================
-- Migration 017: Fit score + intent×fit quadrant
--
-- Adds the SECOND axis. Buying intent (stage + tags, decayed) answers
-- "how ready are they to buy". Fit answers "are they the right customer",
-- and it comes ONLY from the quiz — we never infer it from behaviour.
--
-- Reality of the data: only ~17 of ~1,536 people ever took the Compass
-- quiz, so fit is NULL for everyone else. Those people are deliberately
-- NOT forced onto the fit axis — they surface as "fit unknown", whose
-- action is to get them to take the quiz.
--
-- Fit is strictly the quiz's ICP verdict:
--   • grade A–E if present  (A=90 … E=20)
--   • else quiz_answers.fit  (qualified=75, below-icp=25)
--   • else NULL — no quiz, no fit
-- readiness/heat/score are INTENT signals and are intentionally excluded
-- from fit so the two axes stay independent.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Fit score from quiz output — 0..100, or NULL when no quiz
-- ------------------------------------------------------------
create or replace function public.lead_fit_score(p_quiz jsonb, p_grade text)
returns int
language sql
immutable
as $$
  select coalesce(
    case upper(coalesce(p_grade, ''))
      when 'A' then 90 when 'B' then 75 when 'C' then 60
      when 'D' then 40 when 'E' then 20 else null end,
    case lower(coalesce(p_quiz->>'fit', ''))
      when 'qualified' then 75
      when 'below-icp' then 25
      else null end
  );
$$;

-- Shared threshold constants (functions so SQL + RPC agree)
create or replace function public.intent_high_threshold() returns int language sql immutable as $$ select 40 $$;
create or replace function public.fit_high_threshold()    returns int language sql immutable as $$ select 50 $$;


-- ------------------------------------------------------------
-- 2. Rebuild the people view with fit columns
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
    l.grade,
    l.quiz_answers,
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
tagpts as (
  select person_email, coalesce(sum(contribution), 0)::int as tag_points
  from (
    select
      person_email, ntag,
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
-- Most recent row that carries any quiz signal = the person's fit
quizdata as (
  select
    person_email, quiz_answers, grade, fit_score,
    case when fit_score is null then null
         when fit_score >= public.fit_high_threshold() then 'high'
         else 'low' end as fit_band
  from (
    select distinct on (person_email)
      person_email, quiz_answers, grade,
      public.lead_fit_score(quiz_answers, grade) as fit_score
    from ev
    where quiz_answers is not null or grade is not null
    order by person_email, created_at desc
  ) z
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
  )                                                     as intent_score,
  -- Fit axis (NULL when the person never took the quiz)
  q.fit_score,
  q.fit_band,
  (q.fit_score is not null)                             as has_quiz,
  q.grade                                               as quiz_grade,
  nullif(q.quiz_answers->>'readiness','')::int          as quiz_readiness,
  q.quiz_answers->>'heat'                               as quiz_heat
from ident i
join      latest   l on l.person_email = i.person_email
left join furthest f on f.person_email = i.person_email
left join tagpts   t on t.person_email = i.person_email
left join quizdata q on q.person_email = i.person_email;

comment on view public.lead_people is
  'One row per unique email. Intent = stage + tags (decayed); fit = quiz ICP verdict (NULL if no quiz).';

grant select on public.lead_people to authenticated, service_role;


-- ------------------------------------------------------------
-- 3. Quadrant summary — counts per segment + the unknown-fit bucket
-- ------------------------------------------------------------
create or replace function public.people_quadrant()
returns json
language sql
security definer
set search_path = public
stable
as $$
  with scored as (
    select
      fit_band,
      (intent_score >= public.intent_high_threshold()) as intent_high
    from public.lead_people
    where fit_band is not null
  ),
  seg as (
    select
      case
        when fit_band = 'high' and intent_high      then 'priority'
        when fit_band = 'high' and not intent_high  then 'nurture'
        when fit_band = 'low'  and intent_high      then 'qualify'
        else 'disqualify'
      end as segment,
      count(*)::int as n
    from scored
    group by 1
  ),
  keys(segment) as (values ('priority'),('nurture'),('qualify'),('disqualify'))
  select json_build_object(
    'thresholds', json_build_object(
      'intent', public.intent_high_threshold(),
      'fit',    public.fit_high_threshold()
    ),
    'total_people', (select count(*)::int from public.lead_people),
    'scored',       (select count(*)::int from public.lead_people where fit_band is not null),
    'unknown_fit',  (select count(*)::int from public.lead_people where fit_band is null),
    'segments', (
      select json_agg(json_build_object('segment', k.segment, 'count', coalesce(s.n, 0)))
      from keys k left join seg s on s.segment = k.segment
    )
  );
$$;

revoke all on function public.people_quadrant() from public;
grant execute on function public.people_quadrant() to authenticated, service_role;


-- ------------------------------------------------------------
-- 4. get_people_list gains fit + intent band filters (for drill-down)
--    Signature changes, so drop the old one explicitly.
-- ------------------------------------------------------------
-- Drop BOTH the prior 9-arg signature (015) and this migration's own
-- 11-arg signature, so a replay after 017 has run still drops cleanly.
drop function if exists public.get_people_list(text, text, text, timestamptz, timestamptz, int, text, int, int);
drop function if exists public.get_people_list(text, text, text, timestamptz, timestamptz, int, text, text, text, int, int);

create function public.get_people_list(
  p_search       text        default null,
  p_stage        text        default null,
  p_source       text        default null,
  p_start        timestamptz default null,
  p_end          timestamptz default null,
  p_min_intent   int         default null,
  p_sort         text        default 'intent',
  p_fit_band     text        default null,   -- 'high' | 'low' | 'unknown'
  p_intent_band  text        default null,   -- 'high' | 'low'
  p_limit        int         default 50,
  p_offset       int         default 0
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
      and (p_fit_band   is null
             or (p_fit_band = 'unknown' and p.fit_band is null)
             or (p_fit_band in ('high','low') and p.fit_band = p_fit_band))
      and (p_intent_band is null
             or (p_intent_band = 'high' and p.intent_score >= public.intent_high_threshold())
             or (p_intent_band = 'low'  and p.intent_score <  public.intent_high_threshold()))
  )
  select json_build_object(
    'rows', (
      select coalesce(json_agg(row_to_json(t)), '[]'::json)
      from (
        select * from filtered
        order by
          case when p_sort = 'intent'       then intent_score      end desc nulls last,
          case when p_sort = 'fit'          then fit_score          end desc nulls last,
          case when p_sort = 'interactions' then interaction_count end desc nulls last,
          case when p_sort = 'last_seen'    then last_seen         end desc nulls last,
          case when p_sort = 'first_seen'   then first_seen        end desc nulls last,
          case when p_sort = 'decayed'      then decay_penalty     end asc  nulls last,
          intent_score desc, last_seen desc
        limit p_limit offset p_offset
      ) t
    ),
    'total',        (select count(*)::int from filtered),
    'total_people', (select count(*)::int from public.lead_people),
    'total_decayed',(select count(*)::int from public.lead_people where is_decayed)
  );
$$;

revoke all on function public.get_people_list(text, text, text, timestamptz, timestamptz, int, text, text, text, int, int) from public;
grant execute on function public.get_people_list(text, text, text, timestamptz, timestamptz, int, text, text, text, int, int)
  to authenticated, service_role;


grant execute on function public.lead_fit_score(jsonb, text)      to authenticated, service_role;
grant execute on function public.intent_high_threshold()          to authenticated, service_role;
grant execute on function public.fit_high_threshold()             to authenticated, service_role;
