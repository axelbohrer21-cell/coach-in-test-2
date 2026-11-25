# Agent Planning Coach In — préproduction

## Phase 1 : moteur de recherche de créneaux en lecture seule

Branche : `feat/ai-planning-agent-preprod-2026-11-25`

Projet Supabase de test : `whyylgiscrpqoahdzdkv` — « Coach In test ».

Cette première livraison fournit l'outil métier que l'agent conversationnel utilisera ensuite. Elle ne comprend pas encore le langage naturel via OpenAI : l'interface propose une recherche structurée par coach, date et durée.

### Fonctionnement

- Coach : recherche limitée à son propre planning.
- Joueur : recherche limitée aux coachs auxquels son compte est lié.
- Durées : 60, 90 ou 120 minutes.
- Départs de créneau : uniquement toutes les 30 minutes.
- Contrôles serveur : disponibilités hebdomadaires, occupations partagées, demandes/réservations, indisponibilités et blocs récurrents de Coach B.
- Calendrier : dimanches, vacances Zone B et jours fériés exclus, avec l'exception du 8 mai déjà retenue dans Coach In.
- Lecture seule : la recherche ne crée, ne modifie et n'annule aucune réservation.
- Joueur : le bouton de demande ouvre le formulaire de réservation existant ; le coach garde la validation.

### Sécurité

La RPC `public.get_private_booking_suggestions` est en `SECURITY INVOKER` avec `search_path` vide. Les lectures restent soumises aux politiques RLS. Elle vérifie le profil connecté et le lien coach-joueur. Pour un joueur, les indisponibilités sont récupérées via la RPC existante qui vérifie déjà ce lien. Aucun motif privé d'indisponibilité n'est retourné.

Privilèges vérifiés sur la base de test :
- `authenticated` : exécution autorisée ;
- `anon` : exécution refusée ;
- `SECURITY DEFINER` : désactivé pour cette fonction.

### Vérifications déjà effectuées sur Supabase test

- Coach A, jeudi 26 novembre 2026, 1 h : 64 propositions (16 départs de demi-heure × 4 terrains).
- Joueur lié à Coach A, mêmes critères : 64 propositions.
- Coach B, jeudi 26 novembre 2026, 1 h : 0 proposition, car le créneau collectif récurrent du jeudi est bloqué.
- Coach B, vendredi 27 novembre 2026, 1 h : 108 propositions.
- Indisponibilité temporaire de Coach A de 8 h à 9 h 30 : les propositions avant 9 h 30 sont retirées, pour le coach comme pour le joueur lié. La donnée de test a été annulée par rollback.
- Durée de 45 minutes : rejetée.
- Joueur non lié et coach essayant de consulter le planning d'un autre coach : accès refusé.
- Les quatre dates de reprise Zone B ont été réalignées sur les bornes exactes de `src/domain/group-calendar.js`.

### Tests du code

- Tests unitaires de validation de recherche : 7 réussis sur 7 avec Node 22.
- La recette visuelle avec les comptes Coach A, Coach B et joueur reste à faire.
- La vérification de la prévisualisation Vercel doit porter sur le dernier commit de la branche après le correctif de l'import dupliqué.

### Étape suivante

1. Vérifier le dernier déploiement Vercel Preview et l'interface après connexion.
2. Tester les trois profils et le formulaire de demande existant.
3. Vérifier acceptation, refus, notifications et demandes concurrentes.
4. Ajouter ensuite la compréhension du langage naturel et les appels OpenAI, après confirmation de la présence du secret `OPENAI_API_KEY` sur le projet de test.

Aucune fusion vers `main` ni modification de la base de production n'est prévue à cette étape.
