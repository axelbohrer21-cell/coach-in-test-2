-- User-approved return-of-serve catalogue (45 criteria)
delete from public.criteria_catalog c
where c.coach_id=(select id from public.profiles where email='axel.bohrer21@gmail.com' and role='coach' limit 1)
and c.main_theme='Retour de service'
and c.subtheme in ('Retour sur première balle','Retour sur deuxième balle');
insert into public.criteria_catalog (coach_id,main_theme,subtheme,criterion,criterion_type,display_order)
select p.id,v.main_theme,v.subtheme,v.criterion,v.criterion_type,v.display_order
from public.profiles p
cross join (values
('Retour de service','Retour sur première balle','Anticipation de la direction du service','positive',1),
('Retour de service','Retour sur première balle','Blocage efficace','positive',2),
('Retour de service','Retour sur première balle','Contrôle de la profondeur','positive',3),
('Retour de service','Retour sur première balle','Lecture de la trajectoire','positive',4),
('Retour de service','Retour sur première balle','Placement adapté','positive',5),
('Retour de service','Retour sur première balle','Préparation courte et compacte','positive',6),
('Retour de service','Retour sur première balle','Prise de balle devant soi','positive',7),
('Retour de service','Retour sur première balle','Qualité de centrage','positive',8),
('Retour de service','Retour sur première balle','Réactivité','positive',9),
('Retour de service','Retour sur première balle','Régularité','positive',10),
('Retour de service','Retour sur première balle','Reprise d’appuis synchronisée','positive',11),
('Retour de service','Retour sur première balle','Stabilité','positive',12),
('Retour de service','Retour sur première balle','Anticipation tardive','improvement',1),
('Retour de service','Retour sur première balle','Blocage insuffisant','improvement',2),
('Retour de service','Retour sur première balle','Profondeur irrégulière','improvement',3),
('Retour de service','Retour sur première balle','Lecture tardive du service','improvement',4),
('Retour de service','Retour sur première balle','Réactivité insuffisante','improvement',5),
('Retour de service','Retour sur première balle','Placement initial inadapté','improvement',6),
('Retour de service','Retour sur première balle','Préparation trop ample','improvement',7),
('Retour de service','Retour sur première balle','Prise de balle tardive','improvement',8),
('Retour de service','Retour sur première balle','Centrage irrégulier','improvement',9),
('Retour de service','Retour sur première balle','Retour trop centré','improvement',10),
('Retour de service','Retour sur première balle','Retour trop court','improvement',11),
('Retour de service','Retour sur première balle','Stabilité insuffisante','improvement',12),
('Retour de service','Retour sur deuxième balle','Anticipation de la direction','positive',1),
('Retour de service','Retour sur deuxième balle','Attaque de la deuxième balle','positive',2),
('Retour de service','Retour sur deuxième balle','Contrôle de la profondeur','positive',3),
('Retour de service','Retour sur deuxième balle','Lecture de la trajectoire','positive',4),
('Retour de service','Retour sur deuxième balle','Prise d’initiative','positive',5),
('Retour de service','Retour sur deuxième balle','Prise de balle devant et précoce','positive',6),
('Retour de service','Retour sur deuxième balle','Qualité de centrage','positive',7),
('Retour de service','Retour sur deuxième balle','Régularité','positive',8),
('Retour de service','Retour sur deuxième balle','Utilisation des angles','positive',9),
('Retour de service','Retour sur deuxième balle','Variation des zones','positive',10),
('Retour de service','Retour sur deuxième balle','Vitesse d’exécution','positive',11),
('Retour de service','Retour sur deuxième balle','Attaque insuffisante de la deuxième balle','improvement',1),
('Retour de service','Retour sur deuxième balle','Choix tactique inadapté','improvement',2),
('Retour de service','Retour sur deuxième balle','Difficulté à prendre l’initiative','improvement',3),
('Retour de service','Retour sur deuxième balle','Manque de profondeur','improvement',4),
('Retour de service','Retour sur deuxième balle','Manque de régularité','improvement',5),
('Retour de service','Retour sur deuxième balle','Précipitation','improvement',6),
('Retour de service','Retour sur deuxième balle','Prise de balle tardive','improvement',7),
('Retour de service','Retour sur deuxième balle','Retour trop centré','improvement',8),
('Retour de service','Retour sur deuxième balle','Retour trop court','improvement',9),
('Retour de service','Retour sur deuxième balle','Variation des zones insuffisante','improvement',10)
) as v(main_theme,subtheme,criterion,criterion_type,display_order)
where p.email='axel.bohrer21@gmail.com' and p.role='coach';
