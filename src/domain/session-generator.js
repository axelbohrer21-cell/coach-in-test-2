import groupProgram from '../data/group-course-program.json' with { type: 'json' };

const normalize = value => String(value || '')
  .toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function classifyFocus(value) {
  const text = normalize(value);
  const has = (...terms) => terms.some(term => text.includes(normalize(term)));
  if (has('retour','relance')) return 'retour';
  if (has('smash','smatch')) return 'smash';
  if (has('service','mise en jeu','lancer','premiere balle','deuxieme balle','slice au service')) return 'service';
  if (has('volee','volley','filet','smash','smatch')) return 'volley';
  if (has('revers','backhand')) return 'revers';
  if (has('coup droit','cd','forehand')) return 'coup-droit';
  if (has('defense','defensif','couverture')) return 'defense';
  if (has('attaque','agressivite','balle favorable','decalage')) return 'attaque';
  if (has('rapidite','coordination','endurance','deplacement','appuis','physique')) return 'physique';
  if (has('mental','attitude','concentration','engagement','confiance')) return 'mental';
  if (has('tactique','construction','longueur','variation','adversaire','point')) return 'construction';
  return 'construction';
}

const DRILLS = {
  'coup-droit': {
    label:'Coup droit', objective:'Stabiliser le coup droit puis choisir la bonne zone selon la profondeur de balle.',
    drills:[
      ['Cible alternée et replacement','Deux zones sont matérialisées dans la diagonale et dans le long de ligne. Le coach distribue 10 balles alternant balle neutre et balle plus courte. Le joueur annonce sa cible, frappe, puis revient derrière un repère central avant la balle suivante.','Réussir 6 cibles sur 10 sans perdre le replacement.'],
      ['Balle courte : avancer ou temporiser','Le coach alterne une balle longue et une balle courte sans annoncer laquelle. Sur la balle longue, le joueur construit haut et profond ; sur la courte, il avance et joue dans une zone offensive. Après chaque frappe, il doit se replacer pour jouer la balle suivante.','Faire le bon choix sur 7 balles sur 10.'],
      ['Construire puis ouvrir le court','Échange croisé coup droit. Après deux frappes profondes dans une zone cible, le joueur peut ouvrir le court en long de ligne ou court croisé. Le point continue librement après l’ouverture.','Créer une ouverture cohérente dans 5 points sur 8.']
    ]
  },
  revers: {
    label:'Revers', objective:'Améliorer la qualité du revers selon le timing de prise de balle et la zone visée.',
    drills:[
      ['Prise de balle tôt sur repère','Placer un repère de rebond dans la diagonale revers. Le coach envoie des balles régulières ; le joueur doit prendre la balle devant lui, avant qu’elle ne redescende, puis retrouver sa position de replacement.','Prendre la balle tôt et viser la zone longue sur 6 balles sur 10.'],
      ['Revers en déplacement et retour au centre','Départ sur une pastille centrale. Le coach distribue alternativement revers proche du corps et revers écarté. Après chaque frappe, le joueur contourne un plot de replacement avant la suivante.','Garder une préparation équilibrée et atteindre la cible sur 6 balles sur 10.'],
      ['Diagonale revers avec décision','Les deux joueurs échangent en diagonale revers. Une balle courte autorise l’attaque long de ligne ; une balle profonde impose de poursuivre la construction croisée. Le point se joue jusqu’au bout.','Choisir la bonne réponse sur 7 situations sur 10.']
    ]
  },
  service: {
    label:'Service', objective:'Fiabiliser la mise en jeu et construire la première frappe après le service.',
    drills:[
      ['Lancer et zone annoncée','Délimiter trois cibles dans le carré. Le serveur annonce sa cible avant le lancer, réalise sa routine complète et sert. Recommencer en alternant côté égalité et avantage.','Atteindre la zone annoncée sur 6 services sur 10, sans précipiter le lancer.'],
      ['Service + première frappe','Le serveur annonce une zone. Le relanceur retourne dans une zone connue ; le serveur doit jouer la première frappe dans l’espace libéré, puis le point devient libre.','Construire une première frappe cohérente sur 6 points sur 10.'],
      ['Service sous pression et première frappe','Jouer des points à score annoncé. Après chaque mise en jeu, le serveur doit enchaîner une première frappe vers la zone libre ; une cible touchée donne un bonus uniquement si le joueur gagne ensuite l’échange.','Garder une intention claire au service et construire la première frappe sur 6 points sur 10.']
    ]
  },
  retour: {
    label:'Retour', objective:'Lire la mise en jeu et orienter le retour avec une intention adaptée à la première ou à la seconde balle.',
    drills:[
      ['Lecture de la mise en jeu','Le serveur alterne première balle appuyée et seconde balle plus lente. Le relanceur annonce « première » ou « seconde » avant le rebond, puis joue vers une cible longue croisée ou au centre.','Identifier correctement 8 services sur 10 et viser 6 retours sur 10.'],
      ['Retour et replacement','Le relanceur démarre derrière sa ligne. Après le retour, il doit retrouver une position de jeu avant la frappe suivante du serveur. Le serveur joue ensuite librement.','Remettre le retour en jeu et se replacer sur 7 points sur 10.'],
      ['Point avec intention de retour','Le serveur choisit librement sa zone. Le relanceur marque un bonus si son retour neutralise la première attaque ou met le serveur en déplacement.','Obtenir une réponse tactique utile sur 5 points sur 8.']
    ]
  },
  smash: {
    label:'Smash', objective:'Se placer sous le lob, frapper haut devant soi et choisir une zone de finition.',
    drills:[
      ['Placement sous le lob','Le coach envoie des lobs réguliers au-dessus de l’épaule. Le joueur recule avec des pas croisés, se replace sous la balle puis frappe un smash contrôlé vers une grande cible.','Se placer correctement et atteindre la cible sur 6 lobs sur 10.'],
      ['Smash après déplacement','Alterner lob court et lob profond. Le joueur annonce sa zone de déplacement, ajuste ses appuis et frappe haut devant lui sans se laisser enfermer sous la balle.','Réaliser 6 smashes équilibrés sur 10.'],
      ['Lob, smash et finition en point','Démarrer par un échange où le partenaire cherche à lober. Le joueur doit identifier le lob, reculer, jouer le smash puis terminer le point.','Choisir la bonne trajectoire et finir 5 points sur 8.']
    ]
  },
  volley: {
    label:'Jeu au filet', objective:'Rendre la volée plus stable et mieux choisir la zone de finition.',
    drills:[
      ['Volée de bloc dans les pieds','Le joueur part à la ligne de service. Le coach envoie une balle basse dans les pieds ; le joueur avance, bloque la volée devant lui et vise une zone profonde au centre.','Contrôler 6 volées sur 10 sans grand geste arrière.'],
      ['Approche puis volée de finition','Le coach envoie une balle d’approche. Le joueur choisit une direction sûre, avance vers le filet et joue une volée de finition dans la zone opposée à l’adversaire.','Enchaîner approche et finition dans 5 séquences sur 8.'],
      ['Volée avec lecture du passing','Un adversaire en fond de court choisit passing croisé ou long de ligne. Le volleyeur part d’une position centrale et doit lire l’orientation de la frappe pour fermer le bon angle.','Faire le bon premier déplacement sur 6 points sur 10.']
    ]
  },
  defense: {
    label:'Défense', objective:'Se réorganiser après le déplacement et remettre une balle qui permet de reprendre le point.',
    drills:[
      ['Défendre puis retrouver le centre','Le coach alterne balle large à droite et à gauche. Après chaque défense, le joueur repasse par une pastille centrale avant la distribution suivante.','Remettre 7 balles sur 10 dans une zone haute et profonde.'],
      ['Défense vers neutralisation','Le coach attaque une balle sur le côté. Le joueur doit défendre haut et croisé dans une grande zone de sécurité, puis reprendre progressivement sa position.','Neutraliser 6 attaques sur 10 sans chercher le gagnant.'],
      ['Point avec départ déséquilibré','Le défenseur commence décalé dans un couloir. Le partenaire engage dans l’espace opposé ; le point se joue librement et le défenseur cherche d’abord à se rééquilibrer.','Prolonger l’échange ou reprendre l’initiative sur 5 points sur 8.']
    ]
  },
  attaque: {
    label:'Attaque', objective:'Reconnaître la balle favorable et choisir une attaque qui ouvre le terrain.',
    drills:[
      ['Repérage de balle favorable','Le coach alterne balles longues et balles courtes. Une balle qui rebondit dans la zone courte déclenche l’attaque ; une balle profonde impose de construire.','Déclencher l’attaque uniquement sur 7 bonnes lectures sur 10.'],
      ['Décalage et choix de direction','Le coach joue sur le revers. Le joueur se décale autour d’un plot et choisit long de ligne ou court croisé selon la hauteur et la profondeur de la balle.','Choisir la direction adaptée sur 6 balles sur 10.'],
      ['Attaque et transition vers l’avant','Sur balle favorable, le joueur attaque dans une zone puis monte. Le point continue avec deux volées maximum pour finir ; si la balle n’est pas favorable, il doit reconstruire.','Prendre la bonne décision attaque/attente sur 6 points sur 10.']
    ]
  },
  physique: {
    label:'Déplacements et coordination', objective:'Améliorer la qualité des appuis et la capacité à se replacer entre deux frappes.',
    drills:[
      ['Appuis déclenchés par la trajectoire','Le joueur démarre sur une pastille. Le coach annonce ou montre une direction au départ de la frappe ; le joueur réalise le premier pas, ajuste ses appuis et frappe une balle contrôlée.','Déclencher le premier pas sans retard sur 8 départs sur 10.'],
      ['Frappe et replacement avec atelier court','Après chaque frappe, le joueur contourne un plot puis revient sur sa pastille. Alterner séries de 4 balles côté coup droit et revers, avec récupération courte entre les séries.','Garder un replacement équilibré sur 3 séries consécutives.'],
      ['Déplacement en situation de point','Le point commence par une distribution aléatoire droite/gauche. Le joueur doit se replacer après chaque frappe ; le point reste libre et le coach observe la qualité des appuis sous fatigue.','Conserver la qualité des appuis sur 6 échanges sur 8.']
    ]
  },
  mental: {
    label:'Engagement et routines', objective:'Installer une routine simple pour rester engagé et retrouver une intention après une erreur.',
    drills:[
      ['Routine entre deux points','Jouer des séquences courtes. Après chaque point, le joueur s’éloigne, respire, annonce une intention simple et revient prêt pour le point suivant.','Appliquer la routine sur 8 points sur 10.'],
      ['Rebond après erreur','Le joueur démarre chaque série à 0. Après une faute directe, il doit appliquer sa routine et jouer le point suivant avec une intention tactique annoncée.','Garder une intention claire après une erreur sur 6 situations sur 8.'],
      ['Score sous pression','Jouer des points en commençant à 30-30. Le joueur doit annoncer son intention avant le point et évaluer ensuite s’il l’a respectée, quel que soit le résultat.','Respecter son intention sur 6 points sur 10.']
    ]
  },
  construction: {
    label:'Construction du point', objective:'Construire l’échange avec de la longueur, de la variation et une lecture de la position adverse.',
    drills:[
      ['Profondeur avant variation','Délimiter une zone longue à droite et à gauche. Le joueur doit atteindre deux fois la zone profonde avant de pouvoir varier la direction.','Atteindre la zone profonde deux fois avant la variation sur 6 séquences sur 10.'],
      ['Faire bouger puis jouer dans l’espace libre','Échange coopératif : alterner droite et gauche pour déplacer le partenaire. Dès qu’il est en retard ou qu’une balle courte apparaît, le joueur choisit la zone libre.','Créer une ouverture sans précipiter la frappe sur 5 échanges sur 8.'],
      ['Point à contrat de construction','Le point commence en diagonale. Un bonus est accordé si le joueur construit avec deux balles profondes avant de changer de direction ou d’avancer sur une balle courte.','Respecter le contrat dans 6 points sur 10.']
    ]
  }
};

function sourceWeekFor(focus, recentSessions = []) {
  const terms = {
    'coup-droit':['attaque cd','construction cd','cd'],
    revers:['construction revers','revers'],
    service:['service'],
    retour:['retour','service / retour'],
    volley:['volee','jeu au filet','volley'],
    defense:['defense'],
    attaque:['attaque'],
    physique:['defense couverture','deplacement'],
    mental:['match'],
    construction:['construction','faire bouger','longueur']
  }[focus] || [];
  const recent = new Set(recentSessions.slice(0,3).map(row => Number(row.source_week)).filter(Boolean));
  const ranked = (groupProgram.weeks || []).filter(week => (week.courts || []).some(Boolean)).map(week => {
    const label = normalize(week.theme);
    const score = terms.reduce((sum, term) => sum + (label.includes(normalize(term)) ? (term.length > 5 ? 3 : 1) : 0), 0);
    return { week, score, recent: recent.has(Number(week.week)) };
  }).filter(row => row.score > 0).sort((a,b) => b.score-a.score || Number(a.recent)-Number(b.recent) || a.week.week-b.week.week);
  return ranked[0]?.week || null;
}


function criterionSpecificPlan(selectedCriterion, fallbackPlan, focus) {
 if(!selectedCriterion?.criterion)return fallbackPlan;
 const criterion=String(selectedCriterion.criterion),sub=normalize(selectedCriterion.subtheme||''),theme=normalize([selectedCriterion.main_theme,selectedCriterion.subtheme].filter(Boolean).join(' ')),key=normalize(criterion);
 const has=(...words)=>words.some(word=>key.includes(normalize(word)));
 let drills,objective='Travailler précisément « '+criterion+' » dans des situations progressives et transférables au match.';
 if(theme.includes('service')&&!theme.includes('retour')){
  drills=has('lancer','latéral')?[
   ['Lancer dans une fenêtre','Réaliser 10 lancers sans frapper vers une fenêtre matérialisée légèrement devant et sur le côté. Relever les lancers qui permettent un contact confortable.'],
   ['Lancer puis frappe','Enchaîner lancer et service à intensité modérée. Le coach vérifie la zone de chute et l’équilibre du joueur.'],
   ['Service avec cible','Alterner côtés égalité et avantage. Annoncer une zone avant le lancer puis servir en conservant le même repère.']
  ]:has('coude','préparation','raquette','rythme','coordination')?[
   ['Position de préparation','Répéter le geste sans balle puis avec lancer, en marquant une pause dans la position de préparation. Le coach observe le critère sélectionné.'],
   ['Rythme lancer-frappe','Servir à intensité modérée en gardant un rythme continu entre préparation, lancer et frappe.'],
   ['Service + première frappe','Servir vers une zone annoncée puis jouer la première frappe dans l’espace libéré. Le point continue ensuite.']
  ]:[
   ['Service technique ciblé','Réaliser 10 services vers une grande cible en appliquant le critère choisi.'],
   ['Service et variation de zone','Alterner deux zones annoncées avant le lancer sans modifier la routine.'],
   ['Service + point à thème','Jouer le point après le service. Bonus si le critère choisi est respecté sur la mise en jeu.']
  ];
 }else if(theme.includes('retour')){
  const first=sub.includes('premiere'),serve=first?'première balle':'deuxième balle';
  if(has('prise de balle','tardive','anticipation','réactivité'))drills=[
   ['Lecture et déclenchement sur '+serve,'Le serveur varie direction et longueur. Le relanceur réalise une reprise d’appuis au lancer puis déclenche la préparation dès la lecture de trajectoire.'],
   ['Retour orienté compact sous vitesse','Recevoir 10 services de '+serve+' dans deux zones. Raccourcir la préparation et prendre la balle devant soi, sans chercher la vitesse.'],
   ['Retour anticipé en point','Jouer des points sur '+serve+'. Le relanceur doit lire tôt la trajectoire et prendre une décision avant le rebond.']
  ];
  else if(has('profondeur','court','centré','zone','direction','variation'))drills=[
   ['Retour sur cible profonde','Servir 10 '+serve+' ; viser une zone longue croisée puis une zone longue au centre, avec une trajectoire de sécurité.'],
   ['Retour avec deux intentions','Annoncer avant le service si le retour sera croisé ou au centre. Ajuster la direction selon la zone de service.'],
   ['Retour tactique en point','Jouer des points sur '+serve+'. Bonus si le retour sort le serveur de sa zone de confort sans prendre un risque excessif.']
  ];
  else if(has('initiative','attaque','risque'))drills=[
   ['Retour neutre puis retour agressif','Alterner des services faciles et plus appuyés. Sur balle favorable, avancer et prendre l’initiative ; sinon, remettre profond au centre.'],
   ['Deuxième balle à attaquer','Pour la première balle : neutraliser. Pour la deuxième : avancer et viser une zone offensive.'],
   ['Point avec choix de retour','Jouer des points en alternant première et deuxième balle. Le bonus récompense le bon choix entre neutraliser et attaquer.']
  ];
  else drills=[
   ['Lecture de '+serve,'Le serveur alterne les services correspondant au thème. Le relanceur lit la trajectoire et prépare une réponse compacte.'],
   ['Retour orienté sur cible','Servir dans deux zones. Le relanceur ajuste sa position puis dirige le retour vers une cible profonde en appliquant le critère choisi.'],
   ['Retour puis premier échange','Jouer des points avec le type de service ciblé. Bonus si le retour respecte le critère et permet de jouer la balle suivante en équilibre.']
  ];
 }else if(theme.includes('volee')||theme.includes('filet')||theme.includes('volley')){
  const stroke=sub.includes('revers')?'revers':'coup droit';
  drills=has('direction','tamis','profondeur','centr','zone','courte','longue','haute')?[
   ['Volée '+stroke+' sur cible','Depuis la ligne de service, jouer 10 volées '+stroke+' vers une cible croisée ou longue en contrôlant l’orientation du tamis.'],
   ['Contrôle de longueur en volée '+stroke,'Alterner volée courte et volée longue selon la hauteur de balle. Le coach annonce la cible avant la distribution.'],
   ['Volée de finition','Jouer une approche puis une volée '+stroke+' dans l’espace libre. Le point se termine librement.']
  ]:has('poignet','absorption','vitesse')?[
   ['Volée bloc et absorption','Le coach envoie des balles rapides. Le joueur garde une prise ferme mais relâchée, amortit la vitesse et bloque devant lui.'],
   ['Volée sur balle lourde','Recevoir des balles de vitesse variable et adapter l’angle du tamis sans grand geste arrière.'],
   ['Absorption sous pression','Jouer des points où le partenaire accélère volontairement sur le volleyeur. Contrôler la réponse avant de chercher à finir.']
  ]:has('réactivité','prise de balle','préparation')?[
   ['Préparation et contact précoces','Le coach distribue des balles à hauteur variable. Préparer tôt et contacter devant le corps avec un geste compact.'],
   ['Réaction au filet','Départ au centre du carré ; le coach choisit la direction au dernier moment. Déclencher le premier pas et bloquer la volée.'],
   ['Approche-volée en point','Sur balle courte, jouer une approche puis avancer pour jouer une volée '+stroke+'.']
  ]:[
   ['Équilibre en volée '+stroke,'Le coach distribue des balles proches et écartées. Ajuster les appuis avant le contact et finir en équilibre.'],
   ['Volée '+stroke+' en avançant','Avancer depuis une pastille, ajuster les appuis et jouer la volée sans reculer au contact.'],
   ['Approche-volée en point','Sur balle courte, jouer une approche puis avancer pour jouer une volée '+stroke+'.']
  ];
 }else if(theme.includes('coup droit')||theme.includes('revers')){
  const stroke=theme.includes('revers')?'revers':'coup droit';
  if(has('prise de balle','tôt','montante','plan de frappe'))drills=[
   ['Repère de prise de balle','Placer un repère de rebond dans la zone de frappe. Distribuer 10 balles régulières ; contacter devant soi en phase montante.'],
   ['Prise de balle tôt en déplacement','Alterner balle au corps et balle écartée. Ajuster les appuis et contacter avant le sommet du rebond.'],
   ['Prise de balle tôt en échange','Échanger en diagonale '+stroke+'. Prendre tôt une balle sur deux avant de jouer le point librement.']
  ];
  else if(has('préparation','orientation des épaules','raquette'))drills=[
   ['Préparation avant le rebond','Le coach annonce la direction au départ de sa frappe. Tourner les épaules et préparer la raquette avant le rebond.'],
   ['Préparation en déplacement','Alterner balles proches et écartées. Préparer dès la lecture de trajectoire puis ajuster les appuis.'],
   ['Préparation sous incertitude','Varier longueur et direction. Préparer tôt sans anticiper la direction finale puis jouer le point.']
  ];
  else if(has('régularité','centrage','stabilité','équilibre'))drills=[
   ['Régularité en diagonale','Réaliser 10 frappes '+stroke+' dans une zone profonde matérialisée, avec marge au-dessus du filet.'],
   ['Régularité avec cible alternée','Alterner deux zones de profondeur en conservant un équilibre stable à l’impact.'],
   ['Régularité transférée au point','Commencer en diagonale '+stroke+' ; construire avec deux frappes régulières avant de jouer librement.']
  ];
  else if(has('transfert','poids du corps','poussée des jambes'))drills=[
   ['Transfert du poids sur frappe contrôlée','Depuis une position stable, réaliser 10 frappes en avançant légèrement le poids du corps vers l’avant au moment de l’impact, sans perdre l’équilibre.'],
   ['Transfert après déplacement','Alterner balle courte et balle longue. Ajuster les appuis puis transférer le poids vers la cible au moment de la frappe.'],
   ['Transfert en situation de point','Jouer des points avec bonus si le joueur s’engage vers la balle et transfère son poids sans se déséquilibrer.']
  ];
  else if(has('accélération','tête de raquette','amplitude'))drills=[
   ['Accélération progressive de la raquette','Réaliser 10 frappes à intensité croissante en gardant une préparation relâchée et une accélération nette au moment de l’impact.'],
   ['Accélérer sur balle favorable','Le coach alterne balle neutre et balle courte. Accélérer uniquement sur la balle favorable en gardant une zone cible.'],
   ['Accélération dans le point','Construire deux frappes contrôlées puis accélérer sur une balle favorable avant de jouer le point librement.']
  ];
  else if(has('accompagnement','finition','relâchement','bras non directeur','extension du bras','poignet'))drills=[
   ['Finition guidée','Réaliser 10 frappes en exagérant le trajet d’accompagnement demandé, puis réduire progressivement l’amplitude pour retrouver un geste naturel.'],
   ['Finition après déplacement','Alterner les directions et conserver l’accompagnement du geste malgré le déplacement.'],
   ['Finition en échange','Jouer une diagonale en observant la continuité du geste après l’impact, puis terminer le point librement.']
  ];
  else if(has('effet','trajectoire','hauteur','variation'))drills=[
   ['Contraste de trajectoires','Depuis le panier, alterner une balle liftée haute et une balle plus tendue en gardant une zone de rebond identique.'],
   ['Variation dans l’échange','Échanger en diagonale '+stroke+' et annoncer l’effet ou la trajectoire recherchée avant la frappe.'],
   ['Variation avec intention','Construire deux frappes puis varier l’effet ou la hauteur pour déplacer l’adversaire.']
  ];
  else if(has('distance','placement','corps'))drills=[
   ['Distance balle-corps avec repères','Placer deux repères au sol pour matérialiser la distance de frappe. Distribuer des balles variées et ajuster les appuis avant le contact.'],
   ['Ajustement sur balle décalée','Alterner balle au corps, proche et écartée. Utiliser des petits pas pour retrouver la bonne distance.'],
   ['Distance adaptée en point','Jouer des points avec distributions variées. Bonus si la distance de frappe est confortable et équilibrée.']
  ];
  else drills=[
   ['Répétition technique ciblée','Distribuer 10 balles sur le '+stroke+'. Travailler le critère choisi avec une consigne unique et une cible large.'],
   ['Critère ciblé avec déplacement','Varier profondeur et direction en conservant le repère technique choisi.'],
   ['Transfert du critère au point','Démarrer en diagonale '+stroke+' puis jouer librement après deux frappes appliquant le critère.']
  ];
 }else if(theme.includes('jeu de jambes')||theme.includes('déplacement')){
  drills=has('replacement','repositionnement','centre')?[
   ['Frappe et retour au repère','Après chaque frappe, revenir toucher une pastille centrale avant la distribution suivante.'],
   ['Replacement avec incertitude','Le coach choisit la direction suivante après la frappe. Retrouver la position d’attente puis déclencher le premier pas.'],
   ['Points avec bonus replacement','Jouer des points libres ; bonus si une position équilibrée est retrouvée après chaque frappe.']
  ]:[
   ['Départ sur signal','Depuis la position d’attente, déclencher le premier pas à la frappe du coach puis rejoindre une balle distribuée.'],
   ['Déplacement et frappe équilibrée','Alterner les directions et les distances. Ajuster les appuis avant de frapper dans une zone large.'],
   ['Déplacement en point','Démarrer avec une distribution aléatoire et appliquer le critère sur les trois premières frappes.']
  ];
 }else if(theme.includes('smash')){
 drills=has('placement','deplacement','appuis','trajectoire')?[
  ['Lecture du lob et premier déplacement','Le coach envoie des lobs de hauteurs et profondeurs variées. Lire la trajectoire, pivoter et démarrer en pas croisés pour se placer derrière la balle.'],
  ['Ajustement et smash sur cible','Après le déplacement, ajuster en petits pas, frapper le smash au-dessus et légèrement devant soi vers une cible profonde ou croisée.'],
  ['Lob aléatoire puis point','Le coach choisit entre lob et balle courte. Le joueur doit identifier le lob, se placer et finir au smash ; le point continue après la frappe.']
 ]:has('direction','zone','controle')?[
  ['Smash dans une grande zone','Depuis une position stable, jouer 10 smashs vers une grande cible annoncée avant l’envoi du lob.'],
  ['Smash avec choix de zone','Le coach varie les lobs. Le joueur annonce la zone libre après avoir lu la position adverse puis dirige son smash.'],
  ['Smash en situation de point','Le point commence par un lob défensif. Le joueur se place et choisit une zone de finition adaptée, puis termine le point.']
 ]:[
  ['Coordination lancer-frappe du smash','Sans opposition, répéter le déplacement sous le lob et le geste de frappe avec une balle facile, en gardant le contact haut et devant.'],
  ['Smash après déplacement','Alterner lobs courts et profonds. Se déplacer, ajuster les appuis puis frapper en équilibre.'],
  ['Smash et replacement','Après chaque smash, retrouver une position de couverture et jouer la balle suivante si elle revient.']
 ];
 }else if(theme.includes('tactique')){
  drills=has('espace','angle','adversaire','zone libre')?[
   ['Fixer puis ouvrir','Jouer deux balles profondes dans une zone pour fixer l’adversaire, puis jouer dans l’espace opposé. Le coach observe le déplacement réellement créé.'],
   ['Lecture de l’espace libéré','Le coach ou partenaire se déplace après chaque frappe. Le joueur doit lire sa position avant de choisir la zone suivante.'],
   ['Points à contrat : déplacer','Jouer 8 points. Bonus si le joueur déplace l’adversaire avant d’exploiter l’espace libéré, sans tenter le gagnant trop tôt.']
  ]:has('longueur','profondeur')?[
   ['Construire par la profondeur','Échanger en diagonale avec une cible derrière la ligne de service. Chercher deux balles profondes avant toute variation.'],
   ['Profondeur puis changement','Après deux balles profondes, le coach envoie une balle plus courte. Le joueur avance et change de direction avec marge.'],
   ['Points à contrat : longueur','Bonus si le joueur repousse l’adversaire par la longueur avant de changer de zone au bon moment.']
  ]:has('initiative','decision','choix','risque','adaptation')?[
   ['Lecture de la qualité de balle','Le coach alterne balle profonde rapide, balle neutre et balle courte. Le joueur annonce défendre, construire ou attaquer avant de jouer.'],
   ['Décision avec adversaire mobile','Le partenaire varie sa position. Le joueur choisit la zone selon la qualité de balle et l’espace réellement disponible.'],
   ['Points scénarisés','Jouer des points avec score ou situation de départ imposés. Le joueur verbalise son intention puis applique le choix tactique adapté.']
  ]:[
   ['Construction à deux intentions','Construire un point avec une première frappe de préparation puis une seconde frappe destinée à déplacer ou prendre l’initiative.'],
   ['Choix selon la position adverse','Le partenaire alterne position centrée et décalée. Le joueur choisit une zone cohérente et justifie son choix.'],
   ['Points à thème tactique','Jouer 8 points avec bonus si le critère tactique sélectionné est respecté au bon moment.']
  ];
 }else if(theme.includes('mental'))drills=[
  ['Routine entre les points','Jouer cinq points. Entre chaque point, appliquer une routine courte puis annoncer une intention simple.'],
  ['Réaction après erreur','Après une faute, se recentrer et jouer le point suivant avec un objectif annoncé.'],
  ['Score à enjeu','Jouer des points à 30-30 et évaluer après chaque point le respect du critère mental.']
 ];
 else if(theme.includes('physique'))drills=[
  ['Atelier physique ciblé','Réaliser trois séries courtes de déplacements tennis avec une consigne liée au critère sélectionné.'],
  ['Efforts répétés avec balle','Alterner déplacement, frappe contrôlée et retour au centre sur huit répétitions.'],
  ['Transfert physique au point','Jouer des points avec départ imposé et observer la conservation du critère sous fatigue.']
 ];
 else if(theme.includes('tactique'))drills=[
  ['Lecture de situation','Alterner balle profonde et balle courte. Annoncer construire, déplacer ou attaquer avant de jouer.'],
  ['Schéma tactique à deux frappes','Construire deux frappes selon le critère puis jouer la troisième balle librement.'],
  ['Points à contrat tactique','Jouer huit points avec bonus si le critère est appliqué au bon moment, sans forcer.']
 ];
 if(!drills)drills=fallbackPlan.drills.map(d=>[d[0]+' · critère ciblé',d[1]+' Le coach observe spécifiquement : '+criterion+'.']);
 return {...fallbackPlan,objective,drills:drills.map(d=>[d[0],d[1],''])};
}

function distributeMinutes(total) {
  const ratios = [0.3,0.35,0.35];
  const first = Math.round(total*ratios[0]);
  const second = Math.round(total*ratios[1]);
  return [first,second,total-first-second];
}

export function generateOriginalSession({
  theme = 'construction', selectedObjective = null, selectedCriterion = null, customObjective = '',
  playerName = 'le joueur', level = 'Intermédiaire', difficulty = 'progressive',
  priorAdjustment = null, age = null, playerType = 'Loisir', duration = 90,
  priority = null, challenge = null, recentSessions = [], customExercises = []
} = {}) {
  const minutes = [60,90,120].includes(Number(duration)) ? Number(duration) : 90;
  const explicitFocus = [selectedCriterion?.main_theme, selectedCriterion?.subtheme, selectedCriterion?.criterion, selectedObjective?.label, selectedObjective?.theme, theme].filter(Boolean).join(' ');
  const evidenceFocus = [priority?.criterion, priority?.subtheme, priority?.main_theme].filter(Boolean).join(' ');
  const focus = classifyFocus(selectedCriterion ? explicitFocus : (priority?.criterion ? evidenceFocus : explicitFocus || evidenceFocus));
  const basePlan = DRILLS[focus] || DRILLS.construction;
  const plan = criterionSpecificPlan(selectedCriterion, basePlan, focus);
  const sourceWeek = sourceWeekFor(focus, recentSessions);
  const allocations = distributeMinutes(minutes);
  const difficultySettings = {
    very_easy: { label: 'Très facile', target: 4, instruction: 'Grande zone de sécurité, rythme lent et consigne simple.' },
    easy: { label: 'Facile', target: 5, instruction: 'Contrainte modérée, rythme confortable et cible large.' },
    medium: { label: 'Moyen', target: 6, instruction: 'Rythme normal et précision régulière.' },
    hard: { label: 'Difficile', target: 8, instruction: 'Cible réduite, déplacement ou prise de décision plus exigeante.' },
    very_hard: { label: 'Très difficile', target: 9, instruction: 'Forte exigence de précision, vitesse et décision sous pression.' }
  };
  const selectedDifficulty = difficultySettings[difficulty] || difficultySettings.medium;
  const phases = plan.drills.map((drill,index) => {
    const successCriteria = 'Réussir le comportement attendu sur au moins ' + selectedDifficulty.target + ' tentatives sur 10.';
    return {
      name: ['Situation de contrôle','Situation avec déplacement ou lecture','Transfert en points'][index],
      minutes: allocations[index],
      objective: plan.objective,
      content: drill[0] + '\n' + drill[1] + '\nCritère de réussite : ' + successCriteria,
      success_criteria: successCriteria,
      origin: 'Situation créée par Coach In à partir du référentiel de critères et des objectifs pédagogiques.'
    };
  });
  const sourceLabel = sourceWeek
    ? 'Inspiration complémentaire : Cours de l’année.xlsx · Semaine ' + sourceWeek.week + ' · ' + String(sourceWeek.theme).replace(/^SEMAINE\s+\d+\s*:\s*/i,'')
    : 'Aucune semaine source directement comparable ; situations construites à partir du critère et du référentiel pédagogique.';
  const recentHistoryLabel = recentSessions.length ? 'Historique des séances récentes pris en compte : ' + recentSessions.slice(0,2).map(row => row.title || row.theme || ('semaine ' + (row.source_week || '?'))).join(' · ') + '. Varier la situation proposée pour éviter une répétition immédiate.' : 'Aucun historique récent transmis : la séance est construite sans hypothèse de répétition.';
  const adaptationLabel = Number(age) > 0 && Number(age) <= 12 && /débutant|initiation/i.test(level) ? 'Progression accessible' : 'Progression adaptée au niveau déclaré';
  const evidenceLabel = selectedCriterion?.criterion
    ? 'Critère choisi par le coach : ' + selectedCriterion.main_theme + ' · ' + selectedCriterion.subtheme + ' · ' + selectedCriterion.criterion + '. Les trois situations sont construites autour de ce critère.'
    : priority?.criterion
      ? 'Critère récurrent observé : ' + priority.criterion + ' (' + (priority.occurrences ?? 2) + ' des 3 derniers bilans).'
      : 'Aucune priorité fiable confirmée : séance de diagnostic et d’observation, sans prétendre cibler une difficulté récurrente.';
  const coachingNotes = [
    'Joueur : ' + playerName + ' · Profil : ' + playerType + ' · Niveau : ' + level,
    evidenceLabel,
    'Objectif : ' + plan.objective,
    sourceLabel,
    'Les situations sont des propositions originales ; le coach ajuste distance, vitesse et difficulté au niveau réel du joueur.'
  ].join('\n');
  return {
    generated:true, generation_mode:'original', theme:plan.label, focus:plan.label,
    objective_criteria:selectedCriterion?.criterion ? [selectedCriterion.criterion] : (priority?.criterion ? [priority.criterion] : (selectedObjective?.criteria || [])),
    duration_minutes:minutes, objective:plan.objective, coaching_notes:coachingNotes,
    exercise_1:phases.slice(0,2).map((phase,index)=>'SITUATION '+(index+1)+' · '+phase.minutes+' min\n'+phase.content).join('\n\n'),
    exercise_2:'TRANSFERT EN POINTS · '+phases[2].minutes+' min\n'+phases[2].content,
    player_visible_summary:plan.objective+' Les situations évoluent du contrôle vers le jeu à thème.',
    success_criteria:phases.map(phase=>phase.success_criteria).join(' '),
    selected_criterion:selectedCriterion ? {id:selectedCriterion.id,main_theme:selectedCriterion.main_theme,subtheme:selectedCriterion.subtheme,criterion:selectedCriterion.criterion} : null,
    adaptation:adaptationLabel,
    difficulty:selectedDifficulty.label,
    difficulty_rule:selectedDifficulty.instruction+' Le critère de réussite est réglé à '+selectedDifficulty.target+'/10.',
    progression:priorAdjustment || null, phases, exercise_count:phases.length,
    coach_feed_count:0, source_week:sourceWeek ? Number(sourceWeek.week) : null,
    source_file:sourceWeek ? 'Cours de l’année.xlsx' : null,
    source_label:sourceLabel, evidence_label:evidenceLabel, generated_exercises:true
  };
}
