# Installation Coach In — projet Supabase neuf

## Préparation
- Confirmer dans le tableau de bord que le projet cible est bien `whyylgiscrpqoahdzdkv` (préproduction), et non le projet de production.
- Dans Supabase, vérifier que le projet est opérationnel et que `Table Editor` ne contient pas déjà les tables Coach In.
- Ne jamais coller une clé `service_role`, `secret` ou le mot de passe de base de données dans l'application ou dans une conversation.

## Ordre strict des scripts
Dans **SQL Editor**, créer une nouvelle requête et exécuter un seul fichier à la fois, dans cet ordre :

1. `001_initial_schema.sql` — tables de base, profils Auth, relation coach/joueur, séances, évaluations, RLS de base.
2. `002_coach_in_modules.sql` — modules complémentaires.
3. `003_group_course_series.sql` — séries collectives (adultes lundi, mardi, jeudi, vendredi ; enfants mercredi et samedi).
4. `004_shared_player_profiles.sql` — invitations et dossier partagé entre coachs.

Arrêter immédiatement au premier message d'erreur. Ne pas exécuter le script suivant tant que l'erreur n'a pas été comprise et corrigée.

## Premier compte de test
1. Créer le compte utilisateur via l'écran d'inscription de Coach In ou Supabase Auth.
2. Dans Authentication > Users, copier l'UUID du compte de test.
3. Après vérification de l'UUID, exécuter cette requête en remplaçant la valeur :

```sql
update public.profiles
set role = 'coach'
where id = 'UUID_DU_COMPTE_COACH';
```

Cette opération est réservée à la préparation du test. Ne pas promouvoir un compte joueur en coach sans vérifier son identité.

## Vérifications minimales après installation
- Table Editor : `profiles`, `coach_players`, `training_sessions`, `evaluations`, `group_sessions`, `group_course_series`, `coach_player_invitations` existent.
- Créer deux comptes coach de test et un compte joueur de test.
- Lier initialement le joueur au coach A par une fonction ou une opération d'administration contrôlée (ne pas ouvrir l'insertion directe de `coach_players` aux utilisateurs).
- Depuis le coach A, inviter le coach B ; depuis le compte B, accepter.
- Vérifier que A et B voient le même joueur et le même historique ; un coach C non invité ne doit rien voir.
- Vérifier que les plannings, indisponibilités et bibliothèques privées de A et B restent indépendants.
- Vérifier la révocation du partage et l'impossibilité pour B de relire le dossier après révocation.

## Limite importante
Les scripts sont préparés pour ce projet et relus statiquement, mais n'ont pas encore été exécutés contre le serveur PostgreSQL Supabase. La recette RLS et les tests de bout en bout restent obligatoires avant d'utiliser la base pour de vraies données.


## Migration corrective — suivis séparés par coach

Après les migrations initiales 001 à 005, exécuter `006_separate_coach_followups.sql` sur l'environnement cible après sauvegarde. Cette migration remplace les politiques RLS du partage pédagogique global par des politiques limitées au coach auteur. Les vues joueur continuent d'exposer uniquement les informations publiables. Vérifier ensuite les accès avec deux comptes coach associés au même joueur et un compte joueur.


Migration complémentaire 007 : exécuter `007_notification_rpc_permissions.sql` après 006 afin de retirer l'exécution anonyme de la fonction de notification d'un nouveau bilan.


Migration complémentaire 008 : exécuter `008_private_session_notes_and_invoker_views.sql` après 006 et 007. Elle déplace les notes privées dans une table séparée réservée au coach auteur et rend les vues joueur compatibles avec les RLS du compte appelant.


Migration 009 : `009_booking_reminders_24h.sql` ajoute le traitement planifié des rappels internes 24 h avant les réservations acceptées. Elle installe un job `pg_cron` toutes les 15 minutes et respecte les préférences `reminders_24h` du joueur et du coach. Les horaires sont interprétés en Europe/Paris. Vérifier le job dans `cron.job` après installation.


Migration 010 : `010_primary_admin_account.sql` configure l'attribution du rôle administrateur principal à `axel.bohrer21@gmail.com` lors de la création de son compte Auth. Le rôle n'est pas attribué à un compte inexistant : l'administrateur doit d'abord créer son compte avec cette adresse et confirmer son e-mail. La migration ajoute aussi l'accès en lecture à la liste des coachs pour l'administrateur.

Migration 011 : `011_admin_helper_permissions.sql` retire explicitement l'exécution anonyme de `is_admin()` et conserve l'exécution pour les utilisateurs authentifiés, nécessaire à la politique RLS de l'espace administrateur.

Migration 012 : `012_coach_weekly_availability.sql` crée les disponibilités hebdomadaires propres à chaque coach. Les coachs gèrent leurs plages ; leurs joueurs associés ne lisent que les plages actives. La RPC de demande de réservation refuse les créneaux qui ne couvrent pas la durée complète demandée.

Migration 013 : `013_coach_player_messaging.sql` crée les conversations privées coach-joueur et le bucket privé `coach-in-attachments`. Les fichiers sont limités à 50 Mo et aux formats image, vidéo, PDF et documents bureautiques. Les règles RLS limitent chaque conversation au coach et au joueur qui y sont associés.
