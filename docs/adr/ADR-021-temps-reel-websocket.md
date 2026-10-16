# ADR-021 — Temps réel : un WebSocket qui notifie, jamais source de vérité

## Statut
Proposé

## Contexte
À partir de la P1, plusieurs features ont besoin que le serveur prévienne l'app sans qu'elle interroge l'API en boucle : messages privés reçus, lecture d'une conversation par l'autre membre, nouvelle notification dans l'onglet Activité, fin du traitement d'un média.

Contraintes :
- Supabase Realtime est exclu : l'API est la seule porte d'entrée vers les données (ADR-004).
- Une seule instance d'API, en dev comme en démo (ADR-009) ; Redis est réservé à la file de jobs (ADR-008).
- Le contrat OpenAPI décrit aussi les événements temps réel (ADR-003), et l'app doit tolérer des champs ou des événements qu'elle ne connaît pas (ADR-019).
- Un jeton dans une URL finit dans les logs (ADR-005).
- L'iPhone perd le réseau, passe en arrière-plan, change de réseau : une connexion permanente n'est jamais garantie.

Décision source : D41 (D16 pour l'usage par la messagerie, ADR-023).

## Décision
- **Principe** : le WebSocket **notifie**, il n'est **jamais la source de vérité**. Toute donnée reçue en temps réel est aussi récupérable par REST. Un événement perdu (app fermée, connexion coupée) ne fait perdre aucune donnée : l'app rattrape par REST.
- **Sens unique** : le serveur envoie des événements ; le client n'envoie que le message `auth`. Toute écriture passe par REST (contrat, validation, idempotence).
- **Point d'entrée** : `GET /v1/ws` (upgrade WebSocket), avec `@fastify/websocket`.
- **Authentification par premier message**, jamais par un jeton dans l'URL :
  - premier message obligatoire `{ "type": "auth", "token": "<JWT>" }` ; sans authentification valide sous 5 secondes, le serveur ferme la connexion ;
  - même vérification que REST (JWT ES256 par JWKS, ADR-018), y compris le refus des comptes supprimés, suspendus ou bannis (ADR-005) ;
  - réponse `{ "type": "auth.ok" }` ; à l'expiration du JWT, l'app renvoie un message `auth` avec le nouveau jeton, sur la même connexion ; un jeton expiré non renouvelé ferme la connexion ;
  - codes de fermeture : `4401` (authentification absente, invalide ou expirée), `4403` (compte suspendu ou banni). L'app ne se reconnecte pas après `4403` et affiche l'écran « Compte suspendu ».
- **Format des événements** : enveloppe `{ "type": "<objet.action>", "data": { … } }`. Chaque événement a son schéma dans `openapi.yaml` (`components/schemas`, union discriminée par `type`). L'app ignore un `type` inconnu et les champs inconnus (ADR-019).
- **Événements** :

| Événement | P | Destinataire | `data` | ADR |
|---|---|---|---|---|
| `media.ready` | P1 | propriétaire du média | `{ mediaId, variants }` | ADR-022 |
| `media.failed` | P1 | propriétaire du média | `{ mediaId, reason }` | ADR-022 |
| `message.created` | P1 | les deux membres de la conversation | message complet, tel que renvoyé par REST | ADR-023 |
| `conversation.read` | P1 | l'autre membre | `{ conversationId, userId, lastReadMessageId }` | ADR-023 |
| `activity.created` | P1 | destinataire de la notification | `{ unreadCount }` (pastille ; contenu rechargé par REST) | ADR-026 |

- **Port transverse `RealtimePublisher`** (`shared/application`) : `publish(userIds, event)` et `disconnect(userId, code)`. Les use cases l'appellent **après** la validation de la transaction, jamais dedans : un événement ne doit pas annoncer une écriture annulée. Un échec de publication est journalisé, jamais propagé à la requête REST.
- **Adapter : broker en mémoire** (`shared/infrastructure/realtime`) : table `userId → connexions ouvertes` (un utilisateur peut avoir plusieurs appareils). Remplaçable plus tard par Redis pub/sub derrière le même port, si l'API passe à plusieurs instances (hors périmètre).
- **Sanction ou suppression d'un compte** : `ModerateUser` (suspension, bannissement) et la suppression du compte appellent `disconnect(userId, 4403 | 4401)` après leur transaction.
- **Maintien de la connexion** : ping du serveur toutes les 30 secondes ; une connexion sans pong au ping suivant est fermée.
- **Côté app (`Core/Realtime`)** :
  - `RealtimeClient` sur `URLSessionWebSocketTask`, sans dépendance supplémentaire ;
  - connexion ouverte quand l'utilisateur est connecté et l'app au premier plan ; fermée en arrière-plan et à la déconnexion ;
  - reconnexion avec délai croissant (1, 2, 4, 8, 16 puis 30 secondes au plus), remis à zéro après une authentification réussie ;
  - après chaque (re)connexion, les services concernés rattrapent leur état par REST (conversations ouvertes, pastille d'activité, médias en attente) ;
  - les événements sont transmis aux services de `Core` concernés, qui notifient les ViewModels ; aucune vue ne lit le WebSocket.
- **Tests** : adapter en mémoire du port dans les tests de use cases (événements publiés après la transaction, pas en cas d'échec) ; tests de route WebSocket (authentification absente sous 5 s, jeton invalide, compte suspendu, renouvellement du jeton) ; côté iOS, `RealtimeClient` testé avec un transport factice (reconnexion, rattrapage, événement inconnu ignoré).
- **À vérifier au début de la tranche qui pose le WebSocket** : passage du WebSocket par le proxy Railway et son délai d'inactivité (le ping de 30 s doit rester en dessous).

## Alternatives
- Supabase Realtime : aucun serveur temps réel à écrire, mais les clients liraient les données hors de l'API, contraire à ADR-004. Écarté (D5).
- Tout passer par le WebSocket, écritures comprises : un seul canal, mais ni contrat validé, ni idempotence simple, ni rattrapage. Écarté (D16).
- Polling REST seul : aucune connexion à maintenir, mais messages reçus en retard et requêtes inutiles. Non retenu.
- Jeton dans l'URL (`/v1/ws?token=…`) : plus simple, mais le jeton apparaît dans les logs du proxy et de l'API. Non retenu.
- Server-Sent Events : plus simple qu'un WebSocket côté serveur, mais `URLSession` ne les gère pas nativement et le cahier prévoit un WebSocket. Non retenu.
- Redis pub/sub dès maintenant : prêt pour plusieurs instances, mais une seule instance existe et Redis est réservé à la file de jobs (D8). Non retenu.

## Conséquences
### Positives
- Messages, lectures et notifications affichés immédiatement, sans polling.
- Aucune perte de donnée possible : REST reste la référence, le WebSocket peut tomber à tout moment.
- Un seul port pour tous les événements ; les use cases se testent sans connexion réelle.

### Négatives
- Un événement émis pendant une coupure est perdu ; chaque feature doit prévoir son rattrapage REST.
- Le broker en mémoire ne fonctionne qu'avec une seule instance d'API (limite assumée).
- Un redéploiement de l'API coupe toutes les connexions : les apps se reconnectent et rattrapent.
- Les schémas des événements vivent dans `openapi.yaml` sans opération associée : leur génération côté Swift est à vérifier à la première tranche.

## Liens
- ADR-003 (événements décrits dans le contrat)
- ADR-004 (pas de Supabase Realtime)
- ADR-005 (port transverse, refus des comptes suspendus)
- ADR-009 (une seule instance, WebSocket derrière le proxy Railway)
- ADR-010 (`Core/Realtime`)
- ADR-018 (vérification du JWT)
- ADR-019 (événements et champs inconnus ignorés)
- ADR-022, ADR-023, ADR-026 (événements)
