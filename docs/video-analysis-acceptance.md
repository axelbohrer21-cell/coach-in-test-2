# Coach In — cahier de validation de l’analyse vidéo

## Décisions non négociables
- L’outil d’analyse et de modification est réservé aux coachs.
- Le joueur peut consulter uniquement les vidéos et analyses explicitement partagées par son coach ; il ne peut pas annoter ni modifier.
- Les vidéos originales, images extraites, coordonnées et résultats restent dans l’espace privé Coach In.
- Aucun fichier vidéo, aucune image ni frame ne doit être transmis à OpenAI ou à un autre fournisseur d’IA.
- Le traitement de pose est local dans le navigateur avec MediaPipe.
- Les accès restent limités au coach propriétaire et au joueur associé selon les règles de partage.

## Parcours coach attendu
1. Choisir le joueur, le titre, la thématique et le critère observé.
2. Filmer depuis le téléphone ou importer MP4, MOV ou WEBM.
3. Vérifier le fichier sélectionné, sa taille et sa durée avant de lancer.
4. Conserver la vidéo dans le stockage privé avant le calcul lourd pour permettre une reprise après interruption.
5. Calculer les repères localement, afficher la progression et les éventuelles limites de détection.
6. Revoir les images et les mesures, puis ajouter/valider les observations du coach.
7. Enregistrer et partager explicitement le résultat avec le joueur.
8. Conserver l’historique pour le suivi longitudinal.

## Paramètres et outils pédagogiques demandés
- Ralenti vidéo.
- Navigation image par image.
- Dessin directement sur la vidéo : flèches et trajectoires, cercles/zones, lignes de déplacement et tracé libre.
- Commentaires du coach rattachés à un horodatage.
- Comparaison de deux vidéos du même joueur.
- Galerie d’images annotées et horodatées.
- Repères corporels : articulations, angles genoux/coudes/bras-tronc, équilibre et placement des appuis lorsque la visibilité le permet.
- Calibration du court pour les estimations métriques au sol lorsque la caméra est fixe et les repères sont correctement placés.
- Synthèse : phases, points positifs, priorité de progression, correction proposée, exercice et critère de réussite.
- Les observations automatiques doivent être séparées des commentaires validés par le coach.

## Thématiques du catalogue à respecter
Le choix de thème et de critère doit réutiliser le catalogue Coach In, sans créer de critères arbitraires :
- Coup droit.
- Revers (une main / deux mains et variations).
- Service.
- Retour sur première balle et retour sur deuxième balle.
- Volée de coup droit et volée de revers.
- Jeu de jambes et déplacements.
- Physique.
- Tactique.
- Mental.

## Limites scientifiques à afficher tant qu’elles ne sont pas levées
- Les angles calculés sur une image 2D dépendent de la perspective, de l’orientation et des occultations.
- MediaPipe Pose seul ne mesure pas de manière fiable la balle, la raquette, les effets, la vitesse de balle, la puissance, ni le point de contact raquette-balle.
- Une mesure géométrique ne doit jamais être présentée comme un diagnostic technique certain.
- Une correction ou un exercice ne doit pas être attribué automatiquement à un joueur si le signal ne permet pas de le justifier.
- Le coach garde la validation pédagogique finale.

## État du code audité le 28/11/2026
- [x] Analyse de pose MediaPipe exécutée localement.
- [x] Jusqu’à huit images échantillonnées, horodatées et annotées par squelette.
- [x] Mesures 2D de quelques angles articulaires et visibilité.
- [x] Calibration manuelle du court pour une estimation de l’écart des appuis.
- [x] Vidéo originale stockée dans un bucket privé ; partage joueur explicite.
- [x] Reprise du calcul à partir d’une vidéo déjà stockée après interruption.
- [x] Réduction de la résolution d’inférence pour limiter la pression mémoire mobile.
- [ ] Ralenti et navigation image par image.
- [ ] Outils complets de dessin/annotation persistante sur la vidéo.
- [ ] Commentaires du coach associés à des timestamps.
- [ ] Comparaison synchronisée de deux vidéos du même joueur.
- [ ] Interprétation tennis spécifique fiable, fondée sur des signaux réellement mesurés.
- [ ] Exercices correctifs issus d’une bibliothèque validée et reliés au critère observé.
- [ ] Test réel sur iPhone Safari avec plusieurs formats et tailles de vidéos.
- [ ] Test de bout en bout : import → stockage privé → calcul local → enregistrement → partage → consultation joueur.

## Tests de recette
- Sélectionner un fichier ne doit ni soumettre le formulaire ni naviguer/actualiser la page.
- MP4, MOV et WEBM valides ; formats non acceptés et fichiers de plus de 250 Mo refusés proprement.
- Une vidéo interrompue après stockage doit rester visible et pouvoir être relancée sans réimport.
- Une erreur de détection doit préserver la vidéo et expliquer le problème.
- Une analyse d’un joueur ne doit jamais être visible à un joueur non associé ou non autorisé.
- Le compte joueur ne doit jamais pouvoir modifier les annotations ou résultats du coach.
- Aucune requête vidéo/image ne doit partir vers OpenAI ou un autre service d’IA.
