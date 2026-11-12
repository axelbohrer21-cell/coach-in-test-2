# Coach In — préparation du développement global

Date : 12 novembre 2026
Statut : cahier des charges validé ; préparation technique en cours ; aucune mise en production effectuée.

## Base retenue

Base de travail issue de `Coach_In_Evaluations_finalisees.zip` (version du 11 novembre 2026), qui contient l'application modulaire, les modules planning collectif, réservations, évaluations détaillées et progression. La version de production et la base Supabase ne sont pas modifiées par cette copie de travail.

## Contrôle initial

- 31 tests automatisés exécutés localement : 31 réussis, 0 échec.
- Le projet est en statut préproduction : migrations SQL non exécutées et tests RLS réels non réalisés.
- Ajout d'un script d'initialisation `supabase/001_initial_schema.sql` pour un projet Supabase neuf, car le paquet précédent ne contenait pas la création des tables de base.
- Ajout du guide `supabase/ORDRE_INSTALLATION.md` et d'un contrôle non destructif `supabase/005_preproduction_smoke_test.sql`.
- L'ordre d'installation documenté est désormais 001 → 002 → 003 → 004 → 005.
- Les rappels automatiques 24 h ne sont pas encore actifs : une fonction planifiée et son infrastructure restent à construire.
- Les horaires exacts des créneaux adultes ne sont pas codés, car ils doivent être confirmés bloc par bloc.

## Corrections de règles déjà apportées dans la copie de travail

- Adultes : lundi, mardi, jeudi et vendredi. Les quatre jours sont intégrés au moteur de calendrier, au compteur annuel, à l’affichage et au formulaire de création des créneaux.
- Enfants : mercredi 9 h 30–18 h et samedi 9 h 30–14 h 30.
- Saison : 14 septembre 2026 au 20 juin 2027 ; vacances Zone B exclues ; objectifs annuels 28 adultes / 30 enfants.
- Le planning reste autonome ; la synchronisation ADOC est abandonnée. La migration historique `004_adoc_schedule_alignment.sql` est exclue de ce paquet.
- Les horaires adultes ne sont pas inventés et restent à renseigner.

## Risques techniques prioritaires avant toute mise en production

### 1. Multi-coachs et confidentialité

Le modèle actuel utilise `coach_players`, mais plusieurs flux ne sont pas encore adaptés à un joueur suivi par plusieurs coachs :

- La fonction SQL `request_private_booking` choisit automatiquement le premier coach associé au joueur (`order by created_at limit 1`) au lieu de recevoir le coach explicitement choisi par le joueur.
- Les évaluations et séances individuelles sont principalement reliées au joueur ; elles doivent également identifier leur coach propriétaire pour isoler les suivis pédagogiques entre coachs.
- Les défis et réussites possèdent `coach_id`, mais certaines contraintes d'unicité actuelles sont globales au joueur et peuvent empêcher deux coachs d'avoir des suivis distincts.
- Les vues et politiques RLS existantes doivent être réexaminées avec deux coachs et un même joueur partagé.

**Décision d'architecture à appliquer :** rattacher chaque réservation, séance, évaluation, défi, réussite, notification et ressource privée à son coach propriétaire ; exiger le choix explicite du coach dans la réservation ; tester que chaque coach ne voit que ses propres données, même si le joueur est partagé.

### 2. Administrateur principal

Le rôle d'administrateur principal doit être distinct du rôle coach. Seul ce compte peut créer, suspendre et supprimer les comptes coach. Les autres coachs ne doivent pas pouvoir attribuer des rôles ni consulter les espaces des autres. Les opérations sensibles doivent être faites côté serveur, jamais uniquement dans l'interface.

### 3. Planning autonome

Il reste à développer les plages de disponibilité du coach, les conflits de terrain, les récurrences, les couleurs automatiques par joueur, les jours grisés, les annulations de cours collectifs qui libèrent le créneau et les rappels planifiés 24 h.

### 4. Catalogue et bibliothèque

Le catalogue de critères doit être importé intégralement depuis les formulations validées, sans fusion de doublons ni reformulation. La bibliothèque de cours particuliers doit être produite par thème et niveau ; les contenus illustrés doivent correspondre aux exercices décrits.

### 5. Données et sécurité

Avant toute migration : sauvegarde de la base, environnement de préproduction, revue SQL, vérification des politiques RLS et tests croisés coach A / coach B / joueur partagé / joueur non associé. Tester également la restauration des sauvegardes et les règles de conservation des fichiers.

## Décisions fonctionnelles ajoutées le 12 novembre 2026

- Adultes : vendredi confirmé et réintégré.
- Multi-coachs : suivi entièrement partagé après acceptation d’une invitation ; toutes les séances, évaluations, réussites et défis sont communs, avec conservation de l’identité du coach auteur. Les plannings et ressources privées des coachs restent séparés.
- La spécification complète est dans `docs/architecture_multi_coach.md`.

## Ordre de développement

1. Modèle de données multi-coachs et rôle administrateur principal.
2. Politiques RLS et tests d'isolation.
3. Planning autonome et réservations multi-coachs.
4. Fiches joueurs, archivage, suppression et statistiques.
5. Évaluations, catalogue et moteur de progression.
6. Bibliothèque collective et particulière illustrée.
7. Messagerie et notifications, dont rappels 24 h.
8. Espace joueur, PDF, paramètres, sauvegardes et recette complète.

## Limites de cette préparation

Aucun changement n'a été envoyé à GitHub, Vercel ou Supabase. Aucune migration n'a été exécutée. Cette copie est une base de développement locale et doit encore être développée, revue et testée avant publication.

## Avancement technique du 12 novembre 2026 — partage multi-coachs

- Ajout d'une migration de préproduction `supabase/004_shared_player_profiles.sql` : invitations, acceptation/refus, révocation, règles RLS du dossier partagé, vues joueur limitées et réservation avec `coach_id` explicite.
- Première interface : bouton « Partager » sur une fiche joueur, envoi d'invitation par e-mail, affichage des invitations reçues et boutons accepter/refuser.
- Réservation joueur : sélection explicite du coach parmi les coachs associés.
- Chargement coach : séances, évaluations, défis et réussites récupérés pour tous les joueurs liés, et non filtrés par le coach auteur.
- Contrôles locaux : 31 tests automatisés réussis ; vérifications de syntaxe JavaScript réussies.
- Non réalisé : exécution SQL, tests RLS réels, tests de bout en bout avec deux comptes coach, interface de révocation, affichage du nom de l'auteur sur chaque carte, déploiement.
- Attention : la migration suppose les tables et colonnes issues des scripts d'initialisation présents dans le dossier du projet. Elle doit être confrontée au schéma réel avant toute exécution. Ne pas la lancer sur la base de production.
