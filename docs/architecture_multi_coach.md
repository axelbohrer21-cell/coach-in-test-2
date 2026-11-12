# Coach In — architecture multi-coachs et dossiers joueurs partagés

Statut : décision fonctionnelle validée le 12 novembre 2026. Spécification de développement ; non déployée.

## Décision

Un joueur possède un compte et une fiche d'identité uniques. Plusieurs coachs peuvent être autorisés à accéder à cette même fiche. Une fois le partage accepté, le dossier de suivi est entièrement commun : tous les coachs autorisés voient et peuvent enrichir le même historique.

## Parcours de partage

1. Le coach A ouvre la fiche du joueur et choisit « Partager avec un coach ».
2. Il recherche le coach destinataire par adresse e-mail ou identifiant Coach In.
3. Une invitation est créée avec le statut `pending` ; aucun accès n'est accordé à ce stade.
4. Le coach B accepte ou refuse l'invitation depuis son espace.
5. Après acceptation, la relation joueur-coach B est active et le dossier commun devient accessible.
6. Le coach qui a initié le partage peut demander sa révocation. La révocation retire l'accès futur du coach B, sans supprimer les données historiques du joueur.

Le système doit empêcher les invitations vers un compte joueur, un compte administrateur, le compte du coach lui-même ou un compte inexistant. L'e-mail ne suffit pas à autoriser l'accès : l'identité du compte destinataire doit être vérifiée côté serveur.

## Données communes

Tous les coachs liés au joueur peuvent consulter et modifier :

- identité et informations sportives du joueur ;
- séances individuelles et historique ;
- évaluations, notes par secteur et critères détaillés ;
- défis actifs et terminés ;
- réussites et compétences débloquées ;
- statistiques et parcours de progression.

Le joueur consulte son dossier complet. Chaque enregistrement conserve son auteur (`created_by` ou `coach_id`) et ses dates de création/modification. L'interface affiche le nom du coach auteur sur les séances et les évaluations afin de garder une traçabilité claire.

## Données qui restent propres à chaque coach

Le partage du dossier joueur ne partage pas les espaces professionnels privés des coachs :

- calendrier et indisponibilités du coach ;
- cours collectifs et séries annuelles ;
- bibliothèque personnelle de séances ;
- catalogue personnel de critères si celui-ci n'est pas encore mutualisé ;
- paramètres, notifications et préférences du compte coach.

Une réservation privée est toujours associée au coach choisi par le joueur. Le joueur doit sélectionner explicitement le coach lorsqu'il en a plusieurs. Le moteur de disponibilité consulte uniquement le calendrier, les cours collectifs et les réservations de ce coach.

## Règles de sécurité à appliquer en base

- `coach_players` devient la liste des accès actifs : une ligne unique par couple `(coach_id, player_id)`.
- Une invitation distincte conserve l'émetteur, le destinataire, le joueur, le statut, les dates et la décision.
- Une invitation en attente ne donne aucun accès.
- Les politiques RLS autorisent un coach à lire/écrire les données de suivi uniquement si une relation active existe entre ce coach et le joueur.
- Le joueur ne peut modifier ni son identité sportive ni les données de suivi.
- Les coachs ne peuvent ni modifier les rôles ni consulter les autres comptes coach.
- Les actions de partage, d'acceptation et de révocation doivent être validées côté serveur ou par fonctions SQL `SECURITY DEFINER` strictement contrôlées.
- Les données historiques ne sont jamais supprimées lors d'une révocation.
- Chaque séance et évaluation garde l'identifiant du coach auteur ; cet identifiant ne doit pas servir à restreindre la lecture aux autres coachs autorisés.

## Réservation multi-coachs

La fonction de réservation ne doit plus sélectionner automatiquement le premier coach lié. Elle reçoit un `coach_id` explicite, vérifie que le joueur et le coach sont associés, puis contrôle les conflits uniquement sur les ressources de ce coach. L'interface de réservation demande le choix du coach si plusieurs associations actives existent.

## Scénarios de recette obligatoires

1. Coach A partage un joueur avec Coach B ; B accepte : les deux voient le même historique.
2. Coach B ajoute une séance : elle apparaît chez A et dans l'espace du joueur, avec B comme auteur.
3. Coach A ajoute une évaluation : elle apparaît chez B et dans l'espace du joueur, avec A comme auteur.
4. Coach C non associé tente de consulter le joueur : aucune donnée n'est accessible.
5. Invitation en attente : le destinataire ne voit pas la fiche.
6. Invitation refusée : aucun accès n'est créé.
7. Révocation : le coach retiré perd l'accès ; les séances et évaluations qu'il a créées restent dans l'historique commun et restent visibles aux coachs encore autorisés.
8. Un joueur lié à A et B choisit B pour réserver : seule la disponibilité de B est utilisée.
9. Les réservations, plannings et indisponibilités de A restent invisibles à B, sauf données relatives au dossier joueur explicitement communes.
10. Un joueur non associé ne peut ni lire ni modifier les données d'un autre joueur.

## Précaution de migration

Avant de rédiger et d'exécuter la migration SQL finale, vérifier le schéma réel de `profiles`, `coach_players`, `training_sessions`, `evaluations`, les vues joueur et toutes les politiques RLS actuellement installées. Les scripts existants ne contiennent pas la définition initiale complète de ces tables. Ne pas lancer une migration multi-coachs sur la base de production sans sauvegarde et tests sur une copie de la base.

## Première implémentation technique préparée

Le paquet de développement contient maintenant `supabase/004_shared_player_profiles.sql` et les premiers raccordements de l'interface :

- invitation par e-mail d'un coach déjà inscrit ;
- acceptation ou refus depuis le tableau de bord du coach invité ;
- activation de l'accès seulement après acceptation ;
- révocation côté base par le coach initiateur ;
- politiques RLS de lecture/écriture du dossier partagées selon le lien actif ;
- vues joueur limitées aux informations publiables ;
- réservation avec choix explicite du coach suivi.

Cette migration est un brouillon technique de préproduction : elle n'a pas été exécutée sur PostgreSQL/Supabase. Les noms exacts des politiques et vues installées sur le projet réel, les privilèges effectifs et le comportement RLS doivent être vérifiés sur un clone de la base. Les tests JavaScript locaux ne remplacent pas les tests RLS multi-comptes.

La révocation retire le lien d'accès mais conserve les séances, évaluations, défis et réussites dans la base. Une recette doit vérifier la visibilité des données historiques pour le joueur et les coachs qui restent associés.
