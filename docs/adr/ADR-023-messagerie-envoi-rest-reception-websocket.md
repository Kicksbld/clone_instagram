# ADR-023 — Messagerie : envoi par REST idempotent, réception par WebSocket, rattrapage par REST

## Statut
Proposé

## Contexte
La P1 ajoute les messages privés : conversations en tête-à-tête, texte et image, partage de post, réponse à une story, en temps réel. La P2 ajoute les demandes de message (messages venant de comptes que le destinataire ne suit pas) et la réponse à une note.

Contraintes :
- un message ne doit jamais être perdu ni envoyé en double, même si le réseau coupe pendant l'envoi et que l'app réessaie ;
- l'app doit retrouver les messages manqués après une reconnexion (exigence de fiabilité du projet) ;
- le blocage rend deux comptes mutuellement invisibles, messages compris (ADR-006) ;
- les images de messages sont privées : seuls les membres de la conversation peuvent les voir (bucket `media-private`, ADR-008) ;
- le WebSocket notifie mais ne fait pas foi (ADR-021).

Décisions sources : D16, D42.

## Décision
- **Module `messaging`**, tables :
  - `conversations` : `id`, `member_low_id`, `member_high_id` (les deux membres, le plus petit identifiant en premier), `created_at`, `last_message_at`. Contrainte unique `(member_low_id, member_high_id)` : **une seule conversation par paire**, garantie par la base. `CHECK (member_low_id < member_high_id)` : pas de conversation avec soi-même.
  - `conversation_members` : `conversation_id`, `user_id`, `last_read_message_id` (nullable), `status` (`active` | `request`, P2), `created_at`. Clé primaire `(conversation_id, user_id)`.
  - `messages` : `id`, `conversation_id`, `sender_id`, `client_id`, `kind`, `body`, `media_id`, `shared_post_id`, `story_id`, `note_id` (P2), `instant_id` (P3), `created_at` (`timestamptz(3)`), `deleted_at`. Contrainte unique `(sender_id, client_id)`. `CHECK` par `kind` sur les colonnes renseignées (pas de clé étrangère polymorphe, ADR-007).
  - Index `messages (conversation_id, created_at DESC, id DESC)` et `conversations (last_message_at DESC, id DESC)`.
- **Types de message** :

| `kind` | P | Champs | Règle |
|---|---|---|---|
| `text` | P1 | `body` (1 à 1 000 caractères) | — |
| `image` | P1 | `media_id`, `body` optionnel | média `image`, `purpose = message`, `ready`, rattaché au message (ADR-008) |
| `post_share` | P1 | `shared_post_id`, `body` optionnel | post ou reel visible de l'expéditeur au moment de l'envoi |
| `story_reply` | P1 | `story_id`, `body` | story active et visible de l'expéditeur (`canViewStory`), pas la sienne (ADR-025) |
| `note_reply` | P2 | `note_id`, `body` | note active visible de l'expéditeur (ADR-025) |
| `instant_reply` | P3 | `instant_id`, `body` | hors de cet ADR |

- **Endpoints** :

| Méthode | Chemin | P | Rôle |
|---|---|---|---|
| GET | `/v1/conversations` | P1 | Conversations actives, de la plus récente à la plus ancienne (`last_message_at`), avec l'autre membre, le dernier message et `unreadCount` ; pagination par curseur `(last_message_at, id)` |
| POST | `/v1/conversations` | P1 | `{ userId }` → obtenir ou créer la conversation avec ce compte (`200` si elle existe, `201` sinon) |
| GET | `/v1/conversations/{id}/messages` | P1 | Historique : `cursor` vers le passé (pages de 30, du plus récent au plus ancien) ; `after=<messageId>` pour le rattrapage (messages plus récents que celui-ci, du plus ancien au plus récent, pages de 100) |
| POST | `/v1/conversations/{id}/messages` | P1 | `{ clientId, kind, body?, mediaId?, sharedPostId?, storyId?, noteId? }` → message |
| POST | `/v1/conversations/{id}/read` | P1 | `{ messageId }` : marque comme lu jusqu'à ce message |
| GET | `/v1/media/{id}/signed-url` | P1 | URL signée d'une image de message, pour un membre de la conversation uniquement |
| GET | `/v1/conversations/requests` | P2 | Demandes de message reçues |
| POST | `/v1/conversations/{id}/accept` | P2 | Accepter une demande |

- **Envoi par REST, idempotent** :
  - l'app génère un `clientId` (UUID) par message, avant le premier essai, et le garde pour toutes les tentatives ;
  - un second envoi avec le même `clientId` du même expéditeur ne crée rien : l'API renvoie le message existant (`200` au lieu de `201`) et ne republie pas d'événement ;
  - dans la même transaction : insertion du message, mise à jour de `conversations.last_message_at`, rattachement du média pour une image ;
  - après la transaction : `message.created` publié aux deux membres (l'expéditeur peut avoir plusieurs appareils) par `RealtimePublisher` ;
  - limite : 60 messages / minute (ADR-005).
- **Réception par WebSocket, rattrapage par REST** : l'app ajoute les messages reçus par `message.created` ; à chaque reconnexion et au retour au premier plan, elle appelle `GET …/messages?after=<dernier message connu>` pour chaque conversation ouverte, puis recharge `GET /v1/conversations`. Les doublons (message reçu par les deux voies) sont écartés par `id`.
- **Lecture** : `last_read_message_id` n'avance jamais (un `messageId` plus ancien que l'actuel est ignoré). `unreadCount` = messages de l'autre membre plus récents que `last_read_message_id`. Après la transaction, `conversation.read` est publié à l'autre membre, qui affiche « Vu » sous le dernier message lu.
- **Visibilité** : `canMessage(sender, recipient)` (ADR-006) est vérifié à la création de la conversation et à chaque envoi. Si les deux comptes se bloquent (dans un sens ou dans l'autre) ou si l'un n'est plus actif, la conversation disparaît de la liste des deux et tous ses endpoints répondent `404`. Elle réapparaît, historique compris, après un déblocage.
- **Compte privé** : en P1, on peut écrire à un compte privé qu'on ne suit pas, comme sur Instagram ; le contenu partagé reste soumis à la visibilité.
- **Contenus référencés** : un post partagé, une story ou une note est relu à l'affichage avec la politique de visibilité. Supprimé, expiré (story, note) ou devenu invisible pour celui qui lit, il est renvoyé comme « contenu indisponible » (`sharedPost: null`, avec `kind` conservé), jamais avec son contenu.
- **Images de messages** :
  - média `purpose = message`, variantes écrites dans le bucket privé `media-private` (ADR-008) ;
  - l'API ne renvoie jamais d'URL publique : `GET /v1/media/{id}/signed-url?variant=` → `{ url, expiresAt }`, réservé aux membres de la conversation où le média est rattaché (sinon `404`) ;
  - **URL signée valable 1 heure** : assez pour faire défiler une conversation sans redemander d'URL, assez courte pour qu'un lien copié expire vite ;
  - côté app, le cache Nuke est indexé par `mediaId` et variante, pas par l'URL : une nouvelle URL signée ne retélécharge pas une image déjà en cache.
- **Demandes de message (P2)** :
  - à la création d'une conversation, si le destinataire ne suit pas l'expéditeur, son `conversation_members.status` vaut `request` ; celui de l'expéditeur vaut `active` ;
  - une conversation en `request` n'apparaît que dans `GET /v1/conversations/requests` du destinataire ; aucun « Vu » n'est envoyé tant qu'elle n'est pas acceptée ;
  - accepter passe le statut à `active` ; répondre à une demande l'accepte aussi ;
  - en P1, toutes les conversations sont `active`.
- **Côté app** (feature `Messages`, service partagé `Core/Messaging`) :
  - envoi optimiste : la bulle apparaît tout de suite en « Envoi… », puis prend l'état confirmé ; en cas d'échec, elle reste affichée avec « Non envoyé — Réessayer », qui renvoie avec le **même** `clientId` (ADR-020) ;
  - image : préparée et envoyée par le gestionnaire d'upload (ADR-008, ADR-022), message créé une fois le média `ready` ;
  - barre de saisie en Liquid Glass (contrôle, pas contenu, ADR-010).
- **Hors périmètre** : conversations de groupe, réactions, messages vocaux, suppression ou modification d'un message envoyé.
- **Cas limites** (ADR-014) : message envoyé deux fois avec le même `clientId`, conversation avec un compte bloqué, conversation d'un tiers (`404`), URL signée d'un média d'une autre conversation, post partagé devenu invisible, story expirée entre l'ouverture et la réponse, curseur et `after` invalides.

## Alternatives
- Envoi par le WebSocket : un seul canal, mais pas de contrat validé ni d'idempotence simple, et un message envoyé pendant une coupure est perdu. Écarté (D16).
- Supabase Realtime : moins de code, mais contraire à ADR-004. Écarté (D16).
- Une conversation par paire garantie seulement par le code : pas de colonnes en plus, mais deux créations simultanées produisent deux conversations. Non retenu.
- URL signée de 5 minutes : plus sûre, mais une conversation ouverte un moment redemande sans cesse des URL. Non retenu.
- URL signée de 24 heures ou plus : moins de requêtes, mais un lien partagé reste valable longtemps. Non retenu.
- Images de messages dans le bucket public : plus simple, mais une image privée devient lisible par qui obtient l'URL. Non retenu.

## Conséquences
### Positives
- Un message n'est jamais perdu ni dupliqué, même avec des renvois automatiques.
- Messages manqués toujours rattrapés, WebSocket ou pas.
- Images de messages réservées aux membres de la conversation.

### Négatives
- Deux chemins de réception (WebSocket et REST) à dédoublonner dans l'app.
- Chaque affichage d'un post, d'une story ou d'une note partagés relit sa visibilité.
- Les images de messages demandent un appel de plus (URL signée) et une clé de cache spécifique côté app.

## Liens
- ADR-005 (limite de 60 messages / minute)
- ADR-006 (`canMessage`, blocage)
- ADR-007 (pagination par curseur, pas de clé étrangère polymorphe)
- ADR-008 (bucket `media-private`, rattachement des médias)
- ADR-014 (cas limites)
- ADR-020 (envoi optimiste)
- ADR-021 (WebSocket)
- ADR-022 (attente du traitement d'une image)
- ADR-025 (stories et notes référencées)
