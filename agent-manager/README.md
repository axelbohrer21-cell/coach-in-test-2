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

La protection Vercel Auth du déploiement est active. Elle ne remplace pas l'authentification des routes de session Eve. L'API Eve doit continuer à refuser les appels navigateur tant que le canal Web Chat et son authentification utilisateur Vercel ne sont pas provisionnés et vérifiés.

La procédure Eve officielle à terminer depuis le dossier `agent-manager` est :

```bash
npx eve link
npx eve add channel/web
```

Choisir le projet Vercel `coach-in-manager`, sélectionner l'hébergement Vercel, puis effectuer le parcours **Sign in with Vercel** pour provisionner les identifiants navigateur de l'équipe. Ne pas rendre l'API publique et ne pas remplacer l'authentification par `none()`.

Le dépôt GitHub est relié à Vercel et la Preview du socle Manager précédent est READY. Le canal Web reste à provisionner et à authentifier avant de pouvoir tester une conversation réelle. Aucun déploiement de production de Coach In n'a été lancé.

## Contenu de la première version

- Agent principal Coach In Manager avec modèle configuré via Vercel AI Gateway.
- Instructions de gouvernance et de coordination.
- Contexte projet en lecture seule, embarqué dans le workspace.
- Outils explicitement autorisés : poser une question, lire les documents du workspace et déléguer à un agent.
- Les compétences projet et planification sont conservées en fichiers Markdown et consultées par lecture.
- Les checklists de tâches sont suivies dans les réponses ; aucun outil todo durable n'est actuellement activé.
- Équipe déclarée : `product_owner`, `solution_architect`, `frontend_developer`, `backend_developer`, `qa_engineer`, `qa_reviewer`, `tennis_expert`, `ux_reviewer`, `data_security_reviewer`, `release_manager`, `documentation_specialist` et `plan_auditor`.
- Workflow `team_task` : route une mission bornée vers un spécialiste et attend son livrable structuré. Les développeurs disposent des outils de code dans un sandbox isolé et partagent le sandbox du Manager via des worktrees distincts.
- Outil workflow `review_task` : appelle automatiquement l'auditeur de plan puis les spécialistes sélectionnés en parallèle, attend les réponses structurées et retourne un état global (`reviewed`, `changes_requested`, `blocked` ou `partial`). Les spécialistes sont cachés de l'appel direct et passent par cet orchestrateur.
- Les agents de conseil/revue sont limités au contexte transmis et n'ont pas d'accès direct au dépôt, à Supabase ni à une Preview.
- Les développeurs peuvent modifier des fichiers dans un worktree local au sandbox isolé, lire le dépôt public et lancer des tests locaux. Le QA Engineer peut exécuter les tests dans un worktree existant en lecture seule. Aucun ne peut commit, push, ouvrir de PR, accéder à Supabase, ni déployer.
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
