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
