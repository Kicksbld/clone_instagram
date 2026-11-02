# ADR-027 — Notifications push : APNs en direct depuis le worker, déclenchées par l'API

## Statut
Proposé

## Contexte
La P2 ajoute les notifications push (APNs, environnement sandbox), comme sur Instagram : l'utilisateur est prévenu d'un like, d'un commentaire, d'un abonnement ou d'un message même quand l'app est fermée, et un appui ouvre le bon écran.

Contraintes :
- le compte Apple Developer payant permet les push (capability Push Notifications) ;
- l'envoi est un appel réseau externe : il ne doit ni ralentir ni faire échouer la requête de l'utilisateur ; il passe par un job (ADR-008) ;
- le worker n'a pas de logique métier : c'est l'API qui décide qui est notifié (ADR-026, ADR-023) ;
- payloads de jobs limités aux identifiants (ADR-015) ; clés APNs jamais dans le repo (ADR-009) ;
- l'app iOS ne compte que des notifications in-app (ADR-026) et des messages (ADR-023) : aucune autre source de push.

Le lead dev a demandé de reprendre le comportement d'Instagram pour ce qui existe dans l'app et de choisir le reste.

Décision source : D45.

## Décision
- **Ce qui déclenche une push** (comme Instagram, limité aux features de l'app) : chaque notification in-app créée (ADR-026 : like, commentaire, réponse, like de commentaire, abonnement, demande d'abonnement, demande acceptée, mention, invitation de collaboration, republication) et chaque message reçu (ADR-023), y compris une demande de message. Jamais pour ses propres actions ; jamais depuis un compte bloqué (déjà garanti par la création de la notification).
- **Déclenchement par l'API, après la transaction** : `NotificationDispatcher` (ADR-026) et `SendMessage` enfilent un job `send-push` par notification ou message créé. Un message renvoyé avec le même `clientId` n'enfile rien (ADR-023).
- **File `push`, job `send-push`** (ADR-015) : payload `{ kind: 'notification', notificationId }` ou `{ kind: 'message', messageId }`. Le worker relit la notification ou le message, l'acteur (username) et les appareils du destinataire ; si la ligne n'existe plus (unlike, suppression entre-temps), il ne fait rien. 3 tentatives avec délai croissant ; un job rejoué peut renvoyer une push (doublon toléré, APNs ne permet pas mieux).
- **Texte de la notification**, construit par le worker à partir de modèles fixes (présentation, pas de règle métier), en français, comme Instagram :

| Source | Texte |
|---|---|
| `like` | « **username** a aimé votre publication. » |
| `comment` | « **username** a commenté : texte du commentaire » |
| `comment_reply` | « **username** a répondu à votre commentaire : texte » |
| `comment_like` | « **username** a aimé votre commentaire : texte » |
| `follow` | « **username** a commencé à vous suivre. » |
| `follow_request` | « **username** a demandé à vous suivre. » |
| `follow_accepted` | « **username** a accepté votre demande d'abonnement. » |
| `mention` | « **username** vous a mentionné(e) dans un commentaire / une publication / sa story. » |
| `collab_invite` | « **username** vous invite à collaborer sur une publication. » |
| `repost` | « **username** a republié votre publication. » |
| message `text` | titre « **username** », texte du message (tronqué à 100 caractères) |
| message image, partage, réponse | titre « **username** », « a envoyé une photo », « a partagé une publication », « a répondu à votre story », « a répondu à votre note » |

  Le texte d'un commentaire ou d'un message est tronqué à 100 caractères. Les push transitent par Apple : aucun email, aucune autre donnée personnelle n'y figure.
- **Données de navigation** dans la push (`userInfo`) : `{ type, postId?, commentId?, conversationId?, userId? }`. Un appui ouvre l'écran correspondant par le `Router` (ADR-010) : post (et ses commentaires), profil, conversation, liste des demandes.
- **Regroupement** : `thread-id` = conversation pour les messages, `group_key` de la notification pour l'activité (ADR-026), pour que iOS empile les push d'un même post ou d'une même conversation.
- **Pas de badge** sur l'icône de l'app (compteur à tenir à jour côté serveur, hors périmètre).
- **Appareils** : table `devices` (module `activity`) : `apns_token` (clé primaire), `user_id`, `created_at`, `updated_at`.
  - `PUT /v1/me/devices/{apnsToken}` enregistre ou réattribue le jeton au compte connecté (un même iPhone peut changer de compte) ; `DELETE /v1/me/devices/{apnsToken}` le retire.
  - L'app enregistre le jeton à chaque lancement connecté et le retire à la déconnexion. La suppression du compte supprime ses appareils (`purge-account`).
  - Un jeton refusé par APNs (`410 Unregistered`, `400 BadDeviceToken`) est supprimé par le worker.
- **Envoi par HTTP/2 directement vers APNs**, sans bibliothèque dédiée : module `node:http2` de Node et signature du jeton d'authentification avec `jose` (déjà utilisé par l'API). **Authentification par jeton** (clé `.p8`, jeton ES256 renouvelé toutes les 50 minutes), pas de certificat. Hôte sandbox `api.sandbox.push.apple.com` en local et en démo.
- **Variables d'environnement** (worker uniquement, valeurs hors du repo, ADR-009) : `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (contenu de la clé `.p8`), `APNS_BUNDLE_ID`, `APNS_HOST`. Sans ces variables, le worker démarre et ignore les jobs `send-push` en le journalisant (comme PostHog sans clé, ADR-013).
- **Côté app** (`Core/Notifications`) :
  - capability Push Notifications et environnement `development` (sandbox) ;
  - demande d'autorisation **après l'onboarding**, à la première arrivée sur l'accueil (pas pendant l'inscription), comme Instagram ; un refus ne bloque rien et n'est pas redemandé par l'app ;
  - app au premier plan : la bannière n'est pas affichée pour la conversation ouverte ; le reste s'affiche normalement ;
  - aucun réglage fin des notifications dans les Paramètres (hors périmètre).
- **Tests** : worker testé avec un faux serveur APNs (texte construit, jeton supprimé sur `410`, notification disparue → rien n'est envoyé, variables absentes → job ignoré) ; API : job enfilé après la transaction seulement, jamais en cas d'échec ni de message dédoublonné.

## Alternatives
- Bibliothèque `@parse/node-apn` ou `apns2` : moins de code, mais une dépendance de plus pour un appel HTTP/2 simple que `node:http2` et `jose` couvrent. Non retenu.
- Service externe (Firebase Cloud Messaging, OneSignal) : envoi multiplateforme et tableau de bord, mais un SaaS de plus, pour une app iOS seule. Non retenu.
- Certificat `.p12` au lieu d'une clé `.p8` : fonctionne aussi, mais expire chaque année et est lié à une app et un environnement. Non retenu.
- Envoi depuis l'API, dans la requête : pas de job, mais la requête attend APNs et échoue avec lui. Non retenu (ADR-008).
- Texte construit par l'API et passé dans le payload du job : worker plus simple, mais contenu (texte de commentaire ou de message) stocké dans Redis, contraire à ADR-015. Non retenu.
- Push seulement pour les messages : plus simple, mais différent d'Instagram. Non retenu.

## Conséquences
### Positives
- L'utilisateur est prévenu même app fermée ; un appui ouvre le bon écran.
- Aucune requête de l'utilisateur ne dépend d'APNs.
- Aucune dépendance ni service supplémentaire.

### Négatives
- Clé APNs, environnement sandbox et capability à configurer dans le compte Apple Developer, en local et sur Railway.
- Le code HTTP/2 et la signature du jeton APNs sont écrits et maintenus par le projet.
- Le texte des commentaires et des messages transite par Apple (limité à 100 caractères).
- Une push peut arriver pour une action annulée juste après (l'envoi a déjà eu lieu) ou en double si un job est rejoué.

## Liens
- ADR-008 (envoi par job)
- ADR-009 (variables `APNS_*`, secrets)
- ADR-010 (capability Push Notifications, `Router`)
- ADR-013 (service externe absent : envoi ignoré et journalisé)
- ADR-015 (file `push`, payload par identifiants)
- ADR-023 (messages)
- ADR-026 (notifications in-app, `NotificationDispatcher`)
