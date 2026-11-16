-- Complète le catalogue tennis sans dupliquer les critères existants.
-- Le catalogue reste propre à chaque coach et l'ordre affiché devient alphabétique.
with target_coaches as (
  select p.id
  from public.profiles p
  where p.role='coach'
    and exists (select 1 from public.criteria_catalog cc where cc.coach_id=p.id)
),
new_rows(main_theme,subtheme,criterion,criterion_type) as (
  values
  ('Service','Service','Lancer de balle régulier','positive'),
  ('Service','Service','Lancer latéral prononcé','positive'),
  ('Service','Service','Coordination entre le lancer et la frappe','positive'),
  ('Service','Service','Point d’impact haut et devant','positive'),
  ('Service','Service','Extension complète à la frappe','positive'),
  ('Service','Service','Flexion-extension coordonnée des jambes','positive'),
  ('Service','Service','Relâchement du bras et de l’épaule','positive'),
  ('Service','Service','Équilibre conservé après la frappe','positive'),
  ('Service','Service','Lancer de balle irrégulier','improvement'),
  ('Service','Service','Lancer trop bas','improvement'),
  ('Service','Service','Lancer trop haut','improvement'),
  ('Service','Service','Coude trop bas pendant la préparation','improvement'),
  ('Service','Service','Préparation de raquette trop tardive','improvement'),
  ('Service','Service','Rupture de rythme entre préparation et frappe','improvement'),
  ('Service','Service','Point d’impact trop bas','improvement'),
  ('Service','Service','Point d’impact trop en arrière','improvement'),
  ('Service','Service','Extension insuffisante à la frappe','improvement'),
  ('Service','Service','Déséquilibre après la frappe','improvement'),
  ('Revers','Critères communs','Accompagnement insuffisant après l’impact','improvement'),
  ('Revers','Critères communs','Distance balle-corps mal ajustée','improvement'),
  ('Revers','Critères communs','Manque de régularité','improvement'),
  ('Revers','Critères communs','Plan de frappe trop tardif','improvement'),
  ('Revers','Critères communs','Préparation de raquette tardive','improvement'),
  ('Revers','Critères communs','Prise de balle trop basse','improvement'),
  ('Revers','Critères communs','Stabilité insuffisante à l’impact','improvement'),
  ('Revers','Critères communs','Transfert du poids du corps insuffisant','improvement'),
  ('Revers','Revers à une main','Extension du bras directeur insuffisante','improvement'),
  ('Revers','Revers à une main','Stabilité du poignet insuffisante à l’impact','improvement'),
  ('Revers','Revers à une main','Relâchement du bras directeur insuffisant','improvement'),
  ('Revers','Revers à deux mains','Coordination des deux bras insuffisante','improvement'),
  ('Revers','Revers à deux mains','Participation du bras non directeur insuffisante','improvement'),
  ('Revers','Revers à deux mains','Structure des deux bras instable à l’impact','improvement')
),
inserted as (
  insert into public.criteria_catalog(coach_id,main_theme,subtheme,criterion,criterion_type,display_order)
  select c.id,n.main_theme,n.subtheme,n.criterion,n.criterion_type,0
  from target_coaches c cross join new_rows n
  where not exists (
    select 1 from public.criteria_catalog existing
    where existing.coach_id=c.id
      and existing.main_theme=n.main_theme
      and existing.subtheme=n.subtheme
      and existing.criterion=n.criterion
      and existing.criterion_type=n.criterion_type
  )
  returning id
)
delete from public.criteria_catalog c
using target_coaches co
where c.coach_id=co.id
  and c.main_theme='Mental'
  and c.subtheme='Attitude en match'
  and c.criterion in ('Respect des routines entre les points','Manque de respect des routines')
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
