# Coach In — refonte technique v2

Cette livraison est un projet web statique modulaire, prévu pour être versionné sur GitHub et hébergé sur Vercel. Elle ne nécessite pas d'étape de compilation : les modules JavaScript natifs sont chargés par le navigateur.

> **Statut : préproduction.** Le code a été réorganisé et plusieurs flux sont maintenant branchés. Le projet n'a pas été connecté en direct à Supabase, la migration SQL n'a pas été exécutée et aucun déploiement Vercel n'a été effectué. Il faut valider la migration sur une base de test avant toute mise en production.

## Structure

```text
Coach_In_Reorganise/
├── index.html
├── package.json
├── vercel.json
├── README.md
├── src/
│   ├── app.js
│   ├── config.js
│   ├── styles.css
│   ├── core/                 # DOM, état, client Supabase
│   ├── domain/               # Règles métier pures + tests
│   ├── services/             # Authentification, données, réservations, notifications
│   ├── views/                # Écrans et composants d'interface
│   └── data/                 # Programme collectif source (30 semaines)
├── supabase/
│   ├── 002_coach_in_modules.sql
│   └── 003_group_course_series.sql
└── tests/                    # Réservé aux tests d'intégration
```

## Fonctionnalités branchées dans le code

- Authentification Supabase, espace coach et espace joueur.
- Chargement des données de l'effectif à partir de la relation coach/joueur (pas de lecture globale de tous les joueurs).
- Tableau de bord, effectif filtrable, fiches joueur et planning hebdomadaire avec navigation entre les semaines.
- Création de séances individuelles et de cours collectifs.
- Création de bilans avec moyenne calculée uniquement sur les secteurs renseignés ; aucun champ de commentaire dans le nouveau formulaire de bilan.
- Demandes de réservation joueur, acceptation/refus coach et annulation joueur jusqu'à 24 h avant, via fonctions PostgreSQL transactionnelles.
- Notifications internes consultables et marquables comme lues.
- Chargement des critères, défis et réussites depuis leurs tables lorsqu'elles sont renseignées.
- Programme pédagogique des 30 semaines extrait du classeur `Cours de l'année.xlsx`.
- Paramétrage indépendant de chaque créneau annuel collectif (jour, public, horaire, court, objectif).
- Génération des dates de saison pour chaque créneau configuré, hors vacances et selon les règles de jours fériés.
- Compteurs individuels par créneau : réalisées, planifiées, annulées, restantes et à programmer.
- Règles métier isolées et tests automatisés pour moyenne, âge, seuil de 24 h, succès et défi.

## Installation locale / tests

Prérequis : Node.js 20 ou plus récent pour lancer les tests. L'application elle-même n'a pas besoin de Node en production.

```bash
npm test
```

Pour tester l'interface localement, ouvre le dossier avec un serveur statique local (ne pas ouvrir directement `index.html` en `file://`, car les modules ES nécessitent HTTP).

## Déploiement GitHub / Vercel

1. Sauvegarde le dépôt et la base actuels.
2. Crée une branche `refonte-coach-in` ou un projet Vercel de préproduction.
3. Copie l'intégralité du dossier en conservant l'arborescence.
4. Dans Vercel : Framework Preset `Other`, Build Command vide, Output Directory `.`.
5. Déploie en Preview et vérifie l'URL avant de basculer le domaine de production.

## Configuration Supabase

`src/config.js` contient l'URL et la clé publishable/anon du projet Coach In. Une clé publishable est destinée au navigateur ; elle ne remplace pas les règles RLS. **Ne jamais ajouter une clé `service_role`, un mot de passe SQL ou un secret privé au front-end.**

Installation sur un projet Supabase neuf (préproduction uniquement) :

1. Confirme que tu es dans le bon projet Supabase de test et qu'il ne contient pas déjà les tables Coach In.
2. Exécute `001_initial_schema.sql`.
3. Exécute `002_coach_in_modules.sql`.
4. Exécute `003_group_course_series.sql`.
5. Exécute `004_shared_player_profiles.sql`.
6. Exécute `005_preproduction_smoke_test.sql` et vérifie les résultats.
7. Arrête au premier message d'erreur ; ne passe pas au fichier suivant avant analyse.

Le guide détaillé est dans `supabase/ORDRE_INSTALLATION.md`. Les scripts n'ont pas encore été exécutés contre le serveur Supabase : les tests RLS avec plusieurs comptes restent obligatoires. Ne jamais lancer cette séquence directement en production.

## Limites connues à traiter avant production

- **Disponibilités de réservation :** le joueur peut proposer date/heure/court ; la base refuse les chevauchements connus. Il manque encore le paramétrage des plages horaires autorisées par le coach . Un refus de conflit ne prouve pas que le court est libre dans un éventuel système externe.
- **Rappels 24 h :** il faut déployer une Edge Function et une tâche planifiée Supabase. Le code ne déclenche pas encore de rappels automatiques.
- **Séries récurrentes :** modèle et interface de gestion complète (édition d'une occurrence / série entière) non finalisés.
- **Programme annuel collectif :** les 30 semaines sont importées. Les créneaux annuels peuvent être paramétrés un par un, puis leurs dates générées selon la saison, les vacances Zone B et les règles de jours fériés. Les compteurs sont indépendants par créneau. Les créneaux horaires exacts doivent être saisis depuis le planning validé du club ; aucun horaire n'est prérempli. Les semaines marquées MATCH sans contenu dans le classeur restent vides : aucun exercice n'a été inventé.
- **Créneaux orange du planning source :** ne pas les programmer tant que les horaires précis n'ont pas été vérifiés sur les captures/vidéos originales.
- **Critères tennis :** la structure de stockage existe, mais le catalogue exhaustif validé doit encore être importé sans reformulation ni suppression des doublons. Les formulaires d'évaluation multi-critères et le radar ne sont pas finalisés.
- **Défis et réussites :** les tables et règles métier de base existent, mais l'automatisation complète des déblocages en base et l'affichage du carnet joueur restent à terminer.
- **Catégories FFT :** le calcul fourni dans le module métier est indicatif ; il ne doit pas être utilisé comme classement officiel sans intégrer le barème FFT de la saison concernée.
- **Météo :** non connectée à ce stade. La synchronisation avec un logiciel externe est abandonnée ; le planning Coach In fonctionne de manière autonome.
- **Tests réels :** aucune connexion réelle coach/joueur, aucun test mobile sur appareil, aucun test RLS PostgreSQL et aucun test de restauration n'ont été exécutés ici.

## Sécurité

Les actions de réservation sensibles passent par des fonctions PostgreSQL `SECURITY DEFINER` qui vérifient l'identité et les droits. Les données restent soumises aux politiques RLS. Le navigateur ne constitue jamais une barrière de sécurité. Ne déploie pas avant revue du SQL et tests croisés des comptes.

## Étape progression (ajout du 11/11/2026)
L'écran coach « Évaluations » présente maintenant une synthèse par joueur, la priorité de travail calculée à partir des critères d'amélioration présents dans les bilans et la création manuelle d'un défi mesurable. L'espace joueur affiche une première version de « Mon parcours tennis » avec séances, temps de terrain, thèmes recensés, réussites existantes et défi actif.

Pour que ces éléments soient alimentés, le catalogue de critères et les lignes `evaluation_criteria` doivent être renseignés. Le formulaire de bilan existant ne saisit pas encore ces critères : il ne faut donc pas considérer la détection des défis ou les réussites comme entièrement automatisées. La validation automatique d'un défi sur deux évaluations consécutives et le déblocage automatique des réussites restent à développer.

## Module d'évaluation tennis détaillée (étape actuelle)

Le formulaire coach permet maintenant :
- de saisir les quatre notes Technique / Tactique / Physique / Mental sur 20 ;
- de laisser un secteur vide (il n'entre pas dans la moyenne) ;
- de sélectionner plusieurs critères positifs et critères à améliorer depuis `criteria_catalog` ;
- de saisir une mesure numérique pour un critère d'amélioration sélectionné ;
- de conserver l'identifiant du critère, le thème et le sous-thème dans chaque bilan, sans fusionner deux critères homonymes.

Le moteur de progression :
- débloque automatiquement une réussite après trois évaluations distinctes positives du même identifiant de critère ;
- propose après au moins trois bilans le critère à améliorer le plus récurrent, en comptant au plus une occurrence par bilan ;
- conserve un seul défi actif par joueur ;
- permet au coach de définir un objectif, un opérateur numérique (`>=`, `<=`, `=`) et une cible ;
- clôt le défi après deux évaluations consécutives où la mesure du critère atteint la cible ; une évaluation sans mesure suffisante remet la série à zéro ;
- affiche les radars des quatre secteurs pour les deux derniers bilans, sans graphique linéaire.

### Import du catalogue de critères

Le formulaire charge les critères de la table `criteria_catalog`. Le catalogue complet validé n'est volontairement pas inventé ni remplacé par des critères génériques. Le fichier `docs/criteria_catalog_import_template.csv` fournit l'en-tête d'import attendu : `main_theme`, `subtheme`, `criterion`, `criterion_type` (`positive` ou `improvement`) et `display_order`. Importer les critères validés dans Supabase pour le coach concerné, en conservant les doublons textuels lorsqu'ils appartiennent à des sous-thèmes différents.

### Migration supplémentaire

La migration `supabase/002_coach_in_modules.sql` contient les colonnes requises pour l'identifiant du critère, la mesure numérique et l'opérateur de défi. Elle doit être exécutée une seule fois sur une base de préproduction après sauvegarde, puis testée avec un compte coach et un compte joueur. Elle n'a pas été exécutée depuis cet environnement.

### Tests ajoutés

Les tests couvrent le regroupement des sous-thèmes sans fusion des homonymes, la validation des sélections, les réussites par identifiant sur trois bilans distincts, le calcul de priorité par fréquence, la comparaison à la cible et la construction des quatre axes du radar.


## Fiche de progression individuelle (mise à jour)
- Depuis Évaluations, le coach peut ouvrir une fiche joueur dédiée.
- La fiche regroupe séances, bilans, critères positifs/à améliorer, thèmes travaillés, réussites et défi actif.
- Le carnet joueur présente les critères attachés aux bilans lorsqu'ils existent, sans commentaire privé.
- Le fichier `src/data/criteria-catalog-confirmed.json` et le CSV `docs/criteria_catalog_import_confirmed_partial.csv` contiennent uniquement les critères dont le libellé exact a pu être retrouvé dans les validations précédentes.
- **Catalogue non exhaustif** : les listes détaillées de Service, Retour de service, Volée, Jeu de jambes/déplacements, Mental et certains critères à améliorer du Revers restent à compléter depuis leur texte validé. Ils ne sont pas remplacés par des propositions inventées. Le sous-thème Autonomie est exclu; « Baisse d'engagement pendant le match » doit rester dans les deux sous-thèmes validés Combativité et Attitude en match.
- L'import CSV nécessite d'ajouter l'identifiant du coach dans la table `criteria_catalog` via l'import SQL/outil Supabase adapté; le fichier CSV n'est pas un script autonome.


## Calendrier annuel des cours collectifs (étape ajoutée le 11/11/2026)

Un écran « Cours collectifs » est ajouté à la navigation coach. Il présente la saison du 14/09/2026 au 20/06/2027, les compteurs par jour-type, les risques de rattrapage et les 30 semaines du classeur source. Les règles de dates sont isolées dans `src/domain/group-calendar.js` et couvertes par des tests. Les détails et les dates potentielles calculées sont documentés dans `docs/calendrier_collectif_2026_2027.md`.

**Attention :** les compteurs sont actuellement calculés par jour-type, pas encore par chaque créneau orange individuel. Les horaires précis des blocs adultes et le découpage des plages enfants n'étant pas disponibles, aucun créneau réel n'est généré ou bloqué automatiquement. Il faudra saisir ces horaires pour obtenir un suivi fiable par série. Le catalogue de critères tennis reste partiel (`partial_confirmed`) : seuls les critères dont le libellé exact a été retrouvé sont présents ; les listes manquantes ne sont pas inventées.


## Créneaux annuels collectifs (migration 003)

Dans « Cours collectifs », utiliser « Ajouter un créneau annuel » pour chaque bloc orange réel : nom, public, jour, heures exactes, court et objectif. Renseigner les horaires confirmés par le club avant enregistrement. Le bouton « Générer les dates de la saison » crée une séance par date autorisée, sans doublonner les dates déjà liées à cette série. Les séances annulées restent dans l'historique et ne comptent pas comme réalisées. Le calcul de disponibilité est indicatif : les rattrapages restent à positionner manuellement.

## Validation des séries collectives

La génération d'un créneau annuel vérifie maintenant explicitement la cohérence entre le public et le jour choisi : adultes (lundi, mardi, jeudi, vendredi) et enfants (mercredi, samedi). Un jour incompatible ou un public inconnu est refusé immédiatement au lieu de produire silencieusement une série vide.

La migration corrective historique `004_adoc_schedule_alignment.sql` est obsolète et ne doit pas être exécutée : la synchronisation ADOC a été abandonnée et le vendredi est bien un jour de cours collectif adulte.

## Vérification des réservations — 11/11/2026
- Le contrôle serveur des demandes et de leur acceptation vérifie aussi les indisponibilités déclarées par le coach (`coach_unavailability`).
- La vérification est répétée au moment de l'acceptation afin de tenir compte d'une indisponibilité ajoutée après la demande.
- La validation côté navigateur refuse désormais les dates calendaires impossibles (ex. 31 février).
- Les tests automatisés passent : 25/25. La migration 004 doit être appliquée en préproduction puis testée sur Supabase réel avant mise en production.

## Évaluations — état de la livraison du 11/11/2026
- Le formulaire coach accepte une ou plusieurs notes sur 20 et/ou des critères détaillés ; un bilan entièrement vide est refusé.
- Les mesures numériques sont activées uniquement sur les critères « À améliorer » sélectionnés.
- Les radars ne représentent pas un secteur non noté comme une note de zéro. Le radar à quatre axes est tracé lorsque les quatre notes sont disponibles.
- Le carnet joueur affiche les notes, radars et critères rattachés à chaque bilan.
- Les règles de réussites et défis sont couvertes par des tests métier (trois évaluations distinctes pour une réussite ; fréquence des critères d'amélioration par bilan distinct ; comparaison numérique du défi).
- **Important :** les règles métier locales sont testées, mais l'exécution des automatisations et la sécurité des données doivent encore être vérifiées sur une base Supabase de préproduction après application des migrations. Le catalogue fourni reste `partial_confirmed` et n'est pas exhaustif.
