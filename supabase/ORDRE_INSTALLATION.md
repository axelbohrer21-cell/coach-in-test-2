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
