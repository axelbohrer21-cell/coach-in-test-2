# Audit sécurité et état opérationnel — Coach In Manager

Date : 26 novembre 2026  
Périmètre : application Manager et sa branche Preview uniquement.

## Résumé exécutif

- Aucun accès ni changement à Supabase Production.
- Les pages privées et le canal Eve contrôlent maintenant l'adresse e-mail autorisée via `MANAGER_ALLOWED_EMAILS`.
- La variable d'autorisation est limitée à la Preview de cette branche.
- Le stockage des missions utilise un Vercel Blob privé ; son jeton reste limité à cette Preview.
- L'audit npm initial signalait 4 vulnérabilités élevées et 7 faibles. Les overrides testés ont ramené les vulnérabilités élevées à zéro.
- Sept alertes faibles restent liées à KaTeX et à ses intégrations mathématiques/diagrammes. L'audit npm ne propose pas de correctif disponible pour la version concernée.
- Les 5 tests de routage et les 4 tests de contrôle d'accès passent après les changements de dépendances.
- Le typecheck passe.
- Le build de production Next.js passe avec les variables d'environnement de test et génère les routes `/dashboard`, `/s` et `/s/[sessionId]`.
- Le build Eve complet n'a pas pu être vérifié dans le sandbox : résolution DNS de `ai-gateway.vercel.sh` indisponible. Il doit être vérifié par la Preview Vercel.

## Contrôles réalisés

### Contrôle d'accès
- Vérification de session Better Auth sur les pages de chat et le tableau de bord.
- Vérification de l'adresse autorisée sur les pages côté serveur.
- Vérification identique à l'entrée du canal Eve, avant de créer le principal utilisateur.
- En production, l'absence de `MANAGER_ALLOWED_EMAILS` ne donne accès à aucun compte.
- La configuration Preview actuelle n'autorise qu'un seul compte projet.

### Mémoire
- Stockage Blob privé, région CDG1.
- Jeton de lecture/écriture limité à la branche Preview.
- Chemins limités au préfixe `coach-in-manager/projects/coach-in/missions/`.
- Schémas de mission stricts et tailles de collections bornées.
- Les consignes interdisent les secrets, identifiants, données personnelles de joueurs et notes privées de coaching.
- Le test complet de lecture/écriture depuis la Preview Manager reste à effectuer après déploiement.

### Dépendances
- Les dépendances transitives Vercel vulnérables ont été remplacées par des versions corrigées via overrides.
- Zod est forcé sur la version directe corrigée du projet.
- Résultat du dernier `npm audit` après les overrides : **0 vulnérabilité** (0 critique, 0 élevée, 0 modérée, 0 faible).
- KaTeX est forcé en version 0.18.2 corrigée. Conserver le rendu KaTeX non fiable par défaut ; ne pas activer d'option `trust` permissive.

## Tableau de bord

La route `/dashboard` est un centre de pilotage de configuration :
- annuaire des 12 spécialistes ;
- description du flux de travail ;
- garde-fous d'accès, de stockage et de production ;
- raccourci vers une nouvelle mission.

Il ne prétend pas afficher des métriques temps réel : l'historique des missions, les temps de réponse, les quotas, le taux de réussite et les erreurs ne sont pas encore reliés à une base de télémétrie.

## Points non validés / limites

1. Le déploiement Vercel Preview du Manager attend la levée de la limite quotidienne de déploiements.
2. Le build Eve et le chargement des outils doivent être vérifiés sur cette Preview.
3. La mémoire doit être testée de bout en bout, y compris entre deux sessions distinctes.
4. Les alertes KaTeX faibles doivent être surveillées jusqu'à publication d'un correctif amont.
5. Le tableau de bord est un tableau de configuration, pas encore un tableau de bord analytique.

## Hors périmètre volontaire

- Aucun merge ou déploiement Production.
- Aucune variable d'environnement Production modifiée.
- Aucune écriture Supabase Production.
- Aucune suppression de compte, donnée ou ressource.
