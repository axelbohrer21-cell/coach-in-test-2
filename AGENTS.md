# COACH IN — règles de travail des agents IA

Ce dépôt contient l'application Coach In existante. Toute intervention doit préserver son fonctionnement et ses règles métier. Ce document s'applique à tous les agents humains ou IA qui interviennent sur le dépôt.

## 1. Périmètre et architecture à respecter

- Dépôt : `axelbohrer21-cell/coach-in-test-2`.
- Branche de référence : `main`. Ne jamais supposer qu'une branche de travail est la version officielle.
- Application web statique : `index.html`, JavaScript natif en modules ES dans `src/`, CSS dans `src/styles.css`.
- Organisation actuelle : `src/core`, `src/domain`, `src/services`, `src/views`, `src/data`.
- Backend : Supabase (PostgreSQL, Auth, RLS, Storage, Edge Functions).
- Hébergement : Vercel.
- Tests : `npm test` exécute `node --test src/domain/*.test.js`; les workflows GitHub contrôlent aussi la syntaxe JavaScript.

Ne pas réécrire l'application dans un autre framework et ne pas ajouter de dépendance lourde sans justification documentée et validation d'architecture.

## 2. Règles métier non négociables

- Les rôles coach, joueur et administrateur restent distincts.
- Un joueur peut être lié à plusieurs coachs.
- La fiche d'identité du joueur est partagée selon les règles prévues ; les suivis pédagogiques, notes privées, séances, bilans, défis et réussites restent isolés par coach auteur.
- Chaque coach conserve son propre planning, ses disponibilités, ses cours collectifs, ses réservations, sa bibliothèque et ses réglages.
- Un joueur ne peut consulter que les coachs auxquels son compte est effectivement lié.
- Le joueur peut consulter les créneaux des coachs liés ; il ne peut pas modifier leur planning.
- Une demande de réservation ne vaut pas réservation confirmée : le coach conserve la décision d'acceptation ou de refus.
- Les cours collectifs et particuliers restent distincts. Les cours collectifs bloquent les créneaux selon les règles de saison et de terrain.
- Les règles calendaires validées (Zone B, jours fériés, exception du 8 mai, saison et fenêtres horaires) ne doivent pas être remplacées par des approximations.
- Pas d'intégration ADOC et pas de gestion des paiements dans Coach In, sauf décision fonctionnelle explicite ultérieure.

## 3. Règles de modification du code

1. Lire le code existant, les tests, le README, le changelog et les documents fonctionnels concernés avant de modifier quoi que ce soit.
2. Décrire le comportement actuel et le comportement attendu avant toute modification non triviale.
3. Travailler sur une branche dédiée, jamais directement sur `main`.
4. Limiter chaque changement au périmètre demandé. Ne pas profiter d'une correction pour refondre des modules sans rapport.
5. Ne pas supprimer, renommer ou reformater massivement du code hors périmètre.
6. Toute évolution du schéma PostgreSQL doit avoir une migration SQL versionnée, relue et idempotente autant que possible.
7. Ne jamais rejouer les scripts d'installation initiale sur une base déjà initialisée.
8. Vérifier l'ordre des migrations et leur présence dans l'historique de chaque environnement avant de les considérer comme appliquées.
9. Ne jamais coder en dur un identifiant personnel, un identifiant de coach ou une adresse e-mail dans une règle métier nouvelle. Les exceptions historiques doivent être signalées et progressivement éliminées, pas copiées.
10. Ne jamais placer de secret, clé privée, mot de passe SQL ou clé Supabase service_role dans le navigateur, le dépôt, les journaux ou les rapports.

## 4. Environnements et sécurité

- Utiliser exclusivement la préproduction pour les essais nécessitant une écriture.
- Confirmer le projet Supabase et le projet Vercel ciblés avant toute opération.
- La base de production est en lecture seule pour les agents, sauf autorisation explicite et spécifique.
- Ne pas modifier les variables d'environnement, les secrets, les paramètres Auth, les règles DNS ou les protections de déploiement.
- Ne pas appliquer une migration à une base sans avoir vérifié le différentiel, les dépendances, la sauvegarde et le plan de retour arrière.
- Les politiques RLS sont une frontière de sécurité, pas un simple filtre d'interface.
- Tout accès coach/joueur doit être testé côté base avec les identités concernées, pas seulement simulé dans le frontend.
- Les vues exposées aux joueurs doivent préserver l'isolation et ne jamais révéler les notes privées, les motifs d'indisponibilité ou les données d'autres joueurs.

## 5. Tests obligatoires

Pour chaque changement :
- `npm test`.
- Vérification syntaxique : `find src -type f -name '*.js' -print0 | xargs -0 -n1 node --check`.
- Tests ciblés des règles métier modifiées.
- Vérification des parcours mobile concernés.
- Si la modification touche les droits ou les données : tests RLS avec Coach A, Coach B, joueur lié aux deux coachs et joueur non lié.
- Si la modification touche le planning : tester cours collectifs, cours particuliers, indisponibilités, réservations en attente/acceptées, chevauchements, changements de semaine, vacances et jours fériés.
- Si un test échoue, corriger ou expliquer précisément le blocage. Ne jamais masquer un test en le supprimant ou en l'assouplissant sans justification.

Les tests unitaires et de syntaxe ne remplacent pas une recette navigateur réelle.

## 6. Workflow de livraison

1. Chef de projet : transforme la demande en critères d'acceptation et découpe les tâches.
2. Architecte : identifie les modules, dépendances, tables, RPC et risques.
3. Designer / Frontend / Backend : réalisent les changements dans des branches dédiées ou des tâches sans chevauchement.
4. Sécurité : examine les autorisations, RLS, fonctions SQL, données exposées et secrets.
5. QA : exécute les tests, contrôle les régressions et fournit des preuves.
6. Documentation : met à jour les documents réellement concernés.
7. Déploiement : prépare uniquement une Preview Vercel et fournit son URL ainsi que le SHA testé.

Un livrable n'est prêt que si les tests sont verts, les critères d'acceptation sont vérifiés, les migrations sont traçables et les risques restants sont déclarés.

## 7. Interdictions de livraison

Sans autorisation explicite d'Axel :
- ne pas fusionner une PR dans `main` ;
- ne pas promouvoir une Preview en production ;
- ne pas lancer de déploiement production ;
- ne pas modifier la base Supabase de production ;
- ne pas supprimer de branche, projet, table, fichier ou donnée ;
- ne pas changer les comptes, rôles ou liens coach-joueur réels.

## 8. Format obligatoire du rapport de chaque agent

Chaque mission se termine par :
- objectif et périmètre ;
- état initial constaté ;
- fichiers et migrations modifiés ;
- décisions et hypothèses ;
- tests exécutés et résultats ;
- URL Preview et SHA, si disponibles ;
- risques, limites et points non vérifiés ;
- statut : `bloqué`, `en cours`, `prêt pour recette` ou `terminé`.

En cas d'incertitude sur une règle métier ou l'environnement cible, arrêter l'action concernée et demander une clarification au chef de projet.