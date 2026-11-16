begin;
delete from public.criteria_catalog c
using public.profiles p
where c.coach_id=p.id
  and p.email='axel.bohrer21@gmail.com' and p.role='coach'
  and c.main_theme='Service'
  and c.subtheme='Service'
  and c.criterion='Lancer latéral prononcé'
  and c.criterion_type='improvement';

insert into public.criteria_catalog (coach_id,main_theme,subtheme,criterion,criterion_type,display_order)
select p.id,v.main_theme,v.subtheme,v.criterion,v.criterion_type,v.display_order
from public.profiles p
cross join (values
 ('Service','Service','Lancer trop loin sur le côté','improvement',3),
 ('Service','Service','Rythme irrégulier','improvement',4),
 ('Mental','Concentration','Concentration maintenue pendant le point','positive',1),
 ('Mental','Concentration','Capacité à rester concentré entre les points','positive',2),
 ('Mental','Concentration','Attention portée aux consignes','positive',3),
 ('Mental','Concentration','Recentrage rapide après une distraction','positive',4),
 ('Mental','Concentration','Baisse de concentration pendant le point','improvement',1),
 ('Mental','Concentration','Difficulté à rester concentré entre les points','improvement',2),
 ('Mental','Concentration','Distraction fréquente','improvement',3),
 ('Mental','Concentration','Difficulté à se recentrer','improvement',4),
 ('Mental','Gestion des émotions','Attitude positive après une erreur','positive',1),
 ('Mental','Gestion des émotions','Gestion maîtrisée de la frustration','positive',2),
 ('Mental','Gestion des émotions','Maîtrise des émotions dans les moments difficiles','positive',3),
 ('Mental','Gestion des émotions','Réaction constructive après un point perdu','positive',4),
 ('Mental','Gestion des émotions','Attitude négative après une erreur','improvement',1),
 ('Mental','Gestion des émotions','Frustration difficile à maîtriser','improvement',2),
 ('Mental','Gestion des émotions','Réactions excessives après un point perdu','improvement',3),
 ('Mental','Gestion des émotions','Difficulté à gérer les moments difficiles','improvement',4)
) as v(main_theme,subtheme,criterion,criterion_type,display_order)
where p.email='axel.bohrer21@gmail.com' and p.role='coach'
and not exists (
 select 1 from public.criteria_catalog c
 where c.coach_id=p.id and c.main_theme=v.main_theme and c.subtheme=v.subtheme
 and c.criterion=v.criterion and c.criterion_type=v.criterion_type
);
commit;