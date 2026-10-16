# ADR-022 — Fin de traitement d'un média notifiée par les QueueEvents BullMQ

## Statut
Proposé

## Contexte
Après l'upload, l'app attend que le worker ait traité le média (`ready` ou `failed`) avant de créer le contenu (ADR-008). En P0, elle interroge `GET /v1/media/{id}` en boucle. Avec les reels (P1), le traitement d'une vidéo prend jusqu'à plusieurs minutes : le polling devient coûteux et lent à réagir.

Contraintes :
- le worker n'a pas de logique métier et ne connaît ni le WebSocket ni ses destinataires (ADR-008) ;
- Redis ne sert qu'à la file de jobs, pas à un pub/sub applicatif (D8) ;
- le WebSocket notifie mais ne fait pas foi (ADR-021) ;
- un job a 3 tentatives (ADR-008) : un échec intermédiaire n'est pas un échec définitif.

Décision source : D21.

## Décision
- **Abonnement de l'API aux `QueueEvents` BullMQ** des files de traitement média (`media` pour les images, `media-video` pour les vidéos, ADR-024), événements `completed` et `failed`, ouvert au démarrage de l'API et fermé à son arrêt.
- **Emplacement** : adapter d'infrastructure du module `media` (`infrastructure/queue-events`), assemblé dans `main.ts`. Aucune logique ajoutée au domaine ni au worker ; aucune nouvelle brique d'infrastructure.
- **`completed`** : l'adapter lit la valeur de retour `{ mediaId, ownerId }` (schéma de `packages/jobs`, ADR-015), relit le média en base, et publie `media.ready { mediaId, variants }` au seul propriétaire, par `RealtimePublisher` (ADR-021). Les variantes sont converties en URL comme dans `GET /v1/media/{id}`.
- **`failed`** : pas de valeur de retour en cas d'échec. L'adapter relit le média par l'identifiant du payload du job et ne publie `media.failed { mediaId, reason }` (`reason` = `failure_reason` enregistré) **que si le média est `failed` en base** : un échec intermédiaire suivi d'une nouvelle tentative ne publie rien.
- **Source de vérité** : le statut en base. Si la relecture ne trouve pas le statut attendu (`ready` pour `completed`), rien n'est publié.
- **Destinataire non connecté** : l'événement est perdu. Pas de file d'attente ni de stockage des événements.
- **Côté app** : le gestionnaire d'upload (`Core/Posts/PublishQueue` et ses équivalents pour les stories, les reels et les messages) attend `media.ready` ou `media.failed`, transmis par `RealtimeClient`. Il rattrape l'état par `GET /v1/media/{id}` pour chaque média encore en attente :
  - au retour au premier plan et après chaque reconnexion du WebSocket ;
  - si aucun événement n'arrive dans les 20 secondes pour une image ou 120 secondes pour une vidéo, puis toutes les 10 secondes.
- `GET /v1/media/{id}` reste inchangé dans le contrat : il devient le repli.
- **Tests** : adapter testé avec des événements simulés (`completed` publie au propriétaire ; `failed` intermédiaire ne publie rien ; `failed` définitif publie le motif ; statut incohérent en base ne publie rien) ; côté iOS, attente terminée par l'événement, par le repli après le délai, et au retour au premier plan.

## Alternatives
- Polling seul : rien à ajouter, mais requêtes répétées et réaction lente pendant le traitement d'une vidéo. Non retenu (D21).
- Pub/sub Redis dédié, alimenté par le worker : découplé de BullMQ, mais nouvel usage de Redis et worker obligé de connaître les destinataires. Écarté (D8, D21).
- Le worker appelle l'API (webhook interne) à la fin du traitement : explicite, mais nouvel endpoint interne à sécuriser et worker qui connaît l'API. Non retenu.

## Conséquences
### Positives
- Fin de traitement affichée dès qu'elle a lieu, sans polling.
- Aucune brique supplémentaire : le mécanisme s'appuie sur la file de jobs existante.
- Le worker reste sans logique métier.

### Négatives
- Un événement émis pendant une coupure du WebSocket est perdu ; le repli REST reste obligatoire.
- La valeur de retour des jobs média devient un contrat entre le worker et l'API (`packages/jobs`).
- L'API maintient une connexion Redis de plus pour les `QueueEvents`.

## Liens
- ADR-008 (pipeline média, tentatives)
- ADR-015 (valeur de retour des jobs dans `packages/jobs`)
- ADR-021 (WebSocket, `RealtimePublisher`)
- ADR-024 (file `media-video`)
