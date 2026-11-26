# Évaluation de la qualité des agents

Cette grille définit les mesures à collecter ; elle ne prétend pas qu'un historique de métriques runtime existe déjà.

## Indicateurs par mission
- Pertinence du rôle : rôle adapté au domaine et au risque (oui/non, justification).
- Exactitude : constats soutenus par des preuves (0 à 5).
- Complétude : critères d'acceptation satisfaits (0 à 5).
- Qualité des tests : tests pertinents réellement exécutés (0 à 5).
- Autonomie utile : mission achevée sans reprise évitable (oui/non).
- Reprises : nombre de corrections/re-lancements nécessaires.
- Latence : durée mesurée si disponible.
- Quota/fournisseur : erreurs et basculements réellement observés, sans enregistrer de secret.

## Règles d'analyse
- Ne pas comparer des missions de complexité ou de domaine différents sans normalisation.
- Ne pas attribuer une note lorsque les preuves sont absentes ; utiliser « non mesuré ».
- Évaluer l'agent sur le livrable vérifié, pas sur son auto-évaluation.
- Le Manager doit distinguer les défauts de routage, de contexte, de modèle, d'outillage et de spécification.
- Toute modification du routage ou du modèle par rôle doit être appuyée par plusieurs missions comparables.

## Stockage et confidentialité
Les mesures détaillées doivent être conservées dans un stockage Manager dédié, avec contrôle d'accès, rétention et possibilité d'effacement. En attendant la mise en place et la validation technique de ce stockage, consigner les mesures utiles dans le journal de mission runtime uniquement si sa persistance est vérifiée. Ne pas stocker de données personnelles de joueurs ni de secrets.
