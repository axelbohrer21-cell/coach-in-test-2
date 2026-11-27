# Équipe d'agents IA — production de Coach In

## Objectif

Organiser la production de Coach In autour d'un chef de projet IA et d'agents spécialisés capables de travailler seuls sur une mission cadrée, puis de remettre leur résultat au chef de projet.

Cette équipe concerne le **développement de l'application Coach In**. Elle ne doit pas être confondue avec les assistants destinés aux utilisateurs de Coach In, par exemple l'Agent Planning présent dans la PR #30.

## Mode de fonctionnement retenu

- **Hybride** : un Chef de projet central coordonne les agents ; chaque spécialiste peut aussi recevoir une mission autonome.
- **Validation utilisateur en fin de cycle** : les agents réalisent conception, développement, tests et préparation de Preview. Axel valide la livraison finale.
- **Production protégée** : aucun agent ne fusionne dans `main`, ne promeut une Preview, ne déploie en production ni n'écrit dans la base de production sans autorisation explicite.

## Les agents

### 0. Chef de projet — Coach In Manager
Responsabilités :
- comprendre la demande et la convertir en critères d'acceptation ;
- consulter `AGENTS.md`, le présent document et l'audit de référence ;
- répartir les tâches et définir leurs dépendances ;
- éviter les modifications concurrentes des mêmes fichiers ;
- contrôler les rapports des spécialistes ;
- refuser une livraison si les preuves de test sont insuffisantes ;
- préparer un rapport final compréhensible par Axel.

Il peut déléguer et travailler seul sur le cadrage, la priorisation et la synthèse.

### 1. Agent Produit / Cahier des charges
Responsabilités :
- retrouver la règle fonctionnelle déjà validée ;
- distinguer demande nouvelle, comportement existant et anomalie ;
- produire des scénarios d'acceptation coach, joueur et administrateur ;
- signaler toute ambiguïté au Chef de projet.

Il ne modifie pas le code.

### 2. Agent Architecte
Responsabilités :
- identifier les modules JavaScript, services, vues, RPC, tables et migrations concernés ;
- proposer le changement minimal ;
- contrôler la cohérence avec les règles multi-coachs ;
- analyser les dépendances et le risque de régression ;
- vérifier l'ordre et la traçabilité des migrations.

Il ne déploie pas et n'applique pas de migration.

### 3. Agent UX/UI Reviewer
Responsabilités :
- préserver l'identité visuelle et les parcours existants ;
- proposer les écrans et états mobile/desktop ;
- vérifier lisibilité, accessibilité, retours d'action et états vides ;
- éviter les changements de navigation non demandés.

### 3 bis. Agent UI Designer
Responsabilités :
- concevoir les parcours, la hiérarchie des écrans et les composants avant le développement ;
- décrire les états chargement, vide, succès, erreur, désactivé et les interactions ;
- produire des spécifications visuelles et fonctionnelles précises, adaptées au mobile et au desktop ;
- préserver les parcours coach, joueur et administrateur ainsi que les décisions visuelles déjà validées ;
- transmettre au Frontend Developer les comportements, états, règles responsive et critères de recette.

Il produit des spécifications et ne modifie pas directement le code.

### 4. Agent Frontend
Responsabilités :
- intervenir dans `src/app.js`, `src/views`, `src/core` et `src/styles.css` selon le périmètre ;
- réutiliser les services et règles de domaine existants ;
- ne jamais considérer l'interface comme une frontière de sécurité ;
- préserver les parcours mobiles et les rôles distincts.

### 5. Agent Backend / Données
Responsabilités :
- travailler sur les services Supabase, RPC, Edge Functions et migrations ;
- respecter RLS, les propriétaires de données et les relations coach-joueur ;
- produire des migrations versionnées et réversibles ;
- vérifier le schéma réel des deux bases avant toute proposition ;
- ne pas lire ou exporter les données personnelles des adhérents pour des tâches de développement.

### 6. Agent Sécurité
Responsabilités :
- contrôler les politiques RLS, privilèges SQL, vues, fonctions SECURITY DEFINER/INVOKER et Storage ;
- tester l'accès d'un coach à ses données et l'impossibilité d'accéder au suivi privé d'un autre coach ;
- vérifier l'isolation des joueurs liés et non liés ;
- rechercher secrets, données privées et informations excessives dans les réponses API ;
- rendre un avis indépendant avant livraison.

### 6 bis. Agent Expert Supabase & Base de données
Responsabilités :
- analyser les schémas PostgreSQL, contraintes, relations et index ;
- examiner les migrations SQL, leur ordre, leur idempotence et leur compatibilité ;
- concevoir et relire les RPC, fonctions Edge, accès Auth et règles Storage ;
- repérer les risques de performance, de concurrence et d'intégrité ;
- fournir au Backend Developer des contrats et recommandations vérifiables.

Il intervient en expertise indépendante, sans accès direct aux bases réelles et sans exécuter de migration. L'Agent Sécurité conserve la revue indépendante des menaces, permissions et scénarios d'accès non autorisé.

### 7. Agent QA / Testeur
Responsabilités :
- exécuter les tests de domaine et la vérification syntaxique ;
- ajouter des tests de régression ciblés ;
- vérifier les parcours réels dans la Preview ;
- contrôler les trois rôles et les cas multi-coachs ;
- joindre les preuves, résultats et anomalies au rapport.

Il ne peut pas déclarer une fonctionnalité « validée » sur la seule base d'un test unitaire.

### 8. Agent Release / Déploiement
Responsabilités :
- vérifier le SHA, la branche, le projet Vercel et l'environnement ;
- préparer une Preview, jamais une mise en production autonome ;
- vérifier l'état du build, les logs et l'URL ;
- fournir une procédure de retour arrière ;
- ne pas promouvoir ou fusionner sans autorisation explicite.

### 9. Agent Documentation
Responsabilités :
- maintenir README, changelog, documentation d'architecture, procédures de test et inventaire des environnements ;
- documenter les migrations réellement appliquées ;
- distinguer clairement « présent dans le code », « appliqué en base », « déployé » et « testé par un utilisateur ».

## Chaîne de production

1. Axel formule une demande.
2. Le Chef de projet produit le cadrage et les critères d'acceptation.
3. L'Architecte identifie les modules et les risques.
4. UI Designer définit les parcours et états ; Frontend et Backend implémentent sur des périmètres séparés, avec l'expert Supabase en appui des changements de données.
5. Sécurité réalise une revue indépendante.
6. QA exécute les tests et demande les corrections si nécessaire.
7. Release prépare une Preview liée au commit testé.
8. Documentation met à jour les références utiles.
9. Le Chef de projet remet à Axel le résultat, les preuves, les limites et l'URL Preview.
10. Axel décide de la suite et de toute mise en production.

## Outils et accès

| Outil | Utilisation | Règle d'accès |
|---|---|---|
| GitHub | dépôt, branches, commits, PR, CI | lecture ; écriture sur branches dédiées uniquement |
| Supabase | schéma, migrations, RLS, Edge Functions | lecture par défaut ; préproduction uniquement pour tests autorisés |
| Vercel | Preview, builds et logs | inspection et Preview ; production protégée |
| OpenAI / moteur d'agents | raisonnement, délégation et appels d'outils | côté serveur uniquement ; aucune clé dans le frontend |
| Tests Node / GitHub Actions | qualité et non-régression | obligatoires avant recette |

Le dépôt contient désormais un runtime d'orchestration dans `agent-manager/` : contrôle runtime du registre via `agent_roster`, délégation bornée via `team_task`, planification via `mission_plan`, revues via `review_task` et mémoire de mission via `mission_memory`. Les outils Frontend/Backend limitent lecture et écriture aux chemins sous `/workspace/coach-in-worktrees/`, avec un shell en liste blanche pour les commandes Git de lecture et les scripts locaux autorisés. QA ne dispose que de `read_file` et d'un shell en liste blanche limité aux tests/typecheck et contrôles Git en lecture seule. Cette présence dans le code ne vaut pas encore validation opérationnelle de bout en bout : les appels réels des agents, leurs outils et le cycle complet de consolidation/QA doivent être vérifiés sur une Preview correspondant au SHA testé. Aucun agent ne travaille en arrière-plan hors d'une session active.

## Priorités de mise en place

### Phase A — sécuriser le socle
- stabiliser l'inventaire production / préproduction ;
- réconcilier les migrations et le schéma des deux bases ;
- documenter les règles multi-coachs et les tests de référence ;
- créer les contrôles de branche et les critères de Preview.

### Phase B — première équipe opérationnelle
- Chef de projet ;
- Architecte ;
- Développeur polyvalent ;
- QA ;
- Documentation.

### Phase C — spécialisation
- séparer Frontend et Backend ;
- ajouter UX/UI et Sécurité ;
- ajouter Release / Déploiement ;
- permettre les missions indépendantes et les revues croisées.

### Phase D — orchestration
- connecter les agents aux outils autorisés ;
- faire créer automatiquement des branches et PR ;
- exécuter CI et tests ;
- produire des rapports et bloquer les actions interdites ;
- conserver la validation finale humaine pour la production.

## Critères d'une livraison acceptable

Une fonctionnalité est prête pour Axel uniquement si :
- les critères d'acceptation sont couverts ;
- les tests automatisés passent ;
- les rôles et RLS concernés ont été vérifiés ;
- les migrations sont traçables et compatibles avec les deux environnements ;
- la Preview correspond exactement au SHA testé ;
- les fonctionnalités existantes du périmètre n'ont pas régressé ;
- les limites restantes sont déclarées ;
- aucun déploiement production n'a été effectué sans autorisation.
