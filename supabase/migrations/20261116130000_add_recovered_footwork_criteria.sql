insert into public.criteria_catalog (coach_id,main_theme,subtheme,criterion,criterion_type,display_order)
select p.id,'Jeu de jambes/déplacements','Jeu de jambes et déplacements',v.criterion,v.criterion_type,v.display_order
from public.profiles p cross join (values
 ('Ajustement des appuis avant la frappe','positive',1),
 ('Anticipation des déplacements','positive',2),
 ('Coordination des déplacements et de la frappe','positive',3),
 ('Déplacement efficace vers l’avant','positive',4),
 ('Déplacement latéral efficace','positive',5),
 ('Déplacement vers l’arrière maîtrisé','positive',6),
 ('Équilibre dynamique','positive',7),
 ('Explosivité au démarrage','positive',8),
 ('Fluidité des déplacements','positive',9),
 ('Gestion des petits pas d’ajustement','positive',10),
 ('Placement par rapport à la balle','positive',11),
 ('Qualité de la reprise d’appuis','positive',12),
 ('Réactivité au démarrage','positive',13),
 ('Repositionnement après la frappe','positive',14),
 ('Stabilité des appuis','positive',15),
 ('Utilisation des appuis en déplacement','positive',16),
 ('Appui semi-ouvert','positive',17),
 ('Replacement rapide','positive',18),
 ('Appuis trop statiques','improvement',1),
 ('Déséquilibre à la frappe','improvement',2),
 ('Difficulté à changer de direction','improvement',3),
 ('Difficulté à se déplacer vers l’avant','improvement',4),
 ('Difficulté à se déplacer vers l’arrière','improvement',5),
 ('Déplacements latéraux inefficaces','improvement',6),
 ('Enchaînement des appuis irrégulier','improvement',7),
 ('Mauvais placement par rapport à la balle','improvement',8),
 ('Pas de reprise d’appui','improvement',9),
 ('Reprise d’appuis trop tardive','improvement',10),
 ('Replacement trop lent','improvement',11),
 ('Utilisation insuffisante des petits pas d’ajustement','improvement',12)
) as v(criterion,criterion_type,display_order)
where p.email='axel.bohrer21@gmail.com' and p.role='coach'
and not exists(select 1 from public.criteria_catalog c where c.coach_id=p.id and c.main_theme='Jeu de jambes/déplacements' and c.subtheme='Jeu de jambes et déplacements' and c.criterion=v.criterion and c.criterion_type=v.criterion_type);