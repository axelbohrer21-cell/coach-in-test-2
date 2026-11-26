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

## Étape 4 bis — préparer les worktrees avant délégation

Le Manager, et lui seul, prépare les worktrees dans son sandbox avec son outil `bash` lorsqu'il est exposé. Les développeurs et QA ne clonent pas le dépôt et ne créent pas de worktree.

Pour chaque tâche sandbox planifiée :
1. Vérifier que `/workspace/coach-in` est bien la racine du dépôt attendu.
2. Vérifier que le `baseRef` existe localement comme commit ; si nécessaire, récupérer uniquement cette référence depuis le dépôt GitHub autorisé.
3. Vérifier que le `worktreePath` n'existe pas déjà et que la branche de travail n'est pas déjà utilisée.
4. Créer le worktree dédié depuis le même `baseRef` pour les tâches d'une même mission.
5. Contrôler le dépôt, la branche active et un `git status` propre avant de déléguer.
6. Transmettre au sous-agent le chemin exact, la branche, le `baseRef` et le périmètre de fichiers validé.
7. Si un prérequis échoue, ne pas déléguer et retourner un statut bloqué ; ne jamais réutiliser ou nettoyer un worktree existant sans diagnostic.

Pour QA, préparer un worktree d'intégration distinct depuis le même `baseRef`. Après chaque développeur, le Manager inspecte le diff, inclut aussi les nouveaux fichiers, vérifie les chemins et consolide les changements dans le worktree d'intégration. Pour des tâches sérialisées avec chevauchement, intégrer et contrôler le livrable du prédécesseur dans le worktree du successeur avant de le lancer. QA reçoit uniquement le worktree d'intégration consolidé.

Les worktrees et branches sont locaux au sandbox. Aucun commit, push, PR, merge GitHub, déploiement ou changement Production n'est autorisé dans ce protocole.

## Étape 5 — ordonnancement exécutable

Pour une mission multi-tâches, appelle `mission_plan` avec l'objectif, les dépendances, les critères d'acceptation et les périmètres de fichiers. Une mission avec plusieurs développeurs doit placer l'Architecte en amont de chacun ; toute mission de code doit inclure QA dépendant de tous les développeurs. Corrige tout graphe bloqué avant délégation. Suis les vagues retournées et transmets le plan complet à `team_task` avec les preuves réelles des dépendances.

## Étape 6 — relecture indépendante

Transmets le plan complet à `plan_auditor`. Corrige les lacunes signalées. Si le verdict est bloqué, explique le blocage plutôt que de présenter un plan comme prêt.

## Étape 7 — compte rendu

Présente les tâches dans l'ordre, leur statut, les validations nécessaires et la prochaine action. Les agents non construits doivent être identifiés comme non disponibles.
