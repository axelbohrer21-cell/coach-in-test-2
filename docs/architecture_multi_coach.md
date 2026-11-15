# Coach In — architecture multi-coachs avec suivis séparés

Statut : décision fonctionnelle retenue le 16 novembre 2026. Cette règle remplace la décision antérieure de suivi pédagogique entièrement partagé.

## Décision

Un joueur possède un compte et une fiche d'identité uniques. Plusieurs coachs peuvent être autorisés à accéder à cette fiche après invitation et acceptation. Le partage de la fiche n'ouvre jamais le suivi pédagogique privé de l'autre coach.

## Données communes au joueur

- Identité et coordonnées du joueur.
- Classement FFT, catégorie d'âge et profil loisir / compétition.
- Liste des coachs auxquels le joueur est effectivement rattaché.

## Données propres à chaque coach

Chaque coach voit et modifie uniquement ses propres :
- séances individuelles et notes privées ;
- bilans, notes par secteur et critères détaillés ;
- défis actifs et terminés ;
- réussites débloquées ;
- demandes et réservations qui lui sont adressées ;
- planning, indisponibilités, cours collectifs et séries annuelles ;
- bibliothèque personnelle et catalogue de critères ;
- notifications, préférences et paramètres.

Les séances et évaluations conservent leur auteur (created_by). Les défis et réussites conservent coach_id. Les notes privées restent dans training_sessions.coach_private_notes et ne sont jamais exposées dans les vues joueur.

## Vue du joueur

Le joueur peut consulter ses propres séances, bilans, défis et réussites provenant de chacun de ses coachs. Chaque séance et bilan affiche le nom du coach auteur. Les défis et réussites portent également le nom du coach qui les a créés. Le joueur ne peut ni consulter les notes privées ni modifier les données de suivi.

## Parcours de partage

1. Le coach A ouvre la fiche du joueur et choisit « Partager ».
2. Il saisit l'adresse e-mail d'un compte coach existant.
3. Une invitation est créée avec le statut pending ; aucun accès n'est accordé à ce stade.
4. Le coach B accepte ou refuse l'invitation depuis son espace.
5. Après acceptation, le coach B voit la fiche d'identité du joueur et peut créer son propre suivi.
6. Le coach initiateur peut révoquer le rattachement. La révocation retire l'accès futur sans supprimer les séances, bilans, défis ou réussites historiques du joueur.

Le système empêche les invitations vers un compte joueur, un compte administrateur, le compte du coach lui-même ou un compte inexistant. L'identité du destinataire est vérifiée côté serveur.

## Réservation multi-coachs

Le joueur choisit explicitement le coach lorsqu'il a plusieurs coachs. La demande, les conflits horaires, les indisponibilités, les cours collectifs et les séances existantes sont vérifiés uniquement dans le planning du coach choisi.

## Règles de sécurité en base

- coach_players contient les rattachements actifs.
- Une invitation en attente ne donne aucun accès.
- Les politiques RLS des séances et bilans filtrent sur created_by = auth.uid() et sur un lien actif au joueur.
- Les critères d'évaluation héritent des droits du bilan parent.
- Les politiques des défis et réussites filtrent sur coach_id = auth.uid().
- Les index garantissent un défi actif par joueur et par coach, et une réussite par critère, joueur et coach.
- Les vues joueur exposent uniquement les colonnes publiables et filtrent sur auth.uid().
- Les opérations de partage et de réservation sont validées côté serveur.
- Les rôles ne peuvent pas être attribués depuis l'interface coach.

## Scénarios de recette obligatoires

1. Coach A et Coach B sont associés au même joueur.
2. Un bilan créé par A est visible par A et le joueur, mais pas par B.
3. Une séance créée par B est visible par B et le joueur, mais pas par A.
4. Une note privée de A n'est visible que par A.
5. A et B peuvent avoir chacun un défi actif et des réussites distinctes pour ce joueur.
6. Le joueur voit les deux historiques avec le nom du coach auteur.
7. Un coach C non associé ne peut consulter aucune donnée du joueur.
8. Une invitation en attente ou refusée ne donne aucun accès à la fiche.
9. Après révocation, le coach révoqué perd l'accès ; les données historiques restent présentes pour le joueur et les coachs encore associés.
10. Le joueur choisit le coach exact pour une demande de réservation ; seul le planning de ce coach est utilisé.

## Migration

La migration supabase/006_separate_coach_followups.sql ajoute les notes privées, remplace les anciennes politiques RLS de partage global, adapte les index d'unicité et enrichit les vues joueur avec l'identité du coach auteur. Elle a été appliquée au projet Supabase de test le 16 novembre 2026. La recette réelle à trois comptes et le déploiement restent à effectuer.