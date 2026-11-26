# Agent Planning Coach In — préproduction

## Phase 1 : moteur de recherche de créneaux en lecture seule

Branche de base : `feat/ai-planning-agent-preprod-2026-11-25`

Projet Supabase de test : `whyylgiscrpqoahdzdkv` — « Coach In test ».

Cette première livraison fournit l'outil métier que l'agent conversationnel utilisera ensuite. Elle ne comprend pas encore le langage naturel via OpenAI : l'interface propose une recherche structurée par coach, date et durée.

### Fonctionnement

- Coach : recherche limitée à son propre planning.
- Joueur : recherche limitée aux coachs auxquels son compte est lié.
- Durées : 60, 90 ou 120 minutes.
- Départs de créneau : uniquement toutes les 30 minutes.
- Contrôles serveur : disponibilités hebdomadaires, occupations partagées, demandes/réservations et indisponibilités.
- Calendrier : dimanches, vacances Zone B et jours fériés exclus, avec l'exception du 8 mai déjà retenue dans Coach In.
- Lecture seule : la recherche ne crée, ne modifie et n'annule aucune réservation.
- Joueur : le bouton de demande ouvre le formulaire de réservation existant ; le coach garde la validation.

### Sécurité

La RPC `public.get_private_booking_suggestions` est en `SECURITY INVOKER` avec `search_path` vide. Les lectures restent soumises aux politiques RLS. Elle vérifie le profil connecté et le lien coach-joueur. Pour un joueur, les indisponibilités sont récupérées via la RPC existante qui vérifie déjà ce lien. Aucun motif privé d'indisponibilité n'est retourné.

Privilèges vérifiés sur la base de test :
- `authenticated` : exécution autorisée ;
- `anon` : exécution refusée ;
- `SECURITY DEFINER` : désactivé pour cette fonction.

### Correction en cours : source unique du planning

Branche isolée : `fix/planning-agent-db-backed-occupancy-2026-11-26`

La migration `20261126113000_planning_agent_use_shared_occupancy_only.sql` supprime la règle spéciale fondée sur l'identifiant de Coach B. Les suggestions sont calculées uniquement à partir des disponibilités et de `public.shared_court_occupancy`, comme le calendrier commun de Coach In.

Une régression SQL vérifie que :
- la fonction reste en `SECURITY INVOKER` ;
- la fonction consulte `public.shared_court_occupancy` ;
- aucun UUID ni fallback propre à Coach B ne subsiste.

État observé dans la base de test avant application de cette correction :
- Coach B : 215 cours collectifs actifs sur la saison et 215 occupations partagées correspondantes ;
- aucun cours collectif actif sans occupation partagée correspondante ;
- le code SQL de la RPC contenait encore un ancien UUID Coach B, bien que les occupations réelles suffisent désormais.

### Vérifications antérieures

Les vérifications précédentes de la phase 1 avaient notamment confirmé les durées 60/90/120 minutes, les contrôles de rôle et de lien coach-joueur, les règles de calendrier Zone B et le retrait des créneaux pendant une indisponibilité temporaire.

Attention : la base de test contient actuellement deux coachs, chacun avec un joueur lié, mais aucun joueur lié simultanément aux deux coachs. Le scénario « un joueur lié à Coach A et Coach B » ne peut donc pas être présenté comme déjà testé. Il sera testé avec une liaison temporaire annulée par rollback, ou après création d'un compte de test adapté.

### Recette utilisateur encore nécessaire

Après validation technique :
1. Coach A recherche un créneau dans son planning.
2. Coach B vérifie que ses cours collectifs ne sont jamais proposés.
3. Un joueur lié aux deux coachs peut choisir Coach A ou Coach B sans mélange de planning.
4. Le joueur sélectionne « Demander ce créneau » ; le formulaire habituel s'ouvre.
5. Le coach accepte ou refuse la demande ; les notifications et la mise à jour du planning sont contrôlées.

### Étape suivante

Après cette recette, ajouter la compréhension du langage naturel et les appels OpenAI, après confirmation du secret `OPENAI_API_KEY` sur le projet de test.

Aucune fusion vers `main` ni modification de la base de production n'est prévue à cette étape.
