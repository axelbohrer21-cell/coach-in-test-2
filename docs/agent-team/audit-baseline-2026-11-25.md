# Audit Coach In — état de référence au 25 novembre 2026

## Périmètre de l'audit

Inspection en lecture seule du dépôt GitHub, des branches et PR, des workflows CI, des projets Vercel, des projets Supabase, des tables publiques, des politiques RLS et de la fonction de suggestion de créneaux présente en préproduction.

Aucune modification du code applicatif, aucune écriture SQL, aucune migration et aucun déploiement n'ont été effectués pendant l'audit. Les seuls changements de ce lot sont des documents de gouvernance sur une branche dédiée.

## 1. Dépôt et architecture

- Dépôt : `axelbohrer21-cell/coach-in-test-2`.
- Branche de référence observée : `main`.
- Application statique modulaire en JavaScript natif (modules ES), HTML et CSS.
- Dossiers : `src/core`, `src/domain`, `src/services`, `src/views`, `src/data`.
- Backend : Supabase ; hébergement : Vercel.
- `package.json` expose le script `npm test` basé sur Node Test Runner.
- Les workflows GitHub contrôlent la syntaxe JavaScript et les tests de domaine.
- Le dépôt contient déjà des règles métier, tests unitaires, migrations SQL, Edge Functions et documents d'architecture.

### Observation

L'application est modulaire, mais `src/app.js` reste un fichier très volumineux (plus de 200 Ko dans l'arbre Git observé). Les agents doivent privilégier les services, domaines et vues dédiés et éviter d'augmenter inutilement le couplage dans ce fichier central.

Aucun runtime d'orchestration d'agents développeurs n'est installé dans le dépôt. Le code actuel ne doit pas être interprété comme une équipe autonome de développement.

## 2. Environnements confirmés

### GitHub
- Dépôt accessible en lecture et écriture.
- Branche `main` utilisée comme référence.
- Les workflows `automated-tests.yml` et `coach-in-qa.yml` existent.

### Vercel
Le projet correspondant au lien Coach In utilisé dans les échanges est `coach-in-test-2`, avec le domaine `coach-in-test-2.vercel.app`.

Pour ce projet :
- environnement Preview / Development : variable `VITE_SUPABASE_URL` pointant vers `https://whyylgiscrpqoahdzdkv.supabase.co` ;
- environnement Production : variable `VITE_SUPABASE_URL` pointant vers `https://hniguulywwoakfqfxgrh.supabase.co`.

Un autre projet Vercel nommé `coach-in` possède également un déploiement de production et le domaine `coach-in.vercel.app`. D'autres projets de test existent. Le déploiement automatique doit donc toujours vérifier le projet et le domaine exacts avant d'agir.

### Supabase
- Préproduction confirmée : projet `Coach In test`, ref `whyylgiscrpqoahdzdkv`.
- Production confirmée par la variable Vercel Production : ref `hniguulywwoakfqfxgrh`.
- Les deux projets sont actifs et sains au moment de l'inspection.

## 3. Écart de schéma Supabase

| Indicateur | Préproduction | Production |
|---|---:|---:|
| Tables publiques | 33 | 39 |
| Politiques RLS | 72 | 71 |
| Tables avec politiques | 32 | 35 |
| Politiques accordées au rôle anon | 0 | 0 |

Toutes les tables publiques observées ont RLS activé.

Tables présentes en production mais absentes de la préproduction :
- `coach_session_favorites`
- `coach_physical_programs`
- `player_coach_directory`
- `coach_referral_invites`
- `coach_referrals`
- `coach_referral_links`

Tables RLS activé mais sans politique observée :
- Préproduction : `push_delivery_log`.
- Production : `coach_referral_invites`, `coach_referral_links`, `coach_referrals`, `push_delivery_log`.

L'absence de politique avec RLS activé entraîne normalement un refus d'accès via les rôles soumis à RLS ; ce n'est pas en soi une preuve d'exposition. Les usages attendus de ces tables doivent toutefois être documentés et vérifiés.

### Conclusion sur les bases

Les bases ne sont pas des copies synchronisées. Ne pas synchroniser par copie de tables et ne pas rejouer les migrations initiales. Il faut d'abord produire un différentiel de schéma, de privilèges, de fonctions, de vues, de triggers, de publications Realtime et d'historique des migrations.

## 4. Traçabilité des migrations — point bloquant

L'historique de migration observé en préproduction va jusqu'à la version `20261125165735`. L'historique de production observé va jusqu'à `20261124173902`.

Des tables de parrainage sont présentes en production alors que les fichiers du dépôt qui les créent ou les complètent portent des versions ultérieures, notamment `20261124180000` et `20261124180100`, absentes de l'historique de migration consulté. Cela suggère que certaines modifications ont été appliquées hors de la chaîne de migration suivie, ou que l'historique ne reflète pas exactement l'état réel.

Un problème d'ordre a également été repéré : `20261124173902_coach_referral_stable_links_and_auto_rotation.sql` crée une clé étrangère vers `public.coach_referral_invites`, alors que `20261124180000_coach_accounts_require_active_coach_referral.sql` crée cette table dans un fichier horodaté ultérieur. Une installation propre dans l'ordre chronologique du dépôt risque donc d'échouer.

Action requise : reconstruire la chronologie réelle des changements, identifier les opérations manuelles, corriger les dépendances et définir un état de référence reproductible avant d'autoriser les agents Backend à exécuter des migrations.

## 5. Fonction de suggestion de créneaux / PR #30

Une PR ouverte en brouillon existe :
- PR #30 : `WIP: Agent Planning Coach In — préproduction`.
- Branche : `feat/ai-planning-agent-preprod-2026-11-25`.
- Elle est en avance de 21 commits sur `main`.
- Elle ajoute une recherche structurée de créneaux en lecture seule dans l'application.
- Elle ne fournit pas encore la compréhension du langage naturel via OpenAI.
- Le dernier workflow vérifié sur cette branche a réussi : 109 tests, 0 échec ; la campagne QA Node 20 et Node 22 est passée.
- Une Preview Vercel est prête.

La fonction `public.get_private_booking_suggestions` existe dans la base de préproduction observée. Elle est `STABLE`, `SECURITY INVOKER`, avec `search_path` vide ; le privilège EXECUTE observé est accordé à `authenticated`, pas à `anon`.

Cependant, les fichiers de migration de la PR qui redéfinissent cette même fonction portent les versions `20261125170000`, `20261125171000`, `20261125172000` et `20261125173000`, qui n'apparaissent pas dans l'historique de migration préproduction consulté. La fonction semble donc présente sans traçabilité complète dans cet historique. Il faut réconcilier cela avant fusion.

Cette PR est une fonctionnalité destinée aux utilisateurs de Coach In ; elle n'est pas le système d'agents qui développera le logiciel.

## 6. État des tests

- Le workflow automatisé de la branche Agent Planning a exécuté 109 tests : 109 réussis, 0 échec.
- La campagne QA a réussi sur Node 20 et Node 22.
- La syntaxe JavaScript est vérifiée par CI.
- Les workflows actuels ne constituent pas une recette E2E complète de tous les parcours navigateur et de tous les rôles.

La recette réelle avec Coach A, Coach B, joueur lié aux deux coachs et joueur non lié doit rester une étape obligatoire pour les changements touchant les accès, les réservations, les plannings et les suivis pédagogiques.

## 7. Risques et priorités

### Priorité 0 — avant toute automatisation avec écriture
1. Réconcilier les schémas et migrations production / préproduction.
2. Corriger l'ordre des migrations de parrainage et tracer les changements manuels.
3. Identifier précisément les projets Vercel autorisés pour Preview et Production.
4. Définir une politique de sauvegarde et de retour arrière avant migration.

### Priorité 1 — socle de l'équipe IA
1. Installer le référentiel commun `AGENTS.md`.
2. Formaliser les rôles et les handoffs des agents.
3. Ajouter des critères de livraison et de rapport standard.
4. Préparer un orchestrateur côté serveur, séparé du frontend Coach In.
5. Donner aux agents des droits minimaux : lecture par défaut, branches dédiées, Preview uniquement.

### Priorité 2 — qualité de livraison
1. Ajouter des tests d'intégration et E2E authentifiés.
2. Ajouter des contrôles de non-régression multi-coachs.
3. Exiger une Preview correspondant exactement au commit testé.
4. Documenter l'état « code présent / migration appliquée / Preview déployée / recette utilisateur validée ».

## 8. Décision d'architecture recommandée

Les agents de production doivent être séparés de l'application tennis elle-même. Ils ne doivent pas être accessibles depuis les comptes joueur ou coach. L'orchestrateur sera un service privé côté serveur qui utilise GitHub, CI, Supabase et Vercel avec des autorisations limitées.

Le premier lot opérationnel recommandé est : Chef de projet, Architecte, Développeur polyvalent, QA et Documentation. Les agents Frontend, Backend, Sécurité et Release seront ensuite spécialisés.

## 9. Historique de cet audit

Audit réalisé en lecture seule le 25 novembre 2026. Aucun code applicatif, aucune donnée métier, aucune migration de base et aucun déploiement de production n'ont été modifiés.

Documents de gouvernance ajoutés sur la branche dédiée :
- `AGENTS.md`
- `docs/agent-team/README.md`
- `docs/agent-team/audit-baseline-2026-11-25.md`
