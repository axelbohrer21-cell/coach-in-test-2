insert into public.criteria_catalog (coach_id,main_theme,subtheme,criterion,criterion_type,display_order)
select p.id,v.main_theme,v.subtheme,v.criterion,v.criterion_type,v.display_order
from public.profiles p
cross join (values
 ('Mental','Confiance en soi','Engagement dans ses choix de jeu','positive',1),
 ('Mental','Confiance en soi','Prise d’initiative sans hésitation','positive',2),
 ('Mental','Confiance en soi','Confiance dans ses capacités','positive',3),
 ('Mental','Confiance en soi','Capacité à prendre des risques adaptés','positive',4),
 ('Mental','Confiance en soi','Hésitation dans les choix de jeu','improvement',1),
 ('Mental','Confiance en soi','Manque de confiance dans ses capacités','improvement',2),
 ('Mental','Confiance en soi','Peur de prendre des initiatives','improvement',3),
 ('Mental','Confiance en soi','Difficulté à prendre des risques','improvement',4),
 ('Mental','Combativité et engagement','Combativité sur chaque point','positive',1),
 ('Mental','Combativité et engagement','Engagement physique constant','positive',2),
 ('Mental','Combativité et engagement','Persévérance dans les moments difficiles','positive',3),
 ('Mental','Combativité et engagement','Attitude volontaire','positive',4),
 ('Mental','Combativité et engagement','Capacité à ne jamais abandonner','positive',5),
 ('Mental','Combativité et engagement','Baisse d’engagement pendant le match','improvement',1),
 ('Mental','Combativité et engagement','Manque de combativité','improvement',2),
 ('Mental','Combativité et engagement','Découragement après plusieurs erreurs','improvement',3),
 ('Mental','Combativité et engagement','Difficulté à maintenir ses efforts','improvement',4),
 ('Mental','Combativité et engagement','Tendance à abandonner certains points','improvement',5),
 ('Mental','Gestion de la pression','Capacité à jouer les points importants','positive',1),
 ('Mental','Gestion de la pression','Gestion du stress en situation de match','positive',2),
 ('Mental','Gestion de la pression','Prise de décision lucide sous pression','positive',3),
 ('Mental','Gestion de la pression','Capacité à conserver son plan de jeu','positive',4),
 ('Mental','Gestion de la pression','Difficulté à jouer les points importants','improvement',1),
 ('Mental','Gestion de la pression','Précipitation sous pression','improvement',2),
 ('Mental','Gestion de la pression','Stress qui perturbe le jeu','improvement',3),
 ('Mental','Gestion de la pression','Abandon du plan de jeu dans les moments importants','improvement',4),
 ('Mental','Attitude en match','Respect de l’adversaire et de l’arbitrage','positive',1),
 ('Mental','Attitude en match','Respect des routines entre les points','positive',2),
 ('Mental','Attitude en match','Attitude positive sur le terrain','positive',3),
 ('Mental','Attitude en match','Capacité à rester engagé dans le match','positive',4),
 ('Mental','Attitude en match','Attitude inadaptée envers l’adversaire ou l’arbitrage','improvement',1),
 ('Mental','Attitude en match','Manque de respect des routines','improvement',2),
 ('Mental','Attitude en match','Attitude négative sur le terrain','improvement',3),
 ('Mental','Attitude en match','Baisse d’engagement pendant le match','improvement',4)
) as v(main_theme,subtheme,criterion,criterion_type,display_order)
where p.email='axel.bohrer21@gmail.com' and p.role='coach'
and not exists (select 1 from public.criteria_catalog c where c.coach_id=p.id and c.main_theme=v.main_theme and c.subtheme=v.subtheme and c.criterion=v.criterion and c.criterion_type=v.criterion_type);