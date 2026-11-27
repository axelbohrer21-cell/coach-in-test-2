# Coach In Manager

Service privé d'orchestration de l'équipe d'agents développeurs de Coach In. Ce projet est séparé du frontend tennis et n'est pas accessible aux comptes coach/joueur de l'application.

## Stack

- Eve 1.5.0 — runtime d'agents durables.
- Node.js 24.
- Vercel AI Gateway pour le routage du modèle via l'identité du projet Vercel.
- Aucun accès Supabase ni GitHub n'est ajouté au runtime du Manager dans cette première étape.

## Hébergement et sécurité Vercel

- Projet Vercel dédié : `coach-in-manager`.
- Identifiant du projet : `prj_VPh7VprGSU1rRE9VmG2KWIpMWehz`.
- Dépôt GitHub lié : `axelbohrer21-cell/coach-in-test-2`.
- Dossier racine du projet : `agent-manager`.
- Branche de travail : `feat/coach-in-manager-eve-2026-11-25`.
- Protection Vercel Auth / SSO activée sur **tous les déploiements** (`deploymentType: all`).
- L'accès est réservé aux membres autorisés de l'équipe Vercel et ne réutilise pas les comptes Coach In.
- Node.js configuré en `24.x`.
- Aucun domaine personnalisé ni secret de production n'est configuré.
- Le projet Vercel principal `coach-in-test-2` n'a pas été modifié.

### État du canal navigateur

- Le canal Eve est déjà déclaré dans `agent/channels/eve.ts` avec `eveChannel`, une authentification Better Auth basée sur la session Vercel, `vercelOidc()` et `localDev()`.
- L'interface `apps/web` contient le chat authentifié, l'écran de connexion et le contrôle du compte ; la route Better Auth est présente.
- Les variables d'environnement attendues (`BETTER_AUTH_SECRET`, `VERCEL_APP_CLIENT_ID`, `VERCEL_APP_CLIENT_SECRET`) sont déclarées pour Preview et Production. Leurs valeurs secrètes ne sont jamais affichées dans le dépôt.
- La protection Vercel Auth des déploiements reste active. Elle s'ajoute à l'authentification Better Auth ; elle ne la remplace pas.
- La Preview compile et est READY, mais le parcours réel de connexion Vercel, l'ouverture d'une session et les délégations d'agents doivent encore être testés dans le navigateur avec un compte autorisé.
- Ne pas rendre l'API publique et ne pas remplacer l'authentification par `none()`.

## Contenu de la première version

- Agent principal Coach In Manager avec modèle configuré via Vercel AI Gateway.
- Instructions de gouvernance et de coordination.
- Contexte projet en lecture seule, embarqué dans le workspace.
- Outils explicitement autorisés : poser une question, lire les documents du workspace, planifier un graphe multi-tâches (`mission_plan`), déléguer une tâche (`team_task`), lancer une revue indépendante (`review_task`) et consulter/enregistrer les journaux de mission (`mission_memory`).
- Les compétences projet, planification et routage sont conservées en fichiers Markdown et consultées par lecture.
- Un référentiel partagé versionné recense les invariants métier et de sécurité Coach In ; il est transmis aux agents selon la pertinence de la mission. Ce n'est pas une mémoire automatique des conversations.
- Les journaux de mission sont stockés dans un Blob Vercel privé, isolé du projet Coach In principal et connecté uniquement à la branche Preview Manager. L'outil `mission_memory` permet de lister, relire et enregistrer des comptes rendus structurés. Les données ne doivent contenir ni secrets ni données personnelles de joueurs.
- Aucun tableau de bord de performance ni stockage de métriques par agent n'est encore implémenté. Les résultats et preuves sont rapportés mission par mission.
- Équipe déclarée : `product_owner`, `solution_architect`, `ui_designer`, `supabase_expert`, `frontend_developer`, `backend_developer`, `qa_engineer`, `qa_reviewer`, `tennis_expert`, `ux_reviewer`, `data_security_reviewer`, `release_manager`, `documentation_specialist` et `plan_auditor` (14 spécialistes, hors Manager).
- Workflow `team_task` : route une mission bornée vers un spécialiste et attend son livrable structuré. Les développeurs disposent des outils de code dans un sandbox isolé et partagent le sandbox du Manager via des worktrees distincts.
- Outil `agent_roster` : vérifie à l'exécution que tous les spécialistes attendus sont exposés par `ctx.agents` avant une délégation non triviale.
- Outils workflow `mission_plan` et `team_task` : valident les dépendances, les périmètres et les worktrees avant de déléguer les rôles de production. Outil `review_task` : appelle l'auditeur de plan puis QA et sélectionne les spécialistes tennis, UX, sécurité et Supabase selon le domaine/risque de la mission, sauf liste explicite fournie par le Manager. Attend les réponses structurées et retourne un état global (`reviewed`, `changes_requested`, `blocked` ou `partial`). Les spécialistes sont cachés de l'appel direct et passent par cet orchestrateur.
- Playbook `agent/skills/agent-routing.md` : matrice de délégation, limites de parallélisme, règles d'économie de quotas et de transmission du contexte.
- Référentiel `agent/knowledge/coach-in-shared-context.md` : invariants Coach In versionnés, transmis de manière sélective. Les agents de revue restent limités aux preuves explicitement fournies.
- Les agents de conseil/revue sont limités au contexte transmis et n'ont pas d'accès direct au dépôt, à Supabase ni à une Preview.
- Les développeurs peuvent modifier des fichiers dans un worktree local au sandbox isolé, lire le dépôt public et lancer des tests locaux. Le QA Engineer est configuré pour exécuter les tests sans modifier les sources ; le Manager vérifie systématiquement le git status après ses contrôles. Aucun ne peut commit, push, ouvrir de PR, accéder à Supabase, ni déployer.
- Le sandbox autorise uniquement les domaines publics GitHub et les registres de paquets nécessaires ; aucun secret applicatif ou accès de production n'y est monté.
- Aucun connecteur GitHub authentifié ni accès de base de données n'est encore installé dans le runtime du Manager.

## Démarrage local

Prérequis : Node.js 24+.

```bash
npm install
npm run dev
```

Compilation :

```bash
npm run build
```

## Limites explicites de cette version

- Le Manager peut cadrer, organiser, déléguer aux rôles spécialisés, et exécuter des contrôles locaux dans son sandbox.
- Les développeurs peuvent préparer des changements dans des worktrees locaux ; le Manager doit vérifier les diffs et les tests avant tout transfert.
- La publication GitHub (commit/push/PR), les lectures/écritures Supabase et les déploiements restent hors du runtime et nécessitent une intégration contrôlée ultérieure.
- Aucune action de production n'est autorisée par défaut.

## Garde-fous

- Ne jamais connecter les secrets de production au Manager.
- Ajouter les connexions externes une par une, avec permissions minimales.
- Les outils d'écriture GitHub, les migrations, les déploiements et les fusions devront être protégés par une validation humaine explicite.


## Interface Manager

- `/` redirige vers le tableau de bord `/dashboard`.
- `/s` démarre une nouvelle conversation avec Coach In Manager.
- Les pages privées et le canal Eve appliquent la liste blanche `MANAGER_ALLOWED_EMAILS` en dehors du développement.
- Le tableau de bord affiche la configuration de l'équipe et les garde-fous ; il ne prétend pas fournir de télémétrie temps réel.
- Voir `SECURITY-AUDIT.md` pour les contrôles et limites connus.


## Budget de contexte et quotas IA

- Les instructions du Manager sont volontairement courtes : les documents détaillés sont chargés uniquement lorsqu'ils sont utiles à la mission.
- Le Manager compacte l'historique à partir d'un contexte de 6 500 tokens, avec un seuil de 65 %, et les réponses sont limitées à 512 tokens par appel.
- Les briefs délégués sont bornés avant envoi ; les résultats de dépendances sont résumés et limités aux preuves les plus utiles.
- Les revues sélectionnent QA et au plus un expert de domaine. Les appels de revue sont séquentiels afin d'éviter les pointes de consommation TPM.
- Le budget caractères/tokens est une estimation heuristique, pas un tokenizer exact ni une garantie de quota. Le runtime du fournisseur reste l'autorité.
- Groq reste prioritaire. Gemini et OpenRouter Free ne servent de secours que si leurs variables Preview sont déjà configurées ; aucune offre payante ni clé n'est ajoutée automatiquement.
- Une limite TPM peut encore bloquer une requête si le prompt système/runtime ajouté par Eve est volumineux ou si d'autres sessions consomment le même quota. La validation finale doit donc inclure un test réel sur Preview.
