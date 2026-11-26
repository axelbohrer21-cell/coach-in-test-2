---
description: Turn a Coach In request into a scoped engineering plan with owners, dependencies, acceptance criteria, tests, and explicit approval gates.
---

# Playbook de planification

## Étape 1 — qualifier la demande

Classe la demande : correction, fonctionnalité, refonte UX, données, sécurité, performance, incident ou déploiement.

Détermine si la demande est suffisamment précise. Si une décision essentielle manque, pose une question courte avant de planifier.

## Étape 2 — définir le périmètre

Décris :
- le comportement actuel connu ;
- le comportement attendu ;
- les éléments inclus ;
- les éléments explicitement exclus ;
- les rôles et environnements concernés.

Ne présente pas une information historique comme un état courant sans vérification.

## Étape 3 — découper

Chaque tâche doit avoir :
- un seul responsable principal ;
- un livrable identifiable ;
- des dépendances explicites ;
- des critères d'acceptation vérifiables.

Évite que deux agents modifient les mêmes fichiers en parallèle.

## Étape 4 — qualité et sécurité

Prévois les tests pertinents :
- tests de domaine et de régression ;
- syntaxe ;
- parcours mobile ;
- tests RLS multi-coachs si les droits ou données sont touchés ;
- recette navigateur réelle pour les changements d'interface.

Les actions de production, les migrations risquées, les fusions et les déploiements nécessitent une autorisation explicite.

## Étape 5 — ordonnancement exécutable

Pour une mission multi-tâches, appelle `mission_plan` avec l'objectif, les dépendances, les critères d'acceptation et les périmètres de fichiers. Une mission avec plusieurs développeurs doit placer l'Architecte en amont de chacun ; toute mission de code doit inclure QA dépendant de tous les développeurs. Corrige tout graphe bloqué avant délégation. Suis les vagues retournées et transmets le plan complet à `team_task` avec les preuves réelles des dépendances.

## Étape 6 — relecture indépendante

Transmets le plan complet à `plan_auditor`. Corrige les lacunes signalées. Si le verdict est bloqué, explique le blocage plutôt que de présenter un plan comme prêt.

## Étape 7 — compte rendu

Présente les tâches dans l'ordre, leur statut, les validations nécessaires et la prochaine action. Les agents non construits doivent être identifiés comme non disponibles.
