-- ============================================================
-- Migration 015: Inactivity decay
--
-- Buying intent is perishable. Someone who completed the quiz and
-- opened coaching last week is not the same prospect as someone who
-- did it a year ago and has been silent since — but until now they
-- scored identically.
--
-- Decay applies at the PERSON grain only, based on last_seen.
-- Row-level scores are untouched: a row is a single event with a fixed
-- date, so "this event was worth +20" stays true forever. It's the
-- PERSON who goes cold, not the event.
--
-- The invariant from 013 is preserved: decay reduces a positive score
-- toward 0 but never flips its sign. Only the churn stage goes negative.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Decay tiers — highest matching tier wins (not cumulative)
-- ------------------------------------------------------------
create table if not exists public.lead_intent_decay_rules (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  min_months int  not null check (min_months > 0),
  penalty    int  not null check (penalty <= 0),
  enabled    boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lead_intent_decay_rules_months_uq
  on public.lead_intent_decay_rules (min_months);

comment on table public.lead_intent_decay_rules is
  'Inactivity penalties by months since last interaction. Highest matching tier applies; penalties are negative.';

insert into public.lead_intent_decay_rules (label, min_months, penalty) values
  ('Going quiet',  3,  -10),
  ('Cold',         6,  -25),
  ('Dormant',     12,  -40)
on conflict (min_months) do nothing;


-- ------------------------------------------------------------
-- 2. Resolve the penalty for a given last-seen timestamp
-- ------------------------------------------------------------
create or replace function public.lead_decay_penalty(p_last_seen timestamptz)
returns int
language sql
stable
as $$
  select coalesce((
    select r.penalty
    from public.lead_intent_decay_rules r
    where r.enabled
      and p_last_seen is not null
      and p_last_seen <= now() - make_interval(months => r.min_months)
    order by r.min_months desc
    limit 1
  ), 0)::int;
$$;

-- Whole COMPLETED calendar months since the last interaction.
--
-- Must use the same calendar arithmetic as lead_decay_penalty, which
-- compares against make_interval(months => n). A 30-day approximation
-- diverges: 89 days is 2.97 "months", and ::int ROUNDS that to 3, so a
-- lead would read "3 months inactive" while correctly taking no penalty.
-- age() + year*12+month floors to completed months and lines the two up.
create or replace function public.lead_months_inactive(p_last_seen timestamptz)
returns int
language sql
stable
as $$
  select case
           when p_last_seen is null then 0
           else greatest(0, (
             extract(year  from age(now(), p_last_seen))::int * 12 +
             extract(month from age(now(), p_last_seen))::int
           ))
         end;
$$;


-- ------------------------------------------------------------
-- 3. Person-level scoring, decay included.
--    Separate name from compute_intent_from_parts so the 2-arg
--    row-level function keeps working with no signature ambiguity.
-- ------------------------------------------------------------
create or replace function public.compute_person_intent(
  p_stage      text,
  p_tag_points int,
  p_decay      int
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
           ) + coalesce(p_tag_points, 0) + coalesce(p_decay, 0) as raw
  )
  select case
           when p_stage = 'churn' then least(-abs(raw), -1)
           else greatest(raw, 0)     -- decay erodes toward 0, never past it
         end::int
  from base;
$$;


-- ------------------------------------------------------------
-- 4. Rebuild the people view with decay applied
--    (drop first: intent_score changes meaning and new columns are
--     inserted mid-list, which CREATE OR REPLACE VIEW disallows)
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
tagpts as (
  select person_email, coalesce(sum(w), 0)::int as tag_points
  from (
    select distinct person_email, ntag, public.lead_tag_weight(ntag) as w
    from ev
    where ntag is not null
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
  -- Score before decay, so the UI can show what inactivity cost
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
  'One row per unique email. Stage = furthest reached (churn overrides), tags distinct, intent decayed by inactivity.';

grant select on public.lead_people to authenticated, service_role;


-- ------------------------------------------------------------
-- 5. Recreate dependents dropped with the view
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

revoke all on function public.get_people_list(text, text, text, timestamptz, timestamptz, int, text, int, int) from public;
grant execute on function public.get_people_list(text, text, text, timestamptz, timestamptz, int, text, int, int)
  to authenticated, service_role;


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


-- ------------------------------------------------------------
-- 6. RLS
-- ------------------------------------------------------------
alter table public.lead_intent_decay_rules enable row level security;

drop policy if exists "authenticated read decay"  on public.lead_intent_decay_rules;
drop policy if exists "authenticated write decay" on public.lead_intent_decay_rules;
create policy "authenticated read decay"  on public.lead_intent_decay_rules
  for select to authenticated using (true);
create policy "authenticated write decay" on public.lead_intent_decay_rules
  for all    to authenticated using (true) with check (true);

grant select, insert, update, delete on public.lead_intent_decay_rules to authenticated;
grant all on public.lead_intent_decay_rules to service_role;

grant execute on function public.lead_decay_penalty(timestamptz)          to authenticated, service_role;
grant execute on function public.lead_months_inactive(timestamptz)        to authenticated, service_role;
grant execute on function public.compute_person_intent(text, int, int)    to authenticated, service_role;
