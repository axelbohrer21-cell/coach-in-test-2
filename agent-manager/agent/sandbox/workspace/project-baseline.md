# Coach In — état de référence du projet

État de référence documentaire daté du 25 novembre 2026. Vérifier à nouveau avant toute action opérationnelle.

## Environnement

- Dépôt GitHub : `axelbohrer21-cell/coach-in-test-2`.
- Supabase préproduction : `whyylgiscrpqoahdzdkv`.
- Supabase production : `hniguulywwoakfqfxgrh`.
- Projet Vercel principal de l'application : `coach-in-test-2`.
- Un second projet Vercel `coach-in` existe également ; vérifier le projet exact à chaque action.

## Architecture applicative

- Frontend statique : HTML, CSS, JavaScript natif en modules ES.
- Dossiers : `src/core`, `src/domain`, `src/services`, `src/views`, `src/data`.
- Backend : Supabase PostgreSQL, Auth, RLS, Storage et Edge Functions.
- Tests : `npm test` exécute les tests de domaine Node.
- CI : tests de domaine et vérification de syntaxe JavaScript.

## Équipe technique envisagée

- Coach In Manager : coordination et suivi des missions.
- Agent Produit / Cahier des charges.
- Agent Architecte.
- Agent UX/UI.
- Agent Frontend.
- Agent Backend / Données.
- Agent Sécurité.
- Agent QA / Testeur.
- Agent Release / Déploiement.
- Agent Documentation.

Au démarrage, seul Coach In Manager et son sous-agent de relecture de plan sont implémentés. Les autres rôles ne sont pas opérationnels tant que leurs agents n'ont pas été construits et testés.

## Risques techniques documentés

- `src/app.js` est un fichier central volumineux ; privilégier les modules spécialisés.
- Les bases Supabase production et préproduction ne sont pas des copies synchronisées.
- L'historique des migrations et le schéma réel ont déjà présenté des écarts ; vérifier avant toute migration.
- Les workflows CI ne remplacent pas une recette navigateur réelle.
- Les accès et règles multi-coachs doivent être testés avec plusieurs identités.

## Statuts à ne jamais confondre

`planifié`, `codé`, `testé automatiquement`, `vérifié en Preview`, `validé par Axel` et `déployé en production` sont des états différents.
