# Coach In Manager

Service privé d'orchestration de l'équipe d'agents développeurs de Coach In. Ce projet est séparé du frontend tennis et n'est pas accessible aux comptes coach/joueur de l'application.

## Stack

- Eve 1.5.0 — runtime d'agents durables.
- Node.js 24+.
- Vercel AI Gateway pour le routage du modèle via l'identité du projet Vercel.
- Aucun accès Supabase ni GitHub n'est ajouté dans cette première étape.

## Contenu de la première version

- Agent principal Coach In Manager.
- Instructions de gouvernance et de coordination.
- Contexte projet en lecture seule, embarqué dans le workspace.
- Outils limités : poser une question, suivre une todo, charger une compétence, lire les documents de contexte et déléguer à un agent de même rôle.
- Sous-agent indépendant `plan_auditor` pour relire les plans.
- Aucun outil shell, écriture de fichiers, accès base de données, accès GitHub ou déploiement.

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

## API et authentification

Eve fournit une API durable sous `/eve/v1` pour créer des sessions, envoyer des messages et recevoir les événements de session.

L'API ne doit jamais être exposée sans authentification. Le canal par défaut Eve refuse les appels de navigateur en production tant qu'une authentification utilisateur adaptée n'est pas configurée. L'accès navigateur du responsable du projet sera ajouté après choix et configuration du mode de connexion (idéalement une authentification dédiée, indépendante des comptes joueurs).

## Limites explicites de cette version

- Le Manager peut cadrer, organiser, questionner et relire les plans.
- Il ne peut pas encore créer des branches, lire le dépôt en direct, modifier le code, lancer les tests, lire Supabase ou déclencher Vercel.
- Les spécialistes Frontend, Backend, Sécurité, QA, Release et Documentation restent à construire.
- Aucune action de production n'est autorisée par défaut.

## Garde-fous

- Ne jamais connecter les secrets de production au Manager.
- Ajouter les connexions externes une par une, avec permissions minimales.
- Les outils d'écriture GitHub, les migrations, les déploiements et les fusions devront être protégés par une validation humaine explicite.
