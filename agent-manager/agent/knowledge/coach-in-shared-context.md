# Référentiel partagé Coach In — invariants

Ce document est un aide-mémoire versionné commun à l'équipe Manager. Il ne remplace ni le code, ni AGENTS.md, ni les migrations, ni les décisions plus récentes explicitement validées. Le Manager doit vérifier les sources actuelles avant toute modification sensible.

## Produit et rôles
- Coach, joueur et administrateur sont des rôles distincts.
- Un joueur peut être lié à plusieurs coachs.
- Un joueur ne consulte que les coachs auxquels son compte est réellement lié.
- Une demande de réservation n'est pas une réservation confirmée : le coach accepte ou refuse.
- Cours collectifs et cours particuliers restent distincts.
- Pas de paiement ni d'intégration ADOC sans décision explicite.

## Cloisonnement multi-coachs
- Chaque coach conserve son planning, ses disponibilités, cours collectifs, réservations, bibliothèque et réglages.
- Les notes privées, suivis pédagogiques, séances, bilans, défis et réussites sont isolés par coach auteur.
- Un filtre frontend ne constitue jamais une protection d'accès : les permissions doivent être garanties côté backend/RLS.
- Les tests de droits doivent considérer Coach A, Coach B, un joueur lié aux deux et un joueur non lié.

## Calendrier et réservation
- Les règles Zone B, dimanches, jours fériés, exception du 8 mai, saison et fenêtres horaires ne doivent pas être approximées.
- Les créneaux de réservation sont en heure pleine ou demi-heure uniquement.
- Les créneaux bloqués et les cours collectifs doivent être traités comme indisponibilités selon les règles validées du planning.
- Vérifier la source de vérité actuelle avant de changer une règle de calendrier.

## Architecture et environnements
- Application principale : HTML/CSS/JavaScript natif en modules ES.
- Backend : Supabase PostgreSQL, Auth, RLS, Storage et Edge Functions.
- Hébergement : Vercel.
- Préproduction et production sont séparées. Vérifier les identifiants et la branche avant toute action.
- Aucun agent ne fusionne, ne promeut une Preview, ne déploie en production ni n'écrit dans Supabase Production.
- Toute action externe, irréversible ou modifiant des données requiert une approbation humaine explicite.

## Gouvernance de cette mémoire
- Le Manager lit ce référentiel au début de chaque mission technique.
- Il transmet uniquement les invariants pertinents aux agents délégués et aux reviewers.
- Toute modification de ce document doit être justifiée par une décision utilisateur validée ou une source de code/documentation vérifiée.
- Ne pas enregistrer ici de secrets, identifiants personnels, données de joueurs ou hypothèses présentées comme décisions.
- Ce référentiel est une mémoire documentaire contrôlée, pas une mémoire automatique des conversations ni un historique des performances.
