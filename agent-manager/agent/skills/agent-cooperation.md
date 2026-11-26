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
