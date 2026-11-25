---
description: Read the Coach In architecture, business rules, environments, and delivery safeguards before planning development work.
---

# Coach In — contexte projet

## Dépôt et architecture

- Dépôt GitHub : `axelbohrer21-cell/coach-in-test-2`.
- Application : HTML et JavaScript natif en modules ES.
- Dossiers applicatifs : `src/core`, `src/domain`, `src/services`, `src/views`, `src/data`.
- Backend : Supabase (PostgreSQL, Auth, RLS, Storage, Edge Functions).
- Hébergement : Vercel.
- Tests de domaine : `npm test`.
- Vérification syntaxique : `find src -type f -name '*.js' -print0 | xargs -0 -n1 node --check`.

## Environnements connus au 25 novembre 2026

- Supabase préproduction : `whyylgiscrpqoahdzdkv`.
- Supabase production : `hniguulywwoakfqfxgrh`.
- Projet Vercel de l'application : `coach-in-test-2`.
- Un second projet Vercel nommé `coach-in` existe également : ne jamais confondre les deux.
- Les détails de cette référence sont historiques. Vérifier l'état courant avant toute opération.

## Règles de données et d'accès

- Rôles coach, joueur et administrateur distincts.
- Un joueur peut être lié à plusieurs coachs.
- L'identité du joueur peut être partagée selon les règles prévues ; les suivis pédagogiques et notes privées restent isolés par coach auteur.
- Les plannings, cours collectifs, réservations, bibliothèques et réglages appartiennent à chaque coach.
- Le joueur ne peut consulter que les coachs auxquels il est lié.
- Les politiques RLS sont une frontière de sécurité ; un filtre frontend ne suffit jamais.
- Tester les droits avec Coach A, Coach B, joueur lié aux deux et joueur non lié.

## Livraison

- Travailler sur une branche dédiée, jamais directement sur `main`.
- Chaque migration doit être versionnée et vérifiée contre l'historique réel de l'environnement.
- Tests automatisés et revue sécurité avant recette.
- Préparer une Preview correspondant exactement au SHA testé.
- Pas de fusion, promotion ou déploiement production sans accord explicite.

## Source de vérité

Le fichier `AGENTS.md` du dépôt et les documents de `docs/agent-team/` font autorité sur les règles de travail. Les informations ci-dessus sont un aide-mémoire daté, pas une preuve de l'état actuel du dépôt ou des bases.
