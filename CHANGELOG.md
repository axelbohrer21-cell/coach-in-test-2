# Journal des modifications — Coach In v2

## Refonte technique
- Découpage du code en modules : domaine, services, vues, état, configuration.
- Centralisation des accès Supabase.
- Ajout de tests automatisés sur les règles métier pures.
- Navigation planning semaine précédente / suivante.
- Ajout de la gestion des cours collectifs et de leur annulation visible.
- Ajout du parcours de demande de réservation joueur, décision coach, annulation sous condition de 24 h et notifications internes.
- Ajout des RPC PostgreSQL pour contrôler les chevauchements au moment de la demande et de l'acceptation.
- Correction du chargement du tableau de bord coach quand l'effectif est vide.
- Limitation des requêtes coach aux joueurs associés.
- Suppression des commentaires dans le formulaire de bilan.

## Non inclus / non vérifié
- Déploiement Vercel, exécution SQL, tests RLS sur Supabase réel.
- Disponibilités paramétrables et intégration ADOC.
- Rappels planifiés 24 h, séries récurrentes, import officiel des créneaux de cours collectifs.
- Catalogue complet de critères, évaluations multi-critères, graphiques radar et automatisations de défis/réussites.

## Étape progression — 11 novembre 2026
- Refonte de l'écran Évaluations coach en vue de suivi individuel par joueur.
- Ajout de la détection de la priorité de travail à partir des critères « improvement » présents dans les bilans, avec décompte par bilan distinct (pas par ligne dupliquée).
- Ajout d'un formulaire coach pour transformer la priorité détectée en défi avec consigne et cible numérique.
- Ajout côté joueur d'un carnet de progression : volume de séances, durée de terrain, réussites déjà enregistrées, défi actif, thèmes rencontrés et chronologie des séances.
- Ajout d'une politique RLS de lecture des critères d'évaluation par le joueur concerné.
- Ajout d'un index garantissant au plus un défi actif par joueur.
- Ajout de tests du calcul des priorités.
- Limite : les formulaires actuels de bilan ne saisissent pas encore les critères positifs / à améliorer ; l'automatisation complète des réussites et de la validation d'un défi en deux évaluations consécutives reste à réaliser.

## Étape progression — moteur d'évaluation détaillée
- Formulaire de bilan enrichi : notes /20 par secteur et sélection multi-critères par thème/sous-thème.
- Conservation des identifiants de critères pour différencier les critères homonymes dans des sous-thèmes différents.
- Mesure numérique par critère d'amélioration sélectionné.
- Déblocage automatique des réussites sur trois évaluations distinctes.
- Proposition de défi après trois bilans, triée par fréquence distincte des bilans.
- Suivi d'un défi actif avec opérateur numérique et validation après deux évaluations consécutives atteignant la cible.
- Radars individuels pour les deux derniers bilans, sans graphique linéaire.
- Migration SQL étendue et 6 nouveaux tests unitaires (15 tests au total).
- Catalogue complet non prérempli : import CSV requis afin de préserver mot pour mot les critères validés et les doublons par sous-thème.


## 11/11/2026 — Fiches de progression individuelles
- Ajout d'une fiche joueur coach avec résumé des séances, bilans, réussites, défi actif, thèmes et historique détaillé des critères.
- Carnet joueur enrichi avec les critères de chaque bilan disponibles.
- Ajout d'un export CSV partiel des critères exactement retrouvés; catalogue exhaustif non prétendu.


## 11 novembre 2026 — Calendrier annuel collectif
- Ajout de l'écran coach « Cours collectifs ».
- Ajout du moteur de dates de cours selon la saison, la Zone B, les jours de semaine et les jours fériés.
- Ajout des compteurs objectifs 28 adultes / 30 enfants, séances réalisées, planifiées, restantes et besoin de rattrapage.
- Ajout de l'affichage des 30 semaines et des exercices par terrain à partir du classeur source.
- Les créneaux horaires non vérifiés restent explicitement non programmés.
- Ajout de tests unitaires sur les calendriers et compteurs.


## 11 novembre 2026 — Créneaux collectifs individualisés
- Ajout de `group_course_series` pour paramétrer un compteur par bloc collectif réel.
- Ajout de la migration `003_group_course_series.sql` et du lien `group_sessions.series_id`.
- Ajout du formulaire de configuration des créneaux : jour, public, horaires, court, objectif.
- Génération des dates de saison selon les règles Zone B / jours fériés, sans créer de doublons.
- Compteurs par série : réalisées, planifiées, annulées, restantes et à programmer.
- Les horaires ne sont pas inventés : ils sont saisis à partir du planning ADOC.
- 21 tests automatisés réussis.

## Correctifs ADOC — 11 novembre 2026
- Vendredi pris en charge comme jour de cours adultes dans la règle SQL des séries.
- Prise en charge des quatre courts visibles dans le planning ADOC (formulaires, validation métier et migrations).
- Texte de l'interface aligné sur la règle confirmée : les blocs orange sont les cours collectifs de référence.
- Ajout de la migration corrective `004_adoc_schedule_alignment.sql` pour les bases ayant déjà exécuté les migrations précédentes.

## 11 novembre 2026 — Contrôle des séries collectives
- Validation explicite du public et du jour lors de la génération d'un créneau annuel.
- Refus clair des jours incompatibles (par exemple une série enfants le lundi) au lieu d'une génération vide silencieuse.
- Ajout de deux tests de non-régression ; suite complète : 24 tests réussis.

## 11 novembre 2026 — Finalisation du module d'évaluation (interface et contrôles)
- Activation effective du champ de mesure numérique uniquement lorsque le critère « À améliorer » est sélectionné ; désélectionner efface et désactive la mesure.
- Un bilan vide (aucune note et aucun critère) est refusé avant enregistrement.
- Les radars n'affichent plus un secteur non noté comme s'il s'agissait d'une note nulle ; le radar complet est affiché lorsque les quatre secteurs sont renseignés, avec les valeurs réelles listées.
- Le carnet joueur affiche désormais les radars et les critères positifs / à améliorer de chaque bilan.
- Ajout de tests métier supplémentaires sur le contenu minimal d'un bilan, les mesures, les réussites, les défis et les radars.
- Vérification locale : 31 tests automatisés réussis.
- Limite inchangée : le catalogue de critères demeure partiel tant que les formulations validées manquantes ne sont pas récupérées et importées. La migration Supabase n'a pas été exécutée depuis cet environnement.


## Préparation du développement global — 12 novembre 2026
- Cahier des charges global validé par le propriétaire du projet.
- Règles collectives corrigées selon la dernière validation : adultes lundi, mardi, jeudi et vendredi ; enfants mercredi 9 h 30–18 h et samedi 9 h 30–14 h 30.
- Vendredi réintégré conformément à la règle confirmée des jours de cours collectifs adultes.
- Synchronisation ADOC abandonnée ; migration corrective ADOC retirée du paquet de préproduction.
- Horaires exacts des créneaux adultes laissés à paramétrer : aucune plage n'est inventée.
- Suite des travaux : revue et refonte du modèle multi-coachs, réservations avec choix explicite du coach, droits RLS et tests d'isolation.


## 12 novembre 2026 — initialisation Supabase de préproduction

- Ajout de `supabase/001_initial_schema.sql` pour initialiser un projet Supabase neuf : profils, trigger Auth, relations coach/joueur, séances, évaluations, fonctions et RLS de base.
- Ajout de `supabase/ORDRE_INSTALLATION.md` avec l'ordre 001 → 002 → 003 → 004 → 005 et les consignes de création du premier compte coach de test.
- Ajout de `supabase/005_preproduction_smoke_test.sql` pour vérifier la présence des objets et l'état RLS après installation.
- Mise à jour du README.
- Vérifications locales : 31 tests JavaScript réussis et syntaxe des fichiers JS vérifiée.
- Aucun SQL exécuté sur Supabase ; aucune validation PostgreSQL distante, aucun déploiement.
