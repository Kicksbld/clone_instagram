# ADR-031 — Activité temps réel : préserver l'ordre des mises à jour de la pastille

## Statut
Proposé

## Contexte
T19 (#30) applique ADR-021 et ADR-026. Plusieurs notifications peuvent être validées simultanément. Le dispatcher relit alors le nombre de groupes visibles, avec les mêmes règles que REST. Deux lectures concurrentes peuvent se terminer dans l'ordre inverse et annoncer un ancien nombre après le nouveau. Dans l'app, une réponse REST commencée avant un événement, une lecture de l'Activité ou une déconnexion peut aussi arriver après.

## Décision
- Sérialiser les lectures et publications par destinataire dans le dispatcher, après validation des transactions. Deux destinataires restent indépendants. Libérer la file d'un destinataire lorsqu'elle est vide.
- Dans `Core/Activity`, associer chaque rattrapage REST à la révision courante de la pastille. Ignorer sa réponse si un événement, une lecture de l'Activité ou une déconnexion a changé cette révision ; ignorer également les tâches annulées.
- Garder le contrat `activity.created { unreadCount }` d'ADR-021 : aucune donnée supplémentaire et aucune écriture par WebSocket.

## Alternatives
- Lancer toutes les lectures en parallèle : moins d'attente entre publications, mais une réponse retardée peut faire régresser la pastille.
- Ajouter un numéro de séquence aux événements : changerait le contrat défini pour T19 ; la sérialisation et la révision locale permettent de conserver ce contrat.

## Conséquences
### Positives
- Une notification retardée dans le dispatcher ne dépasse pas celle qui la suit.
- Une réponse REST en vol ne rétablit pas une pastille effacée ou remplacée par un événement.
- Le calcul de visibilité reste celui du lecteur REST ; les échecs restent journalisés et non propagés.

### Négatives
- Une lecture lente retarde les publications suivantes du même destinataire.
- Comme le broker d'ADR-021, cette file reste locale à une seule instance d'API.

## Liens
- ADR-021 (WebSocket, notification et rattrapage REST)
- ADR-026 (notifications après transaction, groupes visibles)
- ADR-019 (contrat compatible)
- [T19 — #30](https://github.com/Kicksbld/clone_instagram/issues/30)
