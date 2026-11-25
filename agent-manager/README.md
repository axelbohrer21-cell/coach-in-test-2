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
- Protection Vercel Auth / SSO activée sur **tous les déploiements** (`deploymentType: all`).
- L'accès est réservé aux membres autorisés de l'équipe Vercel et ne réutilise pas les comptes Coach In.
- Node.js configuré en `24.x`.
- Aucun domaine personnalisé, déploiement ou secret de production n'est configuré.
- Le projet Vercel principal `coach-in-test-2` n'a pas été modifié.

### État de l'authentification navigateur

La protection Vercel Auth du déploiement est active. Elle ne remplace pas l'authentification des routes de session Eve. L'API Eve doit continuer à refuser les appels navigateur de production tant que le canal Web Chat et son authentification utilisateur Vercel ne sont pas provisionnés.

La procédure Eve officielle à terminer depuis le dossier `agent-manager` est :

```bash
npx eve link
npx eve add channel/web
```

Choisir le projet Vercel `coach-in-manager`, sélectionner l'hébergement Vercel, puis effectuer le parcours **Sign in with Vercel** pour provisionner les identifiants navigateur de l'équipe. Ne pas rendre l'API publique et ne pas remplacer l'authentification par `none()`.

**Blocage actuel :** aucun compte GitHub n'est connecté à l'intégration Git de ce compte Vercel. La liaison du dépôt et le provisionnement interactif du canal Web ne peuvent donc pas être terminés automatiquement pour le moment. Le projet reste sans déploiement et l'API reste fermée par défaut.

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

## Limites explicites de cette version

- Le Manager peut cadrer, organiser, questionner et relire les plans.
- Il ne peut pas encore créer des branches, lire le dépôt en direct, modifier le code, lancer les tests, lire Supabase ou déclencher Vercel.
- Les spécialistes Frontend, Backend, Sécurité, QA, Release et Documentation restent à construire.
- Aucune action de production n'est autorisée par défaut.

## Garde-fous

- Ne jamais connecter les secrets de production au Manager.
- Ajouter les connexions externes une par une, avec permissions minimales.
- Les outils d'écriture GitHub, les migrations, les déploiements et les fusions devront être protégés par une validation humaine explicite.
