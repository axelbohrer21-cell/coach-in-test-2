# Analyse vidéo Coach In — repères et calibration

- La caméra intégrée privilégie la caméra arrière et demande une définition cible de 1920 × 1080, selon les capacités du navigateur.
- Les cadrages suggérés sont des aides au placement ; le coach garde le choix de l’angle.
- MediaPipe Pose Landmarker Lite détecte jusqu’à 33 repères corporels sur huit instants échantillonnés. Le squelette annoté est une visualisation de la détection, pas une mesure clinique.
- Les angles articulaires calculés sont des angles 2D dans l’image. Ils ne compensent pas la perspective ni la rotation hors du plan caméra.
- La calibration manuelle du court utilise les quatre intersections des lignes de fond et des couloirs de double, dans l’ordre indiqué à l’écran. L’homographie suppose une caméra fixe et une surface de jeu plane.
- La distance entre les repères de pointe des pieds est une estimation au sol. Elle peut être erronée si les chaussures sont masquées, si les quatre points sont mal sélectionnés ou si la caméra bouge après calibration.
- Les distances calibrées sont présentées comme estimations, jamais comme mesures exactes. Les cours collectifs ne sont pas concernés par cette évolution.
