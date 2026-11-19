# Coach In — refonte technique v2

Cette livraison est un projet web statique modulaire, prévu pour être versionné sur GitHub et hébergé sur Vercel. Elle ne nécessite pas d'étape de compilation : les modules JavaScript natifs sont chargés par le navigateur.

> **État opérationnel au 19/11/2026.** Coach In est déployé sur Vercel en production depuis la branche `main`. Supabase production et préproduction sont connectés. Les migrations applicatives sont appliquées sur les deux bases. Le catalogue validé de 328 critères est maintenant initialisé séparément pour chaque coach actif. Les fonctions `manage-coaches` et `analyze-tennis-video` sont actives sur les deux projets. Les rappels 24 h sont planifiés par `pg_cron`. La préproduction Vercel utilise la branche `qa/preproduction-vercel-2026-11-19` et la base de test.

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

- La branche `main` est reliée au projet Vercel `coach-in-test-2` et déclenche le déploiement de production après chaque commit.
- Les branches `qa/**` déclenchent la campagne GitHub Actions (tests Node 20/22 et vérification syntaxique).
- La branche `qa/preproduction-vercel-2026-11-19` utilise la configuration publique du projet Supabase de test ; son déploiement Vercel est une Preview, jamais une mise en production.
- Les migrations SQL sont versionnées dans `supabase/migrations/`. Toujours vérifier le projet cible et sauvegarder avant toute nouvelle migration.

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

Le guide détaillé est dans `supabase/ORDRE_INSTALLATION.md`. Les deux projets Coach In existants ont déjà reçu leurs migrations. Cette séquence d'installation ne concerne que la création d'un nouveau projet ; ne pas la rejouer sur une base déjà initialisée. Les tests RLS et les essais de connexion multi-comptes doivent être conservés à chaque évolution.

## État des fonctionnalités et points restant à valider

### Fonctionnalités actives
- Planning, cours collectifs et cours particuliers, demandes de réservation et disponibilités hebdomadaires.
- Calendrier saisonnier Zone B, règles de jours fériés et rappels internes 24 h (job Supabase actif toutes les 15 minutes).
- Bibliothèque : programme collectif de 30 semaines et huit modèles de séances particulières générées, ajoutables à la bibliothèque privée du coach.
- Bilans multi-critères, radars, défis mesurables et réussites par coach.
- Catalogue de 328 critères, copié séparément sur chaque compte coach actif sans partager leurs suivis.
- Messagerie privée, pièces jointes, notifications, analyse vidéo IA, suivi privé des corrections, passeport joueur, journal de match et vie du club.
- Prévisions météo intégrées au planning.
- Espace administrateur et gestion des comptes coachs en production.

### Points restant à terminer
- **Recette utilisateur réelle :** vérifier les connexions Coach A, Coach B et joueur sur un appareil mobile, puis tester les parcours réservation, messagerie, bilan et notifications avec les comptes de test.
- **Administrateur en préproduction :** le compte administrateur existe en production ; il n'est pas encore créé dans la base de test. Ne pas promouvoir un compte joueur en administrateur pour contourner ce point.
- **Analyse vidéo IA en préproduction :** la fonction Edge est déployée, mais la présence du secret `OPENAI_API_KEY` dans le projet de test reste à confirmer. Le secret ne doit jamais être placé dans le navigateur ou dans GitHub.
- **Protection des mots de passe compromis :** Supabase Auth signale que la vérification contre les mots de passe compromis est désactivée. À activer dans les paramètres Auth des deux projets.
- **Revue de sécurité :** les RPC `SECURITY DEFINER` sont réservées aux utilisateurs authentifiés, l'exécution anonyme est révoquée et les contrôles `auth.uid()` ont été vérifiés. Les avertissements de linter correspondants demandent néanmoins une revue régulière.
- **Performance :** les index des clés étrangères signalées ont été ajoutés. Il reste des avertissements de plan RLS et de politiques permissives multiples à examiner ; les index non encore utilisés sont attendus sur une base de faible activité.
- **Planning club :** les horaires orange et les créneaux historiques dont les heures exactes ne sont pas confirmées ne doivent pas être générés automatiquement.

Les éléments ci-dessus distinguent les fonctionnalités déployées des vérifications qui nécessitent une connexion utilisateur ou une configuration secrète non accessible depuis le dépôt.
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


## Multi-coachs — règle retenue le 16/11/2026

Un joueur possède une fiche d'identité unique et peut être rattaché à plusieurs coachs après acceptation d'une invitation. Les suivis restent séparés : chaque coach ne voit et ne modifie que ses propres séances, bilans, notes privées, défis et réussites. Le joueur voit ses historiques personnels avec le nom du coach auteur. Les plannings, bibliothèques, critères et réglages sont privés à chaque coach. La migration corrective est `supabase/006_separate_coach_followups.sql` ; elle doit être appliquée après les migrations 001 à 005 sur un nouvel environnement. La migration `supabase/007_notification_rpc_permissions.sql` durcit ensuite les droits d'exécution de la notification de nouveau bilan.

Le projet Supabase de test a reçu cette migration le 16/11/2026. La branche `feat/separate-coach-followups` contient les changements de code correspondants. La recette multi-comptes et le déploiement ne sont pas encore validés.


Migration de sécurité supplémentaire : `supabase/007_notification_rpc_permissions.sql` retire l'exécution anonyme du RPC de notification d'un nouveau bilan. Elle a été appliquée au projet Supabase de test.


La migration `supabase/008_private_session_notes_and_invoker_views.sql` sépare les notes privées des séances publiées et convertit les vues joueur en vues `security_invoker`, afin que les politiques RLS du compte appelant restent appliquées. Elle doit être exécutée après les migrations 006 et 007.


La migration `supabase/009_booking_reminders_24h.sql` active les rappels internes automatiques 24 h avant les cours particuliers acceptés, avec exécution `pg_cron` toutes les 15 minutes et respect des préférences individuelles. Les rappels sont affichés dans le centre de notifications Coach In ; aucun SMS ou message WhatsApp n'est envoyé par cette migration.


## Administration principale — étape ajoutée le 16/11/2026

La branche de développement prépare un espace administrateur distinct des espaces coach et joueur. L'adresse `axel.bohrer21@gmail.com` est autorisée à recevoir le rôle `admin` lors de la création de son compte Supabase Auth ; les autres inscriptions restent des comptes joueurs par défaut. L'espace administrateur présente les comptes coachs en lecture seule à ce stade. La création, suspension et réactivation des comptes nécessitent une fonction serveur sécurisée et restent à réaliser. Si le compte n'existe pas encore, il faut le créer avec cette adresse et confirmer l'e-mail avant de pouvoir ouvrir l'espace administrateur.
