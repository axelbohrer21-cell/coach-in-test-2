---
description: Coordinate multi-agent work through explicit task packets, dependencies, shared evidence, handoffs and a final quality gate.
---

# Protocole de coopération entre agents

## 1. Le Manager est le chef d'orchestre
Il conserve l'objectif global, le plan, l'état des tâches, les décisions et le résultat final. Aucun agent ne peut redéfinir seul le périmètre global ni considérer son propre avis comme une validation finale.

## 2. Brief obligatoire
Chaque délégation contient :
- mission ID et task ID ;
- résultat attendu et rôle attribué ;
- contexte projet strictement pertinent ;
- décisions validées et hypothèses clairement séparées ;
- fichiers autorisés et périmètre de modification ;
- dépendances et contrat d'interface ;
- critères d'acceptation ;
- preuves attendues et tests à exécuter ;
- limites de sécurité et statut d'autorisation.

## 3. Dépendances et parallélisme
- L'architecte ou le product owner intervient avant le développement si le besoin ou le contrat est incertain.
- Plusieurs tâches peuvent être lancées en parallèle seulement si leurs fichiers et interfaces sont disjoints.
- Une tâche dépendante attend le livrable réel de son prédécesseur.
- Le QA démarre après disponibilité du worktree exact contenant les changements.
- Si deux agents ont besoin de modifier le même fichier, séquencer les tâches et confier le fichier à un seul responsable.

## 4. Passation entre agents
Le Manager transmet lui-même le livrable précédent au suivant : décisions, chemins exacts, extraits de diff, résultats de commandes, tests, limites et questions ouvertes. Les agents ne supposent pas qu'ils peuvent lire les conversations ou worktrees des autres.

## 5. Contrôle et consolidation
- Le Manager vérifie les fichiers et preuves indépendamment.
- Les reviewers ne valident que ce qu'ils ont reçu.
- Les échecs et preuves manquantes restent visibles.
- Un résultat d'agent n'est pas assimilé à un test réussi.
- Le Manager met à jour le journal de mission et propose les faits réutilisables à la mémoire projet.

## 6. Apprentissage et métriques
Enregistrer les rôles, temps/latence disponibles, statut, nombre de reprises, tests et défauts détectés uniquement si les données sont réellement disponibles. Ne pas inventer de score. Comparer les agents sur des tâches comparables et une grille commune avant toute modification de routage ou de modèle.

## 7. Sécurité
Pas de secrets, données privées de joueurs, accès production, écriture de base distante, merge, promotion ou déploiement sans le processus d'autorisation défini par le projet.


## Barrière de dépendances vérifiable
- Toute tâche qui déclare `dependsOn` doit recevoir un `dependencyResults` structuré pour chaque identifiant attendu.
- Chaque résultat doit avoir `status=completed` et au moins une preuve non vide ; sinon `team_task` bloque la délégation avant l'appel à l'agent.
- Les identifiants de dépendance dupliqués ou non déclarés sont rejetés. Le Manager transmet les résumés, livrables et preuves des tâches précédentes, pas seulement leurs noms.
- Une preuve déclarée par un agent reste à vérifier par le Manager : cette barrière garantit le chaînage explicite, pas la véracité automatique de la preuve.

## 8. Barrière de clôture des tâches

Une réponse structurée de l'agent n'est pas automatiquement une tâche terminée.

- Chaque délégation porte un `missionId`, un `taskId` et au moins un critère d'acceptation. L'agent retourne un résultat distinct pour chaque critère, avec le texte exact, un statut et une preuve ; les critères manquants, dupliqués ou non démontrés bloquent la clôture.
- Le statut `completed` est rejeté si le résumé ou les livrables sont vides.
- Une commande avec code de sortie non nul ou un test échoué bloque la clôture.
- Un développeur doit fournir au moins un fichier modifié ; le Manager doit ensuite contrôler le diff réel.
- QA Engineer doit fournir au moins un test réussi avec preuve, aucun test échoué/non exécuté, et aucun fichier modifié.
- Une tâche bloquée, échouée ou en attente d'information ne peut pas alimenter une dépendance comme si elle était terminée.
- Le Manager vérifie les preuves indépendamment avant de les transmettre à l'étape suivante.

## 9. Ordre de revue

Pour une revue non triviale, `review_task` exécute d'abord `plan_auditor`. Son résultat structuré est transmis ensuite à QA et aux spécialistes sélectionnés, qui peuvent travailler en parallèle. Si l'audit échoue, les spécialistes en sont informés et la revue finale reste partielle ou bloquée selon les résultats ; le Manager ne masque pas cet échec.

## 10. Mémoire de mission

- Les enregistrements de mission sont append-only : une nouvelle sauvegarde ne remplace pas silencieusement une entrée antérieure.
- La liste des enregistrements est paginée ; le Manager suit le curseur retourné jusqu'à avoir parcouru la plage nécessaire.
- Le schéma refuse les motifs courants de données sensibles (adresses e-mail, téléphones français, secrets assignés, tokens Bearer/JWT et tokens connus). Ce contrôle réduit les erreurs évidentes, mais ne remplace pas le jugement du Manager : aucun contenu personnel ou secret ne doit être envoyé à la mémoire.
- Si le stockage Blob est indisponible, la mission doit être signalée comme non mémorisée.


## 11. Planification exécutable du graphe de tâches

- Avant toute mission à plusieurs tâches, le Manager appelle `mission_plan`.
- Le plan refuse les identifiants dupliqués, dépendances inconnues ou cycliques, chemins invalides, développeurs sans périmètre explicite, missions de code sans QA, QA qui ne dépend pas de tous les développeurs et missions multi-développeurs sans Architecte en amont de chaque développeur.
- Les tâches indépendantes aux périmètres disjoints sont regroupées en vagues parallèles.
- Les tâches dont les chemins se chevauchent sont sérialisées automatiquement ; le plan ajoute une dépendance `executionDependsOn` que le Manager doit transmettre avec le livrable du prédécesseur.
- Le Manager ne lance jamais une vague suivante avant d'avoir vérifié les résultats et preuves de la vague précédente. Il intègre les diffs des worktrees développeurs dans un worktree d'intégration distinct ; QA teste ce worktree consolidé en lecture seule, jamais un seul worktree développeur choisi arbitrairement.
- `mission_plan` ne lance aucun agent et ne modifie aucun fichier : il sécurise l'ordonnancement. Les délégations effectives restent réalisées par `team_task`.
