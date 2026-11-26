# Mémoire persistante du projet Coach In

> Source de vérité documentaire du Manager. Ce fichier est versionné dans le dépôt et doit être consulté au début de chaque mission non triviale.

## Règles de tenue
- Ne conserver que les décisions validées, faits vérifiés, contraintes durables et risques encore ouverts.
- Pour chaque entrée, indiquer date, statut (proposé / validé / remplacé), source ou preuve, et périmètre concerné.
- Ne jamais enregistrer de secret, jeton, mot de passe, donnée personnelle de joueur, contenu privé de conversation ou donnée de production.
- Ne pas transformer une hypothèse, un avis d'agent ou un échec non reproduit en vérité projet.
- Préserver l'historique : remplacer une décision en ajoutant une nouvelle entrée qui référence l'ancienne, pas en effaçant silencieusement.
- Après une mission, proposer une mise à jour uniquement si elle apporte un apprentissage réutilisable et vérifié.

## Invariants métier
Voir `coach-in-shared-context.md`. Ce document reste la référence des règles métier et de sécurité actuellement connues.

## Décisions d'architecture
| Date | Décision | Statut | Preuve / référence |
|---|---|---|---|
| 2026-11-26 | Mémoire métier documentaire versionnée séparée de l'historique des missions | Validé comme principe | PR #40 |
| 2026-11-26 | Ne pas stocker la mémoire du Manager dans Supabase Production de Coach In | Validé comme contrainte | Consignes du responsable du projet |
| 2026-11-26 | Les modifications sensibles et la production restent soumises à contrôle humain explicite | Validé | Règles de sécurité du projet |

## État connu
- Les fichiers versionnés constituent la mémoire durable inter-version du projet.
- La mémoire dynamique de mission et les métriques doivent être écrites dans l'espace persistant du Manager quand il est disponible, sans présumer qu'un sandbox temporaire est durable.
- Si l'espace persistant n'est pas monté ou si l'écriture échoue, signaler le blocage et ne pas prétendre avoir enregistré la mémoire.

## Questions ouvertes
- Confirmer le mécanisme de stockage durable runtime propre au Manager (hors base Coach In), avec isolation par utilisateur/projet, contrôle d'accès, sauvegarde et rétention.
- Valider si les métriques agrégées peuvent être conservées et pendant combien de temps.
