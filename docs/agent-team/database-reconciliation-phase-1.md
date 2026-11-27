# Réconciliation Supabase — phase 1 (lecture seule)

Date : 25 novembre 2026

## Décision de sécurité

**Aucune migration n'a été appliquée à l'un ou l'autre projet pendant cette phase.** Aucune table, ligne, fonction, politique, variable d'environnement ou déploiement n'a été modifié.

La comparaison confirme que les deux bases ne sont pas interchangeables. Il est interdit de copier une base sur l'autre, de rejouer les migrations initiales, ou d'appliquer en bloc l'historique d'un environnement sur l'autre.

## 1. Environnements confirmés

Le projet Vercel `coach-in-test-2` pointe :
- Production : `https://hniguulywwoakfqfxgrh.supabase.co` (projet Supabase `hniguulywwoakfqfxgrh`).
- Preview / Development : `https://whyylgiscrpqoahdzdkv.supabase.co` (projet Supabase `whyylgiscrpqoahdzdkv`).

Le dernier déploiement Production READY observé est sur `main`, commit `aaec32b10ac5aedf4754e5e69d95cc7d2ec94cd5`.

Le dernier Preview READY observé est sur `feat/ai-planning-agent-preprod-2026-11-25`, commit `7c7976be238685b8372750c93e33def3b9d8e13f`.

## 2. Inventaire

| Élément | Préproduction | Production |
|---|---:|---:|
| Migrations dans l'historique | 80 | 96 |
| Tables `public` | 33 | 39 |
| Politiques RLS `public` | 72 | 71 |
| Fonctions du schéma `public` | 36 | 39 |
| Vues `public` | 5 | 5 |
| Triggers non internes `public` | 19 | 23 |
| Tables de `supabase_realtime` | 22 | 22 |

Les deux projets ont les mêmes schémas applicatifs principaux, dont `private`, `public`, `storage`, `auth`, `vault`, `cron` et `extensions`. La présence des mêmes noms de schémas ne signifie pas que leurs objets sont identiques.

## 3. Écart fonctionnel concret dans la préproduction

Le code actuellement déployé depuis `main` dans `src/services/data.js` interroge directement les objets suivants :
- `public.coach_session_favorites`
- `public.coach_physical_programs`
- `public.player_coach_directory`
- `public.profiles.player_color`

Les quatre objets sont présents en production mais absents de la préproduction au moment de la vérification. Les appels correspondants du frontend recevront des erreurs de relation ou de colonne inexistante. Cela rend la préproduction non représentative de la production et peut casser des parcours de chargement, de bibliothèque physique, de favoris, de répertoire coach et de fiche joueur.

La migration de répertoire existe dans le dépôt (`20261124164606_replace_coach_directory_view_with_safe_table.sql`). La migration de favoris existe également sous un nom/version de fichier différent (`20261122094000_coach_session_favorites.sql`). La migration créant `coach_physical_programs` et celle ajoutant `profiles.player_color` n'ont pas été retrouvées dans les fichiers suivis sur `main), alors que les objets existent en production.

**Action :** retrouver ou reconstituer les migrations manquantes depuis une source fiable avant de les appliquer en préproduction. Ne pas créer ces objets avec une définition devinée.

### Détail des objets manquants relevés en préproduction

L'introspection de production donne les caractéristiques suivantes :

- `coach_session_favorites` : favoris de séances par coach, unicité `(coach_id, session_id)`, clés étrangères vers `profiles` et `training_sessions`, politiques qui limitent lecture/ajout/suppression au coach propriétaire et à ses propres séances. Un fichier de migration existe dans `supabase/migrations/20261122094000_coach_session_favorites.sql`, mais cette migration n'apparaît pas dans l'historique préproduction.
- `player_coach_directory` : table minimale `id, first_name, last_name`, RLS activé, lecture limitée aux joueurs, synchronisation par trigger depuis `profiles`. Le fichier `supabase/migrations/20261124164606_replace_coach_directory_view_with_safe_table.sql` existe, mais n'est pas enregistré dans l'historique préproduction.
- `coach_physical_programs` : table de programmes privés par coach, avec colonnes `id`, `coach_id`, `title`, `program_type`, `focus_criteria`, `group_size`, `age_group`, `level`, `equipment`, `duration_minutes`, `content`, `created_at`, `updated_at`. Les contraintes observées limitent `program_type` à `template/generated/cycle`, `group_size` à 4–10 et `duration_minutes` à 60. RLS est activé avec une politique propriétaire coach. Aucune migration de création correspondante n'a été retrouvée dans l'arbre Git actuel.
- `profiles.player_color` : colonne texte nullable, index unique partiel pour les profils de rôle `player` avec couleur renseignée, et trigger qui attribue une couleur libre dans une palette de 50 couleurs. La fonction de trigger est actuellement non SECURITY DEFINER. Aucune migration `add_unique_player_color_palette` correspondante n'a été retrouvée dans l'arbre Git actuel.

Ces deux derniers objets exigent une récupération de la migration historique ou une reconstruction SQL revue à partir des définitions cataloguées et du code applicatif.

## 4. Différences de colonnes dans des tables communes

### `evaluations`
- Préproduction : `created_by` est NOT NULL.
- Production : `created_by` est nullable.
- Production possède `coach_private_notes`, absent de la préproduction.

### `player_notifications`
- Production possède `source_id uuid`, absent de la préproduction.

### `profiles`
- Préproduction : `email` est NOT NULL avec valeur par défaut vide.
- Production : `email` est nullable sans valeur par défaut.
- Production possède `player_color text`, absente de la préproduction.

### `training_sessions`
- Préproduction : `created_by` est NOT NULL.
- Production : `created_by` est nullable.

La vue `public.player_sessions` possède également une définition SQL différente dans les deux projets. Les différences de nullabilité et de définition doivent être expliquées par les migrations et les usages réels avant toute modification.

## 5. Sécurité : préproduction moins durcie sur plusieurs points

### Privilèges des tables

Les grants observés pour `authenticated` en préproduction incluent DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE et UPDATE sur de nombreuses tables publiques.

En production, les privilèges REFERENCES, TRIGGER et TRUNCATE ne sont plus accordés à `authenticated` dans les grants observés ; les opérations applicatives courantes restent accordées selon les tables.

### Privilèges par défaut

Pour les objets créés par le rôle `postgres`, les privilèges par défaut de préproduction incluent `anon` et `authenticated` sur les tables, fonctions et séquences. La configuration correspondante de production retire les droits par défaut de `anon` et `authenticated` sur ces objets et conserve notamment `service_role`.

Une entrée de privilèges par défaut distincte pour `supabase_admin` existe dans les deux projets et doit être étudiée séparément. Ne pas conclure que tous les chemins de création d'objets sont identiques.

### Fonctions

Plusieurs RPC métier publiques sont `SECURITY DEFINER` en préproduction, alors que leurs versions de production sont `SECURITY INVOKER` ou ont été déplacées dans le schéma `private`. Les exemples observés incluent les opérations de réservation, d'invitation et de lecture de disponibilités.

La production dispose notamment de fonctions privées pour les opérations privilégiées. La préproduction a encore certaines fonctions correspondantes dans `public`.

L'Advisor de sécurité relève :
- Préproduction : 13 fonctions `SECURITY DEFINER` accessibles aux utilisateurs authentifiés dans le schéma public, ainsi que l'alerte de protection contre les mots de passe compromis désactivée.
- Production : une fonction `SECURITY DEFINER` accessible à `anon` et deux accessibles à `authenticated` dans `public`, ainsi que la même alerte Auth.
- Tables avec RLS activé mais sans politique : une en préproduction (`push_delivery_log`) et quatre en production (les trois tables de parrainage et `push_delivery_log`). Avec RLS activé et sans politique, les accès via les rôles soumis à RLS sont refusés ; l'usage voulu de ces tables reste à documenter.

Les fonctions de parrainage accessibles publiquement doivent être examinées individuellement : leur présence dans un rapport Advisor ne suffit pas à prouver une exploitation, mais ne doit pas être ignorée.

### Politiques RLS

Les deux bases possèdent un nombre proche de politiques, mais leurs définitions diffèrent. Des écarts sont observés sur `profiles`, `coach_weekly_availability`, `booking_requests`, `shared_court_occupancy`, `push_subscriptions`, et d'autres tables. Il faut comparer les expressions `USING` et `WITH CHECK`, pas seulement les noms ou le nombre de politiques.

## 6. Historique de migrations et dépôt Git

Le dépôt `main` contient 93 fichiers SQL sous `supabase/` : 66 dans `supabase/migrations/` et 27 directement dans `supabase/`. Les migrations historiques sont donc réparties entre deux emplacements. Les historiques distants contiennent 96 entrées en production et 80 en préproduction. Les noms et versions des fichiers et des entrées d'historique ne correspondent pas systématiquement un à un.

Correction importante : les migrations de durcissement de sécurité suivantes **sont bien présentes dans le dépôt**, mais directement sous `supabase/` et non dans `supabase/migrations/` :
- `20261123152535_security_hardening_client_table_privileges.sql`
- `20261123152602_security_hardening_future_postgres_defaults.sql`
- `20261123152708_security_video_analysis_processing_fields.sql`
- `20261123153000_move_privileged_rpcs_to_private_schema.sql`

D'autres migrations de production ont des noms différents de leurs fichiers ou ne disposent pas d'un fichier SQL de même nom. Deux objets importants n'ont pas de migration dédiée retrouvée dans l'arbre Git actuel :
- `coach_physical_programs` / migration historique `coach_physical_training_library` ;
- `profiles.player_color` / migration historique `add_unique_player_color_palette`.

Il faut rechercher si ces changements sont inclus dans un fichier regroupé ou ont été appliqués manuellement avant de conclure à une absence de source. Les entrées d'historique dont le nom diffère peuvent également correspondre à des fichiers renommés ou regroupés. Leur SQL exact ne doit pas être reconstitué par supposition.

### Dépendance de migrations de parrainage

Un ordre de dépendance précis est confirmé par le SQL :
1. `20261124180000_coach_accounts_require_active_coach_referral.sql` crée notamment `coach_referral_invites` et `coach_referrals`.
2. `20261124180100_fix_coach_referral_profile_insert_order.sql` corrige le trigger `handle_new_user` en utilisant ces tables.
3. `20261124173902_coach_referral_stable_links_and_auto_rotation.sql` crée `coach_referral_links` avec une clé étrangère vers `coach_referral_invites`.

Le troisième fichier porte un horodatage antérieur aux deux premiers, alors qu'il dépend d'eux. L'historique de production enregistre bien les versions dans l'ordre de dépendance `20261124165602`, `20261124165650`, puis `20261124173902`. La préproduction n'a pas ces migrations. **Ne jamais appliquer ces trois fichiers en se fiant au tri lexicographique actuel des noms de fichiers.** La chaîne de migration doit être corrigée et vérifiée avant toute application. La source de vérité doit être récupérée via l'historique Git, les sauvegardes de migration ou l'introspection du schéma, puis revue explicitement.

La préproduction possède en plus les migrations propres à l'Agent Planning, dont `get_private_booking_suggestions`. Cette fonctionnalité est attendue dans la branche de préproduction et ne doit pas être supprimée au cours de l'alignement.

## 7. Extensions

Les extensions installées sont globalement proches. Une différence de version a été observée pour `supabase_vault` : 0.3.2 en préproduction et 0.3.1 en production. Aucune mise à niveau d'extension ne doit être déclenchée dans le cadre d'un alignement de schéma sans analyse spécifique.

## 8. Cible de réconciliation recommandée

La cible ne doit pas être une copie binaire de production vers préproduction. Elle doit être :

**Préproduction = socle de schéma et de sécurité de production + fonctionnalités en cours de validation explicitement conservées (notamment Agent Planning).**

Principes :
1. Ne jamais copier les lignes de production vers la préproduction.
2. Ne jamais écraser la base de production pour la faire ressembler à la préproduction.
3. Préserver les données de test existantes en préproduction.
4. Reconstituer les migrations absentes dans Git à partir de sources fiables.
5. Créer ensuite une migration additive de rattrapage, idempotente et revue, pour les objets manquants en préproduction.
6. Aligner les grants, privilèges par défaut, fonctions, vues, politiques RLS et triggers en lots indépendants.
7. Garder les RPC Agent Planning comme extension propre à la branche tant que la fonctionnalité n'est pas acceptée.
8. Tester les rôles Coach A, Coach B, joueur lié aux deux coachs et joueur non lié.
9. Vérifier les parcours réels sur la Preview et les logs, puis faire valider par Axel.

## 9. Étapes de réalisation

### Étape A — récupération des sources manquantes
- retrouver les migrations de sécurité et de fonctionnalités manquantes dans les branches, commits ou sauvegardes ;
- identifier les migrations déjà présentes sous d'autres noms ;
- associer chaque entrée d'historique à son SQL réel ;
- ne marquer aucune migration comme appliquée sans preuve.

### Étape B — plan de migration préproduction
- produire le différentiel SQL final ;
- vérifier les contraintes, nullabilités, index, triggers, vues, politiques, privilèges et extensions ;
- contrôler les données de test existantes pour les colonnes qui changent de nullabilité ;
- produire un plan de retour arrière.

### Étape C — exécution contrôlée
- sauvegarder la préproduction ;
- appliquer uniquement les migrations de rattrapage approuvées sur la préproduction ;
- vérifier les résultats SQL, les Advisors et les tests d'intégration ;
- ne pas toucher à la production.

### Étape D — gouvernance durable
- versionner chaque migration dans Git ;
- ajouter un contrôle CI de cohérence entre fichiers de migration et historique distant ;
- exiger une revue sécurité des changements de RLS, grants, fonctions et triggers ;
- empêcher tout agent d'appliquer une migration production sans autorisation explicite.

## 10. État de cette phase

**Statut : diagnostic terminé, exécution bloquée volontairement en attente de reconstitution des migrations manquantes.**

Aucune écriture n'a été réalisée sur Supabase. Aucun déploiement n'a été déclenché. Ce document décrit les écarts observés et la trajectoire sûre ; il ne constitue pas une autorisation d'appliquer les migrations.
