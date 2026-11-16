insert into public.criteria_catalog (coach_id, main_theme, subtheme, criterion, criterion_type, display_order)
select p.id, v.main_theme, v.subtheme, v.criterion, v.criterion_type, v.display_order
from public.profiles p
cross join (values
 ('Service','Service','Coude haut','positive',1),
 ('Service','Service','Rythme de la préparation et de la frappe','positive',2),
 ('Service','Service','Lancer trop devant','improvement',1),
 ('Service','Service','Lancer trop derrière','improvement',2),
 ('Service','Service','Lancer latéral prononcé','improvement',3)
) as v(main_theme,subtheme,criterion,criterion_type,display_order)
where p.email = 'axel.bohrer21@gmail.com' and p.role = 'coach'
and not exists (
 select 1 from public.criteria_catalog c
 where c.coach_id=p.id and c.main_theme=v.main_theme and c.subtheme=v.subtheme
 and c.criterion=v.criterion and c.criterion_type=v.criterion_type
);