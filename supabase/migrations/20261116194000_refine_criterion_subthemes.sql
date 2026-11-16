-- Nettoie les critères mal rangés ou redondants et équilibre les sous-thèmes.
with target_coaches as (
  select p.id from public.profiles p
  where p.role='coach'
    and exists (select 1 from public.criteria_catalog cc where cc.coach_id=p.id)
),
new_rows(main_theme,subtheme,criterion,criterion_type) as (
  values
  ('Revers','Variations lift / balle à plat / slice','Variation des effets insuffisante','improvement'),
  ('Revers','Variations lift / balle à plat / slice','Difficulté à varier les trajectoires et les hauteurs','improvement')
)
insert into public.criteria_catalog(coach_id,main_theme,subtheme,criterion,criterion_type,display_order)
select tc.id,n.main_theme,n.subtheme,n.criterion,n.criterion_type,0
from target_coaches tc cross join new_rows n
where not exists (
  select 1 from public.criteria_catalog c
  where c.coach_id=tc.id and c.main_theme=n.main_theme
    and c.subtheme=n.subtheme and c.criterion=n.criterion
    and c.criterion_type=n.criterion_type
);

with target_coaches as (
  select p.id from public.profiles p
  where p.role='coach'
    and exists (select 1 from public.criteria_catalog cc where cc.coach_id=p.id)
)
delete from public.criteria_catalog c
using target_coaches tc
where c.coach_id=tc.id
  and c.main_theme='Mental'
  and c.subtheme='Attitude en match'
  and c.criterion='Baisse d’engagement pendant le match'
  and not exists (select 1 from public.evaluation_criteria ec where ec.criterion_id=c.id);

with target_coaches as (
  select p.id from public.profiles p
  where p.role='coach'
    and exists (select 1 from public.criteria_catalog cc where cc.coach_id=p.id)
)
delete from public.criteria_catalog c
using target_coaches tc
where c.coach_id=tc.id
  and c.main_theme='Volée'
  and (
    (c.subtheme='Volée de coup droit' and c.criterion in ('Régularité insuffisante en volée de revers','Régularité en volée de revers'))
    or
    (c.subtheme='Volée de revers' and c.criterion in ('Régularité insuffisante en volée de coup droit','Régularité en volée de coup droit'))
  )
  and not exists (select 1 from public.evaluation_criteria ec where ec.criterion_id=c.id);

with target_coaches as (
  select p.id from public.profiles p
  where p.role='coach'
    and exists (select 1 from public.criteria_catalog cc where cc.coach_id=p.id)
),
ranked as (
  select c.id,
    row_number() over (
      partition by c.coach_id
      order by c.main_theme collate "fr-FR-x-icu",
               c.subtheme collate "fr-FR-x-icu",
               c.criterion_type,
               c.criterion collate "fr-FR-x-icu"
    )::integer as position
  from public.criteria_catalog c
  join target_coaches tc on tc.id=c.coach_id
)
update public.criteria_catalog c
set display_order=ranked.position
from ranked
where c.id=ranked.id;
