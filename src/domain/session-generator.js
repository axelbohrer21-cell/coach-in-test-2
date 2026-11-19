const norm=v=>String(v||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const has=(v,words)=>words.some(w=>norm(v).includes(norm(w)));
const themes=[
 {key:'service',label:'Service',words:['service','mise en jeu'],objective:'Construire un service fiable et intentionnel',cue:'Lancer régulier, relâchement du bras et équilibre à la frappe.',setup:'Un panier de balles et des cibles dans les zones de service.'},
 {key:'return',label:'Retour',words:['retour','relance'],objective:'Améliorer la lecture et la qualité du retour',cue:'Position dynamique, lecture précoce et préparation compacte.',setup:'Un serveur, un relanceur et deux zones cibles profondes.'},
 {key:'volley',label:'Volée',words:['volée','volley','filet'],objective:'Gagner en contrôle et en décision vers l’avant',cue:'Raquette devant, prise de balle tôt et accompagnement court.',setup:'Un joueur au filet face à un passeur du fond.'},
 {key:'defense',label:'Défense',words:['défense','defendre','défensif'],objective:'Sortir de la défense et retrouver une position neutre',cue:'Donner de la hauteur et de la longueur, puis se replacer.',setup:'Départ décalé et couloirs profonds matérialisés.'},
 {key:'construction',label:'Construction du point',words:['construction','régularité','fond de court','échange'],objective:'Construire le point avec une intention tactique claire',cue:'Identifier la balle neutre, la balle favorable et l’espace libre.',setup:'Deux joueurs du fond et des cibles profondes.'},
 {key:'attaque',label:'Attaque',words:['attaque','agressivité','accélération'],objective:'Reconnaître et exploiter les balles d’attaque',cue:'Avancer dans le terrain et choisir une cible avec marge.',setup:'Le coach distribue des balles neutres puis courtes.'},
 {key:'footwork',label:'Déplacements et appuis',words:['déplacement','appuis','vitesse','coordination','physique'],objective:'Améliorer les appuis et la qualité de replacement',cue:'Petits pas d’ajustement, équilibre et reprise d’appuis.',setup:'Plots ou lignes du court comme repères.'},
 {key:'mental',label:'Mental et routine',words:['mental','concentration','routine','gestion'],objective:'Installer une routine et une prise de décision stable',cue:'Respirer, choisir une intention simple et s’engager.',setup:'Séries courtes de points avec score annoncé.'}
];
function adaptation(level,age){
 const v=norm(level);
 if((Number(age)>0&&Number(age)<12)||has(v,['débutant','initiation','début']))return{label:'Progression accessible',load:'Séries de 4 à 6 balles avec récupération active et feedback immédiat.',change:'Rapprocher les distances, ralentir l’alimentation, agrandir les cibles et limiter les consignes.'};
 if(has(v,['confirmé','avancé','compétition']))return{label:'Exigence compétition',load:'Séries de 8 à 12 balles, score annoncé et récupération courte.',change:'Réduire les cibles, varier les trajectoires et ajouter une décision tactique sous pression.'};
 return{label:'Progression intermédiaire',load:'Séries de 6 à 8 balles, alternance répétition et situation semi-ouverte.',change:'Commencer avec une cible large puis la réduire ; ajouter une variation de direction ou de rythme.'};
}
function focusForRequest(value){
 const text=norm(value);
 const rules=[
  {label:'Deuxième balle de service',match:['2eme balle','2e balle','deuxieme balle','deuxième balle','seconde balle'],cue:'Sur la deuxième balle, sécuriser le lancer, accélérer la tête de raquette et donner une trajectoire bombée avec de la rotation. Chercher une zone précise avec une marge au-dessus du filet.',success:'Sur 10 deuxièmes balles, en réussir au moins 7 dans le carré visé sans chercher la vitesse maximale.',kind:'second-serve'},
  {label:'Variation des effets au service',match:['effet','lift','slice','service slicé','service lifté','service lifte'],cue:'Modifier le lancer et le passage de la raquette pour produire l’effet demandé sans perdre l’équilibre.',success:'Sur 10 services, produire l’effet demandé et atteindre la zone cible au moins 6 fois.',kind:'serve-effects'},
  {label:'Placement et lancer au service',match:['lancer','coude haut','preparation service'],cue:'Installer un lancer répétable, garder le coude haut et synchroniser la poussée des jambes avec la frappe.',success:'Sur 10 services, conserver un lancer exploitable et un point de contact équilibré au moins 7 fois.',kind:'serve-placement'},
  {label:'Prise de balle tôt en revers',match:['revers','prise de balle tôt','prise de balle tot','balle montante'],cue:'Préparer tôt, avancer vers la balle et prendre le contact devant le corps sans bloquer le geste.',success:'Sur 10 balles en revers, prendre la balle tôt et garder une trajectoire maîtrisée au moins 6 fois.',kind:'backhand'},
  {label:'Régularité du coup droit',match:['coup droit','regularite coup droit'],cue:'Garder une préparation stable, une marge au-dessus du filet et une cible profonde.',success:'Enchaîner 8 coups droits sur 10 dans la zone de sécurité avec une profondeur utile.',kind:'forehand'},
  {label:'Retour de première balle',match:['retour premiere','retour 1ere','premiere balle'],cue:'Lire tôt la trajectoire, raccourcir la préparation et privilégier une remise compacte au centre profond.',success:'Sur 10 retours de première balle, remettre 6 balles jouables dans une zone profonde.',kind:'first-return'},
  {label:'Retour de deuxième balle',match:['retour deuxieme','retour 2eme'],cue:'Prendre le terrain, avancer dans la balle et choisir une cible agressive avec une marge de sécurité.',success:'Sur 10 retours de deuxième balle, prendre l’initiative de façon contrôlée au moins 6 fois.',kind:'second-return'},
  {label:'Volée de coup droit ou revers',match:['volee'],cue:'Garder la raquette devant, ajuster les appuis et accompagner brièvement vers une cible précise.',success:'Réaliser 6 volées maîtrisées sur 10 avec un replacement immédiat.',kind:'volley'}
 ];
 return rules.find(rule=>rule.match.some(word=>text.includes(norm(word))))||null;
}
function activity(name,minutes,objective,setup,procedure,scoring,coachCue){
 return {name,minutes,objective,setup,procedure,scoring,coachCue};
}
function buildActivities(t,focus,mins){
 const secondServe=focus?.kind==='second-serve';
 if(t.key==='service'&&secondServe){
  const feed=activity('Envoi du coach · fenêtre de frappe et rotation',mins===60?12:mins===90?12:12,
   'Installer le geste de deuxième balle sans pression de vitesse : contact haut, passage de raquette et trajectoire bombée.',
   'Le coach se place près du joueur avec un panier. Le joueur démarre à hauteur de la ligne de service, puis recule progressivement vers la ligne de fond.',
   'Le coach lance à la main une balle au-dessus de l’épaule et légèrement devant. Le joueur frappe avec le geste complet de deuxième balle, cherche une trajectoire haute et une rotation visible. Faire 2 séries de 6 balles, puis 1 série depuis la ligne de fond. Le coach corrige un seul repère à la fois : lancer, contact ou accélération de la tête de raquette.',
   'Valider 8 frappes sur 12 dans le carré avec une trajectoire sécurisée.',
   'Ne pas chercher à frapper fort : la vitesse de tête de raquette et la rotation donnent la sécurité.');
  const g1=activity('Gamme 1 · deuxième balle haute au centre',mins===60?20:mins===90?18:18,
   'Répéter une deuxième balle liftée ou kickée dans une grande cible centrale.',
   'Joueur sur la ligne de fond, coach en face avec panier. Délimiter une grande cible au centre du carré.',
   'Réaliser 3 séries de 6 deuxièmes balles. Entre les séries, annoncer le taux de réussite. Chercher une trajectoire qui passe nettement au-dessus du filet et retombe au centre. Si le joueur manque deux fois de suite, ralentir le rythme et reprendre le rituel.',
   'Objectif : 5 balles sur 6 dans le carré central, avec hauteur et rotation.',
   'Lancer légèrement derrière la tête si cela aide à brosser la balle ; garder le coude haut et finir le geste.');
  const g2=activity('Gamme 2 · deuxième balle dans les zones',mins===60?0:mins===90?18:18,
   'Conserver la même qualité de deuxième balle en changeant la cible.',
   'Placer deux cibles : côté égalité au T et côté avantage vers l’extérieur. Le coach annonce la zone avant chaque série.',
   'Enchaîner 4 séries de 5 balles : deux séries côté égalité, deux côté avantage. Le joueur annonce la cible avant son rituel. Alterner ensuite les zones au dernier moment pour ajouter une prise d’information.',
   'Réussir 3 balles sur 5 dans chaque zone annoncée.',
   'Garder le même lancer et le même engagement ; seule la direction de la raquette et la zone visée changent.');
  const g3=activity('Gamme 3 · deuxième balle après fatigue légère',mins===120?20:0,
   'Reproduire une deuxième balle fiable après un effort et une récupération courte.',
   'Deux plots à 3 mètres de part et d’autre du joueur, panier de balles et cible centrale.',
   'Le joueur touche alternativement les deux plots, revient derrière la ligne et sert une deuxième balle. Faire 3 séries de 5 services avec 20 secondes de récupération. Le coach annonce parfois une zone juste avant le lancer.',
   'Réussir 4 deuxièmes balles sur 5 dans le carré après le déplacement.',
   'Conserver le rituel et la qualité du lancer même lorsque le rythme cardiaque augmente.');
  const points=activity('Points · commencer chaque échange sur une deuxième balle',mins===60?28:mins===90?42:52,
   'Transférer la deuxième balle en situation réelle et assumer la première frappe après le service.',
   'Un serveur et un relanceur en diagonale. Chaque point commence obligatoirement par une deuxième balle ; prévoir une rotation des rôles.',
   'Jouer des manches de 7 points. Le serveur annonce sa zone, sert une deuxième balle et joue le point complet. Le relanceur cherche à mettre la pression sans attaquer systématiquement. Variante : démarrer à 30-30 ou donner deux points au relanceur si la deuxième balle est faute.',
   'Le serveur marque 2 points si la deuxième balle est dans la zone annoncée et qu’il construit correctement la première frappe. Noter séparément les doubles fautes.',
   'Observer la routine, la hauteur, la rotation et la décision sur la première frappe après le service.');
  return mins===60?[feed,g1,points]:mins===90?[feed,g1,g2,points]:[feed,g1,g2,g3,points];
 }
 const cue=focus?.cue||t.cue,success=focus?.success||'Réussir au moins 6 situations sur 10 avec l’intention demandée.';
 const base={
 service:[
  activity('Envoi du coach · geste et zone de contact',12,'Répéter le geste du service avec un point de contact haut et équilibré.',t.setup,'Le coach envoie la balle à la main dans la fenêtre de frappe. Le joueur réalise le geste complet en cherchant une cible large. 3 séries de 6 répétitions.', '8 contacts sur 10 avec équilibre et direction maîtrisée.',cue),
  activity('Gamme 1 · service dans une grande cible',18,'Stabiliser le lancer et la mise en jeu.',t.setup,'Réaliser 3 séries de 8 services depuis la ligne de fond. Rechercher une routine identique et une zone large ; récupérer entre les séries.','6 services sur 8 dans le carré.',cue),
  activity('Gamme 2 · service et première frappe',18,'Enchaîner service et coup suivant avec intention.',t.setup,'Servir dans une zone annoncée, jouer une balle de replacement envoyée par le coach puis chercher la zone libre. Alterner côté égalité et avantage.','Réussir 5 enchaînements sur 8.','Se replacer immédiatement après le service.'),
  activity('Gamme 3 · varier les zones',20,'Conserver la qualité du service en changeant de cible.',t.setup,'Le coach annonce T, extérieur ou corps avant le rituel. Jouer 3 séries de 6 services avec une cible précise.','Atteindre 4 fois sur 6 la zone annoncée.','Ne pas modifier le lancer au dernier instant.'),
  activity('Points · service + première frappe',52,'Réinvestir le service dans un point complet.',t.setup,'Jouer des points à partir du service. Le serveur annonce sa zone et cherche à construire la première frappe ; le relanceur joue librement.','Bonus si le service atteint la zone annoncée et permet une première frappe offensive.','Observer routine, zone et intention après le service.')
 ],
 return:[
  activity('Envoi du coach · lecture et préparation',12,'Préparer tôt et orienter le retour vers une zone profonde.',t.setup,'Le coach envoie des balles depuis la ligne de service en variant doucement droite et revers. Le joueur annonce la direction, ajuste ses appuis et bloque un retour compact. 3 séries de 6.','5 retours sur 6 dans la zone profonde.',cue),
  activity('Gamme 1 · retours croisés',18,'Répéter un retour profond croisé.',t.setup,'Le coach sert à vitesse modérée. Le joueur retourne croisé dans une cible profonde ; 3 séries de 6 retours.','5 sur 6 dans la zone visée.',cue),
  activity('Gamme 2 · retour puis replacement',18,'Enchaîner le retour et le coup suivant.',t.setup,'Le coach sert, le joueur retourne puis reçoit une deuxième balle dans l’autre moitié du court. Il doit se replacer et jouer profond.','Réussir 5 séquences sur 8.', 'Préparation compacte et replacement dès la frappe.'),
  activity('Gamme 3 · lecture tardive',20,'Adapter la réponse à une direction moins prévisible.',t.setup,'Le coach alterne service côté coup droit et revers sans annoncer. Le joueur lit, se place et vise une grande cible.','6 retours jouables sur 10.','Lire le lancer et l’orientation du serveur.'),
  activity('Points · départ sur service',52,'Transférer la qualité du retour en point réel.',t.setup,'Jouer des points où chaque échange commence par un service du coach. Le relanceur marque double si le retour est profond et lui permet de reprendre l’échange.','Gagner 5 points sur 10 grâce à un retour jouable.','Privilégier la qualité du premier retour.')
 ],
 volley:[
  activity('Envoi du coach · volée de contrôle',12,'Stabiliser la raquette devant et orienter la volée.',t.setup,'Le coach envoie à la main ou à la raquette 6 balles côté coup droit puis 6 côté revers. Le joueur avance avec un pas d’ajustement et bloque vers une cible.','8 volées sur 12 dans la cible.',cue),
  activity('Gamme 1 · volées alternées',18,'Enchaîner volée coup droit et revers.',t.setup,'Le coach alimente alternativement à droite et à gauche. Le joueur garde la raquette devant et revient au centre après chaque frappe. 3 séries de 8.','6 séquences sur 8 sans faute.',cue),
  activity('Gamme 2 · volée après approche',18,'Construire la montée et contrôler la première volée.',t.setup,'Le coach envoie une balle courte ; le joueur joue une approche dans une cible, avance et réalise la première volée alimentée.','Réussir 5 montées sur 8.','Avancer derrière une approche longue et équilibrée.'),
  activity('Gamme 3 · volée basse et haute',20,'Adapter la flexion et la finition selon la hauteur.',t.setup,'Alterner 5 volées basses puis 5 volées hautes. Le joueur ajuste la hauteur du centre de gravité et vise une zone profonde.','7 volées sur 10 contrôlées.','Fléchir sur la basse, garder le geste compact sur la haute.'),
  activity('Points · départ approche-volée',52,'Prendre le filet et conclure le point.',t.setup,'Chaque point démarre par une balle courte du coach. Le joueur doit avancer, jouer une approche puis gagner le point au filet.','Point doublé si la première volée est maîtrisée.','Choisir la montée sur une balle favorable.')
 ],
 defense:[
  activity('Envoi du coach · sortir de la zone de danger',12,'Remettre haut et long depuis une position déséquilibrée.',t.setup,'Le coach envoie à la main ou à la raquette des balles décalées à droite et à gauche. Le joueur se replace et remet haut et long.','5 trajectoires hautes et profondes sur 6.',cue),
  activity('Gamme 1 · défense croisée',18,'Tenir la diagonale avec hauteur et longueur.',t.setup,'Le coach déplace le joueur latéralement. Remettre 4 balles hautes et profondes avant de revenir au centre. 3 séries.','Réussir 2 séquences complètes sur 3.',cue),
  activity('Gamme 2 · défense puis contre',18,'Identifier la balle qui permet de reprendre l’initiative.',t.setup,'Après deux balles défensives, le coach donne une balle plus courte. Le joueur avance et joue dans l’espace libre.','5 transitions réussies sur 8.','Ne pas contre-attaquer avant d’avoir neutralisé.'),
  activity('Gamme 3 · déplacement aléatoire',20,'Garder une trajectoire défensive de qualité malgré l’incertitude.',t.setup,'Le coach distribue aléatoirement droite, gauche et profondeur. Le joueur annonce sa position et remet haut et long.','6 balles sur 10 dans les couloirs profonds.','Se replacer pendant le trajet de balle.'),
  activity('Points · défendre pour gagner du temps',52,'Utiliser la défense pour reprendre une position neutre.',t.setup,'Jouer des points où le coach démarre en attaquant. Le joueur commence décalé et doit neutraliser avant de pouvoir gagner le point.','Bonus si le joueur neutralise puis contre-attaque.','Valoriser la patience et le bon choix.')
 ],
 construction:[
  activity('Envoi du coach · profondeur et régularité',12,'Installer une balle neutre profonde avant de construire.',t.setup,'Le coach envoie à la main ou à la raquette 6 balles dans chaque diagonale. Le joueur vise une zone profonde et se replace.','8 balles sur 12 au-delà de la ligne de service.',cue),
  activity('Gamme 1 · construire dans la diagonale',18,'Enchaîner plusieurs balles profondes avec marge.',t.setup,'Jouer 4 frappes croisées consécutives dans une cible profonde, puis changer de diagonale. 3 séries de 4 échanges.','Réussir 2 séries sur 3.',cue),
  activity('Gamme 2 · fixer puis déplacer',18,'Créer un décalage avant de changer de direction.',t.setup,'Jouer deux balles dans la même diagonale puis changer long de ligne sur une balle favorable. Le coach alimente régulièrement.','Réussir 5 décalages sur 8.','Changer de direction uniquement sur une balle équilibrée.'),
  activity('Gamme 3 · choix sur balle neutre ou courte',20,'Identifier le bon moment pour accélérer.',t.setup,'Le coach alterne balle neutre et balle courte. Le joueur construit sur la neutre et avance sur la courte.','Prendre 6 bonnes décisions sur 10.','La qualité de décision prime sur la vitesse.'),
  activity('Points · construire avant d’accélérer',52,'Transférer la construction dans les points.',t.setup,'Jouer des points libres. Le joueur doit construire au moins trois frappes avant de changer de direction, sauf balle courte évidente.','Point doublé si le joueur construit puis ouvre le terrain.','Observer la patience et le choix de la balle favorable.')
 ],
 attaque:[
  activity('Envoi du coach · attaquer une balle courte',12,'Prendre la balle tôt en avançant dans le terrain.',t.setup,'Le coach envoie des balles courtes à la main ou à la raquette. Le joueur avance, prend la balle devant et vise une grande cible.','5 attaques contrôlées sur 6.',cue),
  activity('Gamme 1 · approche dans la zone libre',18,'Jouer une approche longue après une balle courte.',t.setup,'Le coach alterne balle neutre et balle courte. Sur la courte, avancer et jouer dans la zone annoncée.','6 approches sur 8 dans la cible.',cue),
  activity('Gamme 2 · préparer puis accélérer',18,'Créer l’ouverture avant de finir.',t.setup,'Jouer une balle de préparation croisée puis accélérer dans l’espace libre sur la balle suivante.','5 enchaînements réussis sur 8.','Garder une marge et viser l’espace plutôt que la ligne.'),
  activity('Gamme 3 · choix d’attaque',20,'Choisir entre temporiser et prendre l’initiative.',t.setup,'Le coach distribue aléatoirement balle neutre ou courte. Le joueur annonce « construire » ou « attaquer » avant la frappe.','7 décisions adaptées sur 10.','Ne pas forcer l’attaque sur une balle neutre.'),
  activity('Points · bonus sur attaque construite',52,'Prendre le terrain et conclure le point.',t.setup,'Jouer des points avec alimentation du coach. Le joueur marque double lorsqu’il identifie une balle courte, avance et termine en position offensive.','Gagner 5 points sur 10 avec une prise d’initiative maîtrisée.','Valoriser la bonne lecture avant la finition.')
 ],
 footwork:[
  activity('Envoi du coach · appuis avant frappe',12,'Ajuster les appuis et frapper en équilibre.',t.setup,'Le coach envoie à la main des balles à droite et à gauche. Le joueur effectue des petits pas d’ajustement avant la frappe.','8 frappes équilibrées sur 10.',cue),
  activity('Gamme 1 · déplacement latéral',18,'Enchaîner déplacement, frappe et replacement.',t.setup,'Le coach distribue droite-gauche. Le joueur touche un repère, frappe puis revient au centre. 3 séries de 6.','5 retours au centre sur 6.',cue),
  activity('Gamme 2 · avant-arrière',18,'Gérer les changements de profondeur.',t.setup,'Alterner balle courte et balle longue. Le joueur avance ou recule avec les bons appuis et garde l’équilibre à la frappe.','8 déplacements adaptés sur 10.','Petits pas d’ajustement avant le contact.'),
  activity('Gamme 3 · réaction aléatoire',20,'Réagir à une information tardive.',t.setup,'Le coach annonce ou montre la direction au dernier moment. Le joueur démarre, ajuste et frappe dans une cible large.','7 réponses correctes sur 10.','Rester dynamique entre les frappes.'),
  activity('Points · replacement obligatoire',52,'Maintenir des appuis efficaces en échange.',t.setup,'Jouer des points libres. Après chaque frappe, le joueur doit retrouver une zone de replacement matérialisée avant le coup suivant.','Replacement correct sur 7 points sur 10.','Observer la qualité du replacement, pas seulement le résultat.')
 ],
 mental:[
  activity('Envoi du coach · routine avant frappe',12,'Associer respiration, intention et engagement.',t.setup,'Avant chaque balle envoyée par le coach, le joueur annonce une intention simple, respire puis joue vers une cible. 3 séries de 6.','Réaliser une routine complète sur 8 balles sur 10.',cue),
  activity('Gamme 1 · intention annoncée',18,'Répéter une intention claire sur une série.',t.setup,'Avant chaque frappe, annoncer la cible et le choix tactique. Le coach envoie 8 balles par série.','7 intentions suivies sur 8.',cue),
  activity('Gamme 2 · repartir après erreur',18,'Garder une routine stable après une faute.',t.setup,'Le joueur joue une balle, reçoit immédiatement une nouvelle alimentation et doit refaire sa routine même après une erreur.','Routine respectée sur 8 balles sur 10.','La routine reste identique après réussite ou erreur.'),
  activity('Gamme 3 · score sous pression',20,'Prendre une décision claire avec un score annoncé.',t.setup,'Le coach annonce 30-30 ou balle de break avant chaque séquence. Le joueur choisit une intention et joue la balle alimentée.','6 décisions cohérentes sur 8.','Respirer, choisir, s’engager.'),
  activity('Points · routine en situation',52,'Transférer la routine dans le score réel.',t.setup,'Jouer des points avec annonce du score avant chaque mise en jeu. Le coach observe la routine et la capacité à repartir après erreur.','Routine complète sur 7 points sur 10.','Évaluer la qualité du processus, pas uniquement le point gagné.')
 ]
 };
 const list=base[t.key]||base.construction;
 if(mins===60)return [list[0],list[1],list[4]].map((x,i)=>({...x,minutes:[12,20,28][i]}));
 if(mins===90)return [list[0],list[1],list[2],list[4]].map((x,i)=>({...x,minutes:[12,18,18,42][i]}));
 return [list[0],list[1],list[2],list[3],list[4]].map((x,i)=>({...x,minutes:[12,18,18,20,52][i]}));
}
function formatActivity(item,index){
 return 'EXERCICE '+(index+1)+' · '+item.name.toUpperCase()+' · '+item.minutes+' min\nOBJECTIF : '+item.objective+'\nMISE EN PLACE : '+item.setup+'\nDÉROULEMENT : '+item.procedure+'\nBARÈME / RÉUSSITE : '+item.scoring+'\nREPÈRE COACH : '+item.coachCue;
}
export function generateOriginalSession({theme='construction',customObjective='',playerName='le joueur',level='Intermédiaire',difficulty='progressive',priorAdjustment=null,age=null,playerType='Loisir',duration=90,priority=null,challenge=null,recentSessions=[]}={}){
 const request=String(customObjective||'').trim(),combined=request||String(theme||'');
 const t=themes.find(x=>x.key===theme)||themes.find(x=>has(combined,x.words))||themes.find(x=>has(priority?.main_theme||priority?.criterion,x.words))||themes[4];
 const focus=focusForRequest(request),a=adaptation(level,age),mins=[60,90,120].includes(Number(duration))?Number(duration):90;
 const activities=buildActivities(t,focus,mins);
 const selectedDifficulty=difficulty==='auto'&&priorAdjustment?.hasHistory?priorAdjustment.difficulty:difficulty;
 const progression=selectedDifficulty==='easy'?{label:'Accessible',rule:'Rapprocher le joueur, ralentir le rythme et élargir les cibles.'}:selectedDifficulty==='hard'?{label:'Exigeant',rule:'Réduire les cibles, augmenter l’incertitude et ajouter un score sous pression.'}:{label:'Progressif',rule:'Commencer avec une cible large, puis ajouter une variable après plusieurs réussites.'};
 const objective=request?'Objectif personnalisé : '+request+'.':priority?.criterion?'Priorité individualisée : '+priority.criterion+'. '+t.objective+'.':t.objective+'.';
 const challengeText=challenge?.objective||challenge?.criterion||'';
 const progressionNote=priorAdjustment?.hasHistory?'Adaptation depuis la séance précédente : '+priorAdjustment.label+'. '+priorAdjustment.guidance:'';
 const notes=['Joueur : '+playerName+' · Profil : '+playerType+' · Niveau : '+level,'Objectif : '+objective,'Consigne technique : '+(focus?.cue||t.cue),'Adaptation : '+a.change,'Difficulté : '+progression.label+' — '+progression.rule,progressionNote,priorAdjustment?.successCriterion?'Critère précédent : '+priorAdjustment.successCriterion:'',priorAdjustment?.observed?'Observation précédente : '+priorAdjustment.observed:'',priorAdjustment?.nextAdjustment?'Ajustement demandé : '+priorAdjustment.nextAdjustment:'','Charge : '+a.load,'Réussite globale : '+(focus?.success||activities.at(-1).scoring),challengeText?'Défi actif : '+challengeText:'',recentSessions.slice(0,3).some(x=>has(x.theme,t.words))?'Le thème apparaît dans les séances récentes : varier la cible ou la contrainte.':''].filter(Boolean).join('\n');
 const formatted=activities.map(formatActivity);
 const firstGroup=mins===60?formatted.slice(0,2):mins===90?formatted.slice(0,2):formatted.slice(0,3);
 const secondGroup=mins===60?formatted.slice(2):mins===90?formatted.slice(2):formatted.slice(3);
 const phases=activities.map(item=>({name:item.name,minutes:item.minutes,objective:item.objective,content:formatActivity(item)}));
 const feedCount=activities.filter(x=>x.name.toLocaleLowerCase('fr').includes('envoi du coach')).length;
 return {generated:true,generation_mode:'original',theme:focus?.label||t.label,focus:focus?.label||null,duration_minutes:mins,objective,coaching_notes:notes,
 exercise_1:firstGroup.join('\n\n'),exercise_2:secondGroup.join('\n\n'),
 player_visible_summary:objective+' La séance est organisée en '+activities.length+' exercices progressifs : alimentation du coach, gammes techniques distinctes et transfert en points.',
 success_criteria:focus?.success||activities.at(-1).scoring,adaptation:a.label,difficulty:progression.label,difficulty_rule:progression.rule,progression:priorAdjustment||null,
 phases,exercise_count:activities.length,coach_feed_count:feedCount};
}
