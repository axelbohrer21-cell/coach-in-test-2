---
description: Choose the smallest effective Coach In agent team and select reviewers according to risk and product area.
---

# Routage intelligent des agents Coach In

## Principe
Le Manager reste responsable de la mission. Il ne délègue pas une question simple ni une petite correction qu'il peut traiter de façon sûre et vérifiable avec les outils disponibles. Il choisit le plus petit nombre d'agents permettant de produire un résultat fiable.

## Routage par type de travail

| Besoin | Agent principal | Appuis conditionnels |
|---|---|---|
| Clarifier besoin, parcours, critères | product_owner | tennis_expert si règles club |
| Architecture, contrats, découpage | solution_architect | data_security_reviewer si données/droits |
| Conception UI, parcours, maquettes fonctionnelles et états d’écran | ui_designer | product_owner, ux_reviewer |
| Implémentation interface, CSS, navigation | frontend_developer | ui_designer, ux_reviewer, qa_reviewer |
| API, services, SQL proposé, RLS | backend_developer | solution_architect, supabase_expert, data_security_reviewer |
| Tests locaux en lecture seule | qa_engineer | QA après un worktree développeur existant |
| Plan de livraison, rollback | release_manager | data_security_reviewer si migration/données |
| Guides et documentation | documentation_specialist | product_owner pour valider le vocabulaire |

## Délégation de développement
- Une mission = un responsable principal.
- Les tâches parallèles doivent toucher des fichiers disjoints et avoir des contrats d'interface explicites.
- Ne lance jamais deux développeurs sur le même fichier ou le même worktree.
- Le QA Engineer ne démarre qu'après création du worktree et présence des changements à tester.
- Fournis au spécialiste seulement le contexte nécessaire : objectif, décisions validées, chemins/fichiers pertinents, contraintes, critères d'acceptation et preuves disponibles.
- Les agents de revue n'ont pas d'accès direct au dépôt : transmets les extraits, diff, sorties de tests ou observations réellement collectés.

## Revue indépendante
- Pour une mission non triviale, appeler review_task après avoir constitué un contexte exploitable.
- Sans liste explicite de reviewers, review_task inclut QA et sélectionne les spécialistes tennis, UX, sécurité et Supabase selon le vocabulaire de la mission.
- Fournir une liste explicite seulement lorsqu'une sélection volontairement plus étroite est justifiée.
- Ne pas confondre revue sur contexte transmis et inspection directe : les reviewers ne certifient pas un code ou une base qu'ils n'ont pas vus.

## Économie de quotas
- Pas de délégation en cascade sans dépendance réelle.
- Pas de revue complète pour une question ou un changement documentaire mineur.
- Ne pas relancer un agent pour reformuler une réponse déjà exploitable.
- Préférer un lot de lectures ciblées, puis une seule délégation avec contexte condensé.
- Si une réponse est insuffisante, demander uniquement l'élément manquant.

## Mesure de qualité
Pour chaque mission, le Manager note dans son compte rendu : rôle sollicité, résultat, preuves, tests exécutés/non exécutés, blocage éventuel et besoin de reprise. Ne prétends pas disposer de métriques agrégées tant qu'un stockage/rapport de mesure n'est pas implémenté.
