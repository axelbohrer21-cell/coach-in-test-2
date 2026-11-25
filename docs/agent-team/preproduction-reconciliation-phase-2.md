# Coach In — reconciliation préproduction, phase 2

Date : 25 novembre 2026

## Environnement et périmètre

- Dépôt : `axelbohrer21-cell/coach-in-test-2`
- Branche : `feat/ai-planning-agent-preprod-2026-11-25`
- Supabase préproduction : `whyylgiscrpqoahdzdkv`
- Supabase production : `hniguulywwoakfqfxgrh` — **aucune écriture effectuée**
- Toutes les migrations de cette phase ont été appliquées uniquement à la préproduction.

## Migrations appliquées

| Version | Migration |
|---|---|
| 20261125171756 | preprod_restore_missing_app_schema |
| 20261125171806 | preprod_fix_player_color_palette |
| 20261125171927 | preprod_move_privileged_rpcs_to_private |
| 20261125171946 | preprod_align_constraints_and_default_grants |
| 20261125172005 | preprod_fix_restored_table_grants |
| 20261125172047 | preprod_tighten_participant_rls |

Les six fichiers SQL correspondants sont versionnés dans `supabase/migrations/` sur la branche de préproduction.

## Structures restaurées

Tables créées avec RLS activé :
- `coach_physical_programs`
- `coach_session_favorites`
- `coach_referral_invites`
- `coach_referral_links`
- `coach_referrals`
- `player_coach_directory`

Colonnes ajoutées :
- `profiles.player_color`
- `evaluations.coach_private_notes`
- `player_notifications.source_id`

Index, contraintes, politiques et triggers associés ont été ajoutés. L'annuaire ne contient que l'identifiant et le nom des coachs actifs. Les tables de parrainage ne sont pas directement accessibles via les rôles client ; elles sont utilisées par des fonctions contrôlées.

## Conservation des données de préproduction

Comptages observés après migration :
- profils : 4
- relations coach-joueur : 2
- évaluations : 2
- notifications : 4
- entrées de l'annuaire : 2
- liens de parrainage : 2
- favoris : 0
- programmes physiques : 0

Les deux profils joueurs existants ont reçu une couleur unique. Aucun profil, lien coach-joueur, historique d'évaluation ou notification existant n'a été supprimé. Aucun enregistrement de production n'a été copié.

## Sécurité et fonctions RPC

Les douze RPC privilégiées utilisées par l'application ont été déplacées dans le schéma `private`. Les points d'entrée publics historiques sont conservés comme wrappers `SECURITY INVOKER`, pour ne pas casser les appels du frontend.

Vérifications :
- 12 wrappers publics contrôlés : `SECURITY INVOKER`.
- Exécution des wrappers : autorisée à `authenticated`.
- Les fonctions internes privées ont des droits explicites.
- Les privilèges `REFERENCES`, `TRIGGER` et `TRUNCATE` ont été retirés de `authenticated` sur les tables publiques.
- Les privilèges par défaut du rôle `postgres` ne donnent plus automatiquement les droits tables/séquences à `authenticated` ou `anon`.
- Les grants sur les trois tables restaurées ont été explicitement restreints.
- La politique `coach_players_select_participant`, trop large, a été supprimée.
- La mise à jour directe des réservations par un coach a été retirée ; les décisions passent par les RPC existantes.
- La politique de lecture des profils autorise aussi l'identité d'un joueur ayant une demande de réservation en attente.

Les fonctions `create_coach_referral_invite` et `resolve_coach_referral_link` restent `SECURITY DEFINER` comme en production : la première est réservée aux coachs authentifiés ; la seconde est publique pour résoudre les liens d'invitation. Elles sont les seules fonctions publiques `SECURITY DEFINER` encore exécutables par des rôles client dans la préproduction.

## Contraintes harmonisées

- Cours collectifs adultes : jours de semaine 1 à 5.
- Cours collectifs enfants : mercredi et samedi.
- Terrains : 1 à 4.
- Durée de séance : de 1 à 360 minutes.

Les règles de disponibilités et d'occupations visibles par les joueurs restent volontairement plus restrictives en préproduction : le joueur ne voit que les coachs auxquels il est lié. Elles n'ont pas été élargies au modèle de lecture plus global présent dans la production.

## Points de vigilance non modifiés

- `profiles.email`, `evaluations.created_by` et `training_sessions.created_by` restent plus stricts en préproduction que dans la production. Ils ne sont pas rendus nullable sans validation de l'impact sur les données et les formulaires.
- Les droits UPDATE de `profiles` et `coach_video_analyses` restent présents pour préserver les mises à jour directes actuellement utilisées par le frontend. Leur migration vers des RPC ciblées sera une tâche dédiée.
- Le contrôle Auth « leaked password protection » reste désactivé ; ce réglage nécessite une décision et une activation dans la configuration Auth.
- Les tables de parrainage et `push_delivery_log` ont RLS activé sans policy directe. Les tables de parrainage sont volontairement réservées aux fonctions privilégiées ; `push_delivery_log` reste à auditer séparément.

## Résultat des Advisors

Les alertes de fonctions privilégiées ont été ramenées aux deux fonctions de parrainage volontairement exposées :
- `create_coach_referral_invite()` : authentifié uniquement.
- `resolve_coach_referral_link(uuid)` : anon et authenticated, pour le flux d'invitation.

Les alertes RLS sans policy concernent les trois tables de parrainage, volontairement inaccessibles en direct, et `push_delivery_log`. La protection contre les mots de passe compromis reste désactivée.

## Recette utilisateur encore requise

Les migrations SQL sont appliquées et vérifiées, mais la recette visuelle connectée n'est pas encore considérée comme terminée :
1. connexion Coach A et Coach B ;
2. chargement des fiches, favoris, bibliothèque physique et annuaire ;
3. connexion joueur et vérification de la visibilité des deux coachs liés ;
4. demande, acceptation, refus et annulation d'un cours particulier ;
5. vérification des notifications et de l'inscription push ;
6. test des liens de parrainage ;
7. contrôle des cours collectifs Coach B et de l'Agent Planning.

Aucune fusion vers `main` ni aucun déploiement en production n'est autorisé par cette phase.
