insert into public.criteria_catalog (coach_id,main_theme,subtheme,criterion,criterion_type,display_order)
select p.id,v.main_theme,v.subtheme,v.criterion,v.criterion_type,v.display_order
from public.profiles p
cross join (values
 ('Retour de service','Retour sur première balle','Blocage efficace sur service rapide','positive',1),
 ('Retour de service','Retour sur première balle','Contrôle de la profondeur','positive',2),
 ('Retour de service','Retour sur première balle','Placement adapté','positive',3),
 ('Retour de service','Retour sur première balle','Blocage insuffisant','improvement',1),
 ('Retour de service','Retour sur première balle','Contrôle de profondeur irrégulier','improvement',2),
 ('Retour de service','Retour sur première balle','Retour trop centré','improvement',3),
 ('Retour de service','Retour sur première balle','Retour trop court','improvement',4),
 ('Retour de service','Retour sur deuxième balle','Attaque de la deuxième balle','positive',1),
 ('Retour de service','Retour sur deuxième balle','Prise d’initiative','positive',2),
 ('Retour de service','Retour sur deuxième balle','Utilisation des angles','positive',3),
 ('Retour de service','Retour sur deuxième balle','Attaque insuffisante de la deuxième balle','improvement',1),
 ('Retour de service','Retour sur deuxième balle','Difficulté à prendre l’initiative','improvement',2),
 ('Retour de service','Retour sur deuxième balle','Variation des zones insuffisante','improvement',3)
) as v(main_theme,subtheme,criterion,criterion_type,display_order)
where p.email='axel.bohrer21@gmail.com' and p.role='coach'
and not exists(select 1 from public.criteria_catalog c where c.coach_id=p.id and c.main_theme=v.main_theme and c.subtheme=v.subtheme and c.criterion=v.criterion and c.criterion_type=v.criterion_type);