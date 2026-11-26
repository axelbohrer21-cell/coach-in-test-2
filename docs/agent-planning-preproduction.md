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

### Correction appliquée en préproduction : source unique du planning

Branche isolée : `fix/planning-agent-db-backed-occupancy-2026-11-26`

La migration `20261126113000_planning_agent_use_shared_occupancy_only.sql` supprime la règle spéciale fondée sur l'identifiant de Coach B. Les suggestions sont calculées uniquement à partir des disponibilités et de `public.shared_court_occupancy`, comme le calendrier commun de Coach In.

Une régression SQL vérifie que :
- la fonction reste en `SECURITY INVOKER` ;
- la fonction consulte `public.shared_court_occupancy` ;
- aucun UUID ni fallback propre à Coach B ne subsiste.

La migration a été appliquée au projet Supabase de préproduction uniquement.

### Vérifications effectuées après correction

Date testée : vendredi 27 novembre 2026, durée 60 minutes.
- Coach A : 64 propositions.
- Coach B : 108 propositions.
- Joueur déjà lié à Coach A : 64 propositions.
- Ce même joueur, également lié à Coach B : 108 propositions.
- La base de test comporte bien un joueur lié simultanément aux deux coachs ; les deux accès ont été testés séparément avec son identité.
- Coach B, samedi 28 novembre 2026, pendant son cours collectif 09 h 30–13 h 30 : 0 proposition en chevauchement.
- Les 215 cours collectifs actifs de Coach B ont chacun une occupation partagée correspondante ; aucun cours collectif actif sans occupation n'a été détecté.
- Test statique SQL : PASS.
- Privilèges : `anon` ne peut pas exécuter la fonction ; `authenticated` le peut.
- La fonction reste en `SECURITY INVOKER` et ne contient plus l'identifiant de Coach B.

Les appels fonctionnels ont été exécutés sous le rôle `authenticated`, dans des transactions terminées par `ROLLBACK`. Aucun cours, réservation ou lien joueur-coach n'a été ajouté ou modifié pendant les tests.

### Alertes Supabase non liées à cette correction

Les advisors de sécurité signalent des avertissements existants sur des fonctions de parrainage exécutables en `SECURITY DEFINER`, des tables RLS sans politique et la protection des mots de passe compromis. Ces sujets sont hors périmètre de la correction de l'Agent Planning et restent à traiter séparément.

### Recette utilisateur encore nécessaire

1. Coach A recherche un créneau dans son planning.
2. Coach B vérifie que ses cours collectifs ne sont jamais proposés.
3. Le joueur lié aux deux coachs choisit Coach A ou Coach B sans mélange de planning.
4. Le joueur sélectionne « Demander ce créneau » ; le formulaire habituel s'ouvre.
5. Le coach accepte ou refuse la demande ; les notifications et la mise à jour du planning sont contrôlées.

### Étape suivante

Après cette recette, ajouter la compréhension du langage naturel et les appels OpenAI, après confirmation du secret `OPENAI_API_KEY` sur le projet de test.

La PR de correction est ouverte en brouillon vers la branche de préproduction Agent Planning. Aucune fusion vers `main` ni modification de la base de production n'est prévue à cette étape.
