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

### Vérifications Supabase effectuées

- Coach A, jeudi 26 novembre 2026, 1 h : 64 propositions.
- Joueur lié à Coach A, mêmes critères : 64 propositions.
- Coach B, jeudi 26 novembre 2026, 1 h : 0 proposition, car le créneau collectif récurrent du jeudi est bloqué.
- Coach B, vendredi 27 novembre 2026, 1 h : 108 propositions, également accessible au joueur lié.
- Coach A, jeudi 26 novembre : 60 propositions pour 1 h 30 et 56 pour 2 h.
- 8 mai 2027 : 20 propositions pour Coach A, ce qui confirme l'exception prévue dans Coach In.
- Reprises Zone B du 4 janvier, 8 mars et 3 mai 2027 : propositions possibles ; les dates de reprise ne sont pas traitées comme des jours de vacances.
- Indisponibilité temporaire de Coach A de 8 h à 9 h 30 : les propositions avant 9 h 30 sont retirées, pour le coach comme pour le joueur lié. La donnée temporaire a été annulée par rollback.
- Durée de 45 minutes : rejetée.
- Joueur non lié et coach essayant de consulter le planning d'un autre coach : accès refusé.

### Tests automatisés et déploiement

- Workflow « Coach In automated tests » : succès, Node 22, tests métier et syntaxe JavaScript.
- Workflow « Coach In QA campaign » : succès, Node 20 et Node 22, tests métier et syntaxe JavaScript.
- Vercel Preview : état `READY`, cible `preview`, commit `270f50be`.
- Variables Vercel Preview présentes : `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`, commentées comme configuration Supabase de préproduction.

URL de préproduction : https://coach-in-test-2-ct0nt4cnv-coaching-axel1.vercel.app

### Recette utilisateur encore nécessaire

La compilation et les tests automatisés sont passés, mais il reste à vérifier visuellement l'interface après connexion réelle :
1. Coach A recherche un créneau dans son planning.
2. Coach B vérifie que ses cours collectifs ne sont jamais proposés.
3. Le joueur lié aux deux coachs peut choisir Coach A ou Coach B sans mélange de planning.
4. Le joueur sélectionne « Demander ce créneau » ; le formulaire habituel s'ouvre.
5. Le coach accepte ou refuse la demande ; les notifications et la mise à jour du planning sont contrôlées.

### Étape suivante

Après cette recette, ajouter la compréhension du langage naturel et les appels OpenAI, après confirmation du secret `OPENAI_API_KEY` sur le projet de test.

Aucune fusion vers `main` ni modification de la base de production n'est prévue à cette étape.
