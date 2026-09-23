# 04 — Contrat d'API

Ce document liste les endpoints et conventions. La référence exécutable est `packages/contract/openapi.yaml`, rédigée à partir de cette liste au démarrage de chaque phase.

## 1. Conventions

| Sujet | Règle |
|---|---|
| Base | `/v1`, JSON, UTF-8 |
| Authentification | `Authorization: Bearer <JWT Supabase>` sur tous les endpoints sauf `/health` |
| Identifiants | UUID v7 |
| Dates | ISO 8601 UTC |
| Pagination | `?cursor=<opaque>&limit=<1..50>` (défaut 20) → réponse `{ items: [...], nextCursor: string \| null }` |
| Erreurs | Format *Problem Details* (RFC 9457) : `{ type, title, status, detail, code }`, avec un `code` stable (ex. `username_taken`, `media_not_ready`) |
| Validation | Toute entrée est validée contre le schéma ; les champs inconnus sont rejetés |
| Idempotence | Envoi de message : `clientId` ; like, save, follow : `PUT`/`DELETE` naturellement idempotents |
| Visibilité | Un contenu invisible pour l'appelant renvoie **404** (pas 403), pour ne pas révéler son existence |
| Rate limiting | Réponse `429` avec en-tête `Retry-After` |

Codes HTTP : `200`, `201`, `204`, `400` (validation), `401` (non authentifié), `403` (compte suspendu, rôle manquant, abonnement Plus requis : code `plus_required`), `404`, `409` (conflit : username pris, transition invalide), `422` (règle métier), `429`.

## 2. Endpoints

La colonne P indique la priorité de la feature (voir 01).

### 2.1 Compte et profil

| Méthode | Route | P | Description |
|---|---|---|---|
| GET | `/health` | P0 | État de l'API (sans authentification) |
| GET | `/me` | P0 | Mon profil, mes paramètres et mon plan (`plan: free \| plus`, `plusExpiresAt`) (`404 profile_not_found` si onboarding non fait) |
| GET | `/usernames/{username}/availability` | P0 | Disponibilité d'un username, vérifiée en direct pendant l'onboarding |
| POST | `/me/onboarding` | P0 | Création du profil (username, nom) |
| POST | `/me/subscription/refresh` | P0 | Relit l'abonnement chez RevenueCat et renvoie `{ plan, expiresAt }` (au plus un appel à RevenueCat toutes les 5 minutes par utilisateur) |
| PATCH | `/me` | P0 | Modifier nom, bio, avatar (`avatarMediaId`), username |
| PATCH | `/me/settings` | P0 | Compte privé / public |
| DELETE | `/me` | P0 | Supprimer mon compte |
| GET | `/users/search?q=` | P0 | Recherche par username / nom |
| GET | `/users/{username}` | P0 | Profil public + relation (je suis, il me suit, demande en attente, bloqué) |
| GET | `/users/{id}/posts` | P0 | Grille des posts |
| GET | `/users/{id}/reels` | P1 | Grille des reels |
| GET | `/users/{id}/followers` · `/following` | P0 | Listes paginées |
| GET | `/users/{id}/reposts` | P2 | Republications |
| GET | `/users/{id}/tagged` | P2 | Posts où l'utilisateur est identifié |

### 2.2 Social

| Méthode | Route | P | Description |
|---|---|---|---|
| PUT | `/users/{id}/follow` | P0 | Suivre (ou créer une demande si compte privé, P1) |
| DELETE | `/users/{id}/follow` | P0 | Ne plus suivre / annuler une demande |
| DELETE | `/users/{id}/follower` | P1 | Retirer un abonné |
| GET | `/me/follow-requests` | P1 | Demandes reçues |
| POST | `/follow-requests/{requesterId}/accept` · `/decline` | P1 | Traiter une demande |
| PUT · DELETE | `/users/{id}/block` | P0 | Bloquer / débloquer |
| GET | `/me/blocks` | P0 | Comptes bloqués |
| GET | `/me/close-friends` | P1 | Liste des amis proches |
| PUT · DELETE | `/me/close-friends/{userId}` | P1 | Ajouter / retirer |

### 2.3 Médias

| Méthode | Route | P | Description |
|---|---|---|---|
| POST | `/media/uploads` | P0 | Intention d'upload `{ kind, purpose, mimeType, sizeBytes }` → `{ mediaId, uploadUrl, expiresAt }` |
| POST | `/media/{id}/complete` | P0 | Signale la fin de l'upload, déclenche le traitement |
| GET | `/media/{id}` | P0 | Statut et variantes. À partir de la P1, sert de **repli** aux événements `media.ready` / `media.failed` (WebSocket indisponible, retour au premier plan, reconnexion) |

### 2.4 Posts, reels et engagement

| Méthode | Route | P | Description |
|---|---|---|---|
| POST | `/posts` | P0 | Créer `{ kind, caption, mediaIds[], collaboratorIds[] (P2) }` |
| GET | `/posts/{id}` | P0 | Détail |
| PATCH | `/posts/{id}` | P1 | Modifier la légende |
| DELETE | `/posts/{id}` | P0 | Supprimer (auteur) |
| PUT · DELETE | `/posts/{id}/like` | P0 | Liker / retirer |
| GET | `/posts/{id}/likes` | P1 | Liste des personnes ayant liké |
| GET | `/posts/{id}/comments` | P0 | Commentaires de premier niveau |
| POST | `/posts/{id}/comments` | P0 | Commenter `{ body, parentId? }` |
| GET | `/comments/{id}/replies` | P0 | Réponses |
| DELETE | `/comments/{id}` | P0 | Supprimer (auteur du commentaire ou du post) |
| PUT · DELETE | `/comments/{id}/like` | P1 | Liker un commentaire |
| PUT · DELETE | `/posts/{id}/save` | P1 | Enregistrer |
| GET | `/me/saved` | P1 | Mes enregistrements |
| PUT · DELETE | `/posts/{id}/repost` | P2 | Republier |
| POST | `/posts/{id}/collaboration/accept` · `/decline` | P2 | Répondre à une invitation |

### 2.5 Fils

| Méthode | Route | P | Description |
|---|---|---|---|
| GET | `/feed` | P0 | Accueil chronologique |
| GET | `/reels/feed` | P1 | Reels publics récents |
| GET | `/explore` | P2 | Grille des posts publics récents |

### 2.6 Stories, stories à la une, notes, instants

| Méthode | Route | P | Description |
|---|---|---|---|
| POST | `/stories` | P1 | Publier `{ mediaId, audience }` |
| GET | `/stories/tray` | P1 | Bandeau : auteurs ayant des stories actives visibles, statut vu / non vu |
| GET | `/users/{id}/stories` | P1 | Stories actives d'un auteur |
| POST | `/stories/{id}/view` | P1 | Enregistrer une vue ; `{ anonymous: true }` réservé aux abonnés Plus (aucune vue enregistrée) |
| GET | `/stories/{id}/viewers` | P1 | Liste des vues (auteur seulement) ; filtre `?q=` réservé aux abonnés Plus |
| DELETE | `/stories/{id}` | P1 | Supprimer |
| GET | `/me/stories/archive` | P1 | Mes stories archivées |
| GET · POST | `/users/{id}/highlights` · `/highlights` | P2 | Lister / créer |
| PATCH · DELETE | `/highlights/{id}` | P2 | Modifier (titre, couverture, stories) / supprimer |
| GET | `/notes` | P2 | Notes visibles (haut de la messagerie) |
| PUT · DELETE | `/me/note` | P2 | Publier (remplace) / supprimer ma note |
| POST | `/instants` | P3 | Envoyer `{ mediaId, audience }` |
| GET | `/instants/inbox` | P3 | Instants reçus non ouverts |
| POST | `/instants/{id}/open` | P3 | Ouvrir une fois → URL signée courte |
| PUT | `/instants/{id}/reaction` | P3 | Réagir par emoji |

### 2.7 Messagerie

| Méthode | Route | P | Description |
|---|---|---|---|
| GET | `/conversations` | P1 | Liste, triée par dernier message, avec non-lus |
| POST | `/conversations` | P1 | Obtenir ou créer la conversation avec `{ userId }` |
| GET | `/conversations/{id}/messages` | P1 | Historique (`cursor` vers le passé, `after` pour le rattrapage) |
| POST | `/conversations/{id}/messages` | P1 | Envoyer `{ clientId, kind, body?, mediaId?, sharedPostId?, storyId?, noteId?, instantId? }` |
| POST | `/conversations/{id}/read` | P1 | Marquer comme lu jusqu'à `{ messageId }` |
| GET | `/media/{id}/signed-url` | P1 | URL signée courte d'un média privé (membre de la conversation uniquement) |
| GET | `/conversations/requests` | P2 | Demandes de message |
| POST | `/conversations/{id}/accept` | P2 | Accepter une demande |

### 2.8 Activité et signalements

| Méthode | Route | P | Description |
|---|---|---|---|
| GET | `/activity` | P1 | Notifications, regroupées |
| POST | `/activity/read` | P1 | Tout marquer comme lu |
| POST | `/reports` | P0 | Signaler `{ targetType, targetId, reason, details? }` |
| PUT · DELETE | `/me/devices/{apnsToken}` | P2 | Enregistrer / retirer un appareil pour les push |

### 2.9 Administration (rôle `admin` requis)

| Méthode | Route | P | Description |
|---|---|---|---|
| GET | `/admin/reports` | P0 | File des signalements (filtres : statut, motif, type) |
| GET | `/admin/reports/{id}` | P0 | Détail avec aperçu du contenu |
| POST | `/admin/reports/{id}/resolve` | P0 | `{ action: remove_content \| dismiss, note? }` |
| GET | `/admin/users` | P0 | Recherche paginée |
| GET | `/admin/users/{id}` | P0 | Fiche (statut, compteurs, signalements reçus, abonnement Plus) |
| GET | `/admin/analytics/overview` | P0 | Entonnoir onboarding → paywall → achat, inscriptions, abonnés Plus actifs (`?from=&to=`) |
| GET | `/admin/analytics/experiments` | P0 | Expériences A/B : variantes, expositions, conversions |
| POST | `/admin/users/{id}/suspend` · `/ban` · `/reactivate` | P0 | Changer le statut `{ reason }` |
| DELETE | `/admin/users/{id}` | P0 | Supprimer le compte |
| GET | `/admin/content` | P1 | Liste de contenus (posts, reels, stories, commentaires) |
| DELETE | `/admin/posts/{id}` · `/admin/comments/{id}` · `/admin/stories/{id}` | P1 | Suppression directe |
| GET | `/admin/audit-log` | P1 | Journal d'audit |
| GET | `/admin/stats` | P1 | Compteurs globaux |
| GET | `/admin/media/failed` | P2 | Médias en échec |
| POST | `/admin/media/{id}/retry` | P2 | Relancer un traitement |

Toute action admin qui modifie des données écrit une ligne dans `admin_audit_log`.

## 3. Temps réel (WebSocket)

- Point d'entrée : `GET /v1/ws` (upgrade WebSocket).
- Premier message obligatoire : `{ "type": "auth", "token": "<JWT>" }`. Sans authentification valide sous 5 secondes, le serveur ferme la connexion. À l'expiration du JWT, l'app renvoie un message `auth` avec le nouveau jeton.
- Ping / pong toutes les 30 secondes ; l'app se reconnecte avec un délai croissant, puis rattrape les données par REST.

Événements serveur → client (schémas définis dans `openapi.yaml`) :

| Événement | P | Contenu |
|---|---|---|
| `message.created` | P1 | Message complet |
| `conversation.read` | P1 | `{ conversationId, userId, lastReadMessageId }` |
| `activity.created` | P1 | Pastille de l'onglet Activité (contenu à recharger par REST) |
| `media.ready` | P1 | `{ mediaId, variants }` — envoyé au seul propriétaire du média |
| `media.failed` | P1 | `{ mediaId, reason }` — envoyé au seul propriétaire du média |
| `instant.received` | P3 | `{ instantId, senderId }` |

## 4. Limites de débit (valeurs initiales)

| Portée | Limite |
|---|---|
| Défaut, par utilisateur | 120 requêtes / minute |
| `POST /media/uploads` | 30 / heure |
| `POST /posts`, `POST /stories` | 20 / heure |
| `POST …/comments` | 30 / minute |
| `POST …/messages` | 60 / minute |
| `POST /reports` | 10 / heure |

Le stockage des compteurs est en mémoire (une seule instance d'API, en dev comme en démo).
