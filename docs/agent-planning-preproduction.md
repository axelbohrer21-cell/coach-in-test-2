# Agent Planning Coach In — préproduction

## Phase 1 : moteur de disponibilités en lecture seule

Branche de travail : `feat/ai-planning-agent-preprod-2026-11-25`

Base de test : projet Supabase `whyylgiscrpqoahdzdkv` (Coach In test).

Cette première livraison ajoute un outil de recherche de créneaux, pas encore un agent conversationnel OpenAI. Elle constitue le premier outil métier de l'Agent Planning : le futur agent IA pourra l'appeler après avoir compris une demande en langage naturel.

### Périmètre

- Lecture seule : aucune réservation n'est créée par la recherche.
- Coach : recherche uniquement dans son propre planning.
- Joueur : recherche uniquement auprès des coachs auxquels son compte est lié.
- Durées admises : 60, 90 ou 120 minutes.
- Pas de créneaux de 10 ou 15 minutes : pas de départs autres que les demi-heures.
- Contrôles serveur : disponibilités hebdomadaires actives, occupations partagées, demandes en attente/acceptées, indisponibilités et blocs collectifs récurrents de Coach B.
- La demande de cours reste dans le formulaire existant ; le coach conserve la validation finale.

### Sécurité

La RPC vérifie le rôle et le lien coach-joueur avec `auth.uid()`. Elle est en `SECURITY DEFINER`, utilise un `search_path` vide, ne renvoie aucun motif privé d'indisponibilité et son exécution est réservée au rôle `authenticated`.

### Tests et limites

- Tests unitaires de validation de la recherche côté navigateur.
- Vérification SQL de la fonction sur la base de préproduction.
- Recette obligatoire avec Coach A, Coach B et un joueur lié aux deux.
- Le calendrier reste l'autorité visuelle ; les suggestions sont calculées côté serveur et la demande finale repasse par le RPC de réservation existant.
- L'analyse en langage naturel et l'appel OpenAI seront ajoutés dans une phase distincte après vérification de la configuration du secret `OPENAI_API_KEY` sur le projet de test.

## État de la recette initiale — 25 novembre 2026

- Migration SQL appliquée au projet Supabase de préproduction `whyylgiscrpqoahdzdkv`.
- Fonction vérifiée dans PostgreSQL : `SECURITY DEFINER`, `search_path` vide, exécution limitée à `authenticated`.
- Test joueur lié aux deux coachs : recherche Coach A autorisée et 64 combinaisons créneau/terrain retournées pour le jeudi 26 novembre 2026 sur 1 h.
- Test Coach B : 0 proposition le jeudi 26 novembre, car sa plage récurrente du jeudi 18 h–19 h 30 est verrouillée par le cours collectif.
- Test d'un joueur non lié à Coach A : accès refusé avec « Ce coach ne suit pas ce joueur. »
- Test vacances de Noël : 0 proposition le 21 décembre 2026.
- Déploiement Vercel de préproduction : état `READY`, commit `e803e7d`.
- Vérification HTTP : page Coach In répond 200 ; `/api/config` renvoie bien l'URL du projet Supabase de préproduction `whyylgiscrpqoahdzdkv`.

URL de recette : https://coach-in-test-2-5vv12vat6-coaching-axel1.vercel.app

### À faire avant de considérer l'agent 1 comme validé

- Connexion réelle et vérification visuelle avec Coach A, Coach B et le joueur lié aux deux.
- Tester la demande depuis un créneau proposé, puis l'acceptation et le refus depuis le compte coach.
- Vérifier les notifications et la concurrence en lançant deux demandes sur le même créneau.
- La couche de compréhension en langage naturel n'est pas encore branchée : cette livraison est le moteur de recherche déterministe et son interface de recette. Elle ne prétend pas être un agent conversationnel complet.
