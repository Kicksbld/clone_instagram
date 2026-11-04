# Historique des tranches

Ce que chaque tranche a posé dans le code, pour retrouver où vit une fonctionnalité. Une entrée par tranche, ajoutée à la fin de chaque tranche. Les règles restent dans les ADR et les `CLAUDE.md` ; l'avancement résumé est dans le `README.md`.

- Le socle TypeScript existe (T0a) : `apps/api`, `apps/worker`, `apps/backoffice`, `packages/contract`, `packages/db`, `packages/jobs`, sans table ni authentification. Le squelette iOS existe (T0b) : `ios/`, projet XcodeGen, écran d'état de `/health`. La démo est déployée (T1) : Supabase Cloud, Railway (`apps/*/Dockerfile`, réglages des services dans le README § 7, migrations en pré-déploiement), Vercel ; détail dans `README.md` § 7.

- T2 pose l'authentification (JWT ES256 vérifiés par JWKS, ADR-018), le module `identity` (table `profiles`) et l'onboarding iOS en wireframe.

- T3 pose le pipeline média (ADR-008) : module `media` (table `media`, upload présigné, ports `UnitOfWork` et `JobQueue`), jobs `process-image` et `purge-orphan-media` dans le worker (sharp), photo de profil.

- T4 pose la politique de visibilité (`apps/api/src/shared/domain/visibility.ts`, ADR-006) et le port transverse `RelationshipReader` (tables `follows` et `blocks`), `GET /v1/users/{username}`, la feature iOS `Profile`, un onglet Recherche provisoire (username exact, remplacé en T5) et un seed minimal (`SEED_VIEWER_USERNAME`).

- T5 pose le module `social` (follow / unfollow, listes d'abonnés paginées par curseur, `GET /v1/search/users` avec `pg_trgm`), le `SocialService` iOS (`Core/Social`), le bouton Suivre optimiste et l'onglet Recherche.

- T6a pose le module `posts` (`POST /v1/posts`, `GET /v1/posts/{id}`, `GET /v1/users/{id}/posts` par pages de 12, tables `posts` et `post_media`), le rate limit par route (`@fastify/rate-limit`), la file de publication persistée iOS (`Core/Posts/PublishQueue`, bandeau « Publication en cours »), le recadrage comme Instagram (`Core/Media/ImageCropper`), la feature `Create`, la grille du profil et la feature `Post` (détail).

- T6b pose le carrousel (1 à 10 photos au ratio de la première, `PublishQueue` multi-médias qui ne renvoie que les photos non envoyées), `DELETE /v1/posts/{id}` (suppression logique par l'auteur, médias détachés puis purgés, `post_count` décrémenté, `204` ou `404 post_not_found`) et le menu « … » du détail.

- T7 pose le module `feed` (`GET /v1/feed`, pages de 12, requête d'ADR-007 sur `selectPosts` partagé avec `posts`), la feature iOS `Feed` (repère « Vous êtes à jour » après 3 jours, suppression depuis le menu « … », préchargement Nuke par `Core/Media/ImagePrefetching`), `PostView` déplacé dans `DesignSystem` et le seed complet (`packages/db/src/seed/`, 100 profils, posts avec photos picsum.photos écrites dans Storage, local et démo).

- T8 pose le module `engagement` (`PUT` / `DELETE /v1/posts/{id}/like`, table `post_likes`, champs `likeCount` / `viewerHasLiked` du `Post`), la limite globale de 120 requêtes / minute par utilisateur (ADR-005) et 30 / h sur `POST /v1/media/uploads`, et côté iOS `Core/Engagement` (`EngagementService`, `LikeSynchronizer` : like optimiste partagé par tous les écrans), le bouton J'aime et le double tap de `PostView`.

- T9 pose les commentaires dans le module `engagement` (table `comments`, `GET` / `POST /v1/posts/{id}/comments`, `GET /v1/comments/{id}/replies`, `DELETE /v1/comments/{id}`, un seul niveau de réponse, du plus récent au plus ancien par pages de 20, 30 / min sur la publication, champ `commentCount` du `Post`) et côté iOS la feature `Comments` (feuille présentée par `App` via `openComments` de `Core/Navigation/CommentsRoute`, envoi optimiste, réponses repliables, suppression par glissement) et `Core/Engagement/CommentCountStore` (nombre de commentaires partagé par tous les écrans).

- T10 pose le module `billing` (table `subscriptions`, `POST /v1/me/subscription/refresh`, règle `isPlus`, port `SubscriptionProvider` sur la REST API v2 de RevenueCat, champs `plan` / `plusExpiresAt` de `Me` via `GetPlan`) et côté iOS `Core/Billing` (`PurchaseService` sur `purchases-ios`, `SubscriptionService`, `AppIconService`), la feature `Paywall` (fin d'onboarding et Paramètres), une feature `Settings` minimale (ligne « Clone Plus », icônes alternatives `AppIcon-Citron` / `AppIcon-Rose`) et le fichier StoreKit du schéma Local.

- T11 pose les analytics (ADR-013) : port transverse `AnalyticsTracker` (`apps/api/src/shared/application`, adapter `posthog-node`, no-op sans `POSTHOG_PROJECT_API_KEY`) appelé après la transaction par `CompleteOnboarding`, `CreatePost` et `RefreshSubscription` (`profile_created`, `post_created`, `subscription_activated` au passage de free à plus), et côté iOS `Core/Analytics` (`AnalyticsService` sur `posthog-ios`, sans autocapture, événements centralisés dans `AnalyticsEvent`, `identify` à la création du profil, `reset` à la déconnexion) et l'A/B test du paywall (flag `paywall-presentation`, `PaywallVariant` `control` / `test`, présentation seule, `control` si PostHog est injoignable).

- T12 pose `PATCH /v1/me/settings` (compte privé / public), le blocage dans le module `social` (`PUT` / `DELETE /v1/users/{id}/block` → `204` idempotents, abonnements supprimés dans les deux sens avec leurs compteurs, `GET /v1/me/blocks`), le module `moderation` (table `reports` à une colonne par cible, `POST /v1/reports` limité à 10 / h, `422 cannot_report_self`) et côté iOS `Core/Social/BlockStore` (comptes bloqués partagés par tous les écrans), `Core/Navigation/ModerationRoute` (actions d'environnement `moderation` et `blockedUserIds`, présentées par `App/ModerationPresenter`), la feature `Report` et les Paramètres complets (confidentialité, comptes bloqués, « Se déconnecter »).

- T13 pose `DELETE /v1/me` (module `identity` : utilisateur Supabase Auth supprimé par le port `AuthAccounts`, profil `deleted`, job `purge-account` enfilé), le refus global d'un compte `deleted` dans la vérification d'authentification (port `AccountStatusReader`, `401`), le job `purge-account` du worker (fichiers, `purgeAccountData` de `packages/db` qui recompte les compteurs touchés, client RevenueCat et personne PostHog par `src/saas.ts`) et côté iOS l'écran Paramètres > Supprimer le compte (`DeleteAccountViewModel`, déconnexion complète après suppression).

- T14 pose le refus global d'un compte suspendu ou banni (`403 account_suspended`, sauf routes `config.allowSuspendedAccount` : `GET` et `DELETE /v1/me`), les ports transverses `AdminRoles` (`requireAdmin`, `403 admin_required`) et `AdminAuditLog` (tables `admin_roles`, sans profil requis, et `admin_audit_log` en écriture seule par trigger), les routes `/v1/admin/me` et `/v1/admin/users…` du module `identity` (recherche par curseur, fiche avec signalements reçus et émis, `ModerateUser` suspendre / bannir / réactiver, `DeleteUserAsAdmin`), le script `pnpm admin:create`, côté iOS `AccountSuspensionMiddleware` / `AccountSuspensionMonitor` et la feature `Suspended` (route `.suspended` de `RootViewModel`), et le backoffice : connexion `@supabase/ssr` par Server Action (cookies httpOnly), `requireAdmin()` de `features/auth/data/session.ts` appelé par chaque page et chaque Server Action, pages `/users` et `/users/[id]` (feature `users`).

- T15 pose la modération : `GET /v1/admin/reports` (file filtrée par statut, motif et type, `open` par défaut, pages de 20), `GET /v1/admin/reports/{id}` (aperçu du contenu, même privé ou supprimé) et `POST /v1/admin/reports/{id}/resolve` (`remove_content` ou `dismiss`, une décision par contenu : tous ses signalements ouverts traités ensemble ; un compte ne peut être que classé, `422 cannot_remove_user`) dans le module `moderation` (`ResolveReport` : contenu, compteurs, signalements et `admin_audit_log` dans une transaction), migration `0011_moderation` (`reports.resolution_note`, `resolved_by` sans clé étrangère), le job `purge-content-files` (payload `{ postId }`, fichiers et lignes des médias détachés du post) et côté backoffice la feature `reports` (pages `/reports` et `/reports/[id]`).

- T16 (backoffice analytics) est supprimée.

- T17 pose l'UI optimiste (ADR-020) : moteur `Core/Optimistic/OptimisticSync`, `LikeSynchronizer` réécrit dessus, `FollowStore` (`Core/Social`, abonnements partagés et compteur « suivi(e)s »), `BlockStore` optimiste, `PostDeletionStore` (`Core/Posts`, suppression de post et compteur de publications, alerte affichée par `App`), compte privé et photo de profil sans attente.

- T18 (P1) pose les notifications in-app (ADR-026) : ports transverses `NotificationWriter` (dans le *scope* de transaction, `notify` / `retract`, règle `shouldNotify` et `groupKeyOf` de `shared/domain/notification.ts`) et `NotificationDispatcher` (après la transaction ; sans effet jusqu'au temps réel de T19), branchés sur `LikePost` / `UnlikePost`, `CreateComment` / `DeleteComment`, `FollowUser` / `UnfollowUser` et `BlockUser` (abonnements supprimés avec leur notification) ; module `activity` (table `notifications`, migration `0012_notifications`, `GET /v1/activity` regroupé à la lecture avec curseur `(date la plus récente, clé du groupe)`, `POST /v1/activity/read`) et côté iOS `Core/Activity` (`ActivityService`, `ActivityBadge` : pastille rechargée au lancement et au retour au premier plan), la feature `Activity` (sections par période) ouverte par le cœur de la barre de l'Accueil.

- T19 pose `GET /v1/ws` (authentification par message et renouvellement du JWT, ping/pong, codes `4401` / `4403`), le port transverse `RealtimePublisher` et son broker en mémoire multi-appareils. Le dispatcher publie le nombre de groupes d'Activité visibles après transaction ; suspension, bannissement et suppression coupent les connexions. Côté iOS, `Core/Realtime` ouvre la connexion au premier plan, renouvelle le jeton et reconnecte avec backoff ; `Core/Activity` reçoit les événements et rattrape par REST, sans laisser une réponse retardée écraser une mise à jour récente (ADR-031). Validation physique à deux iPhone sur la démo encore à réaliser.

- T20 (P1) pose les demandes d'abonnement (ADR-006, ADR-032) : table `follow_requests` (migration `0013_follow_requests`, types de notification `follow_request` et `follow_accepted`), `FollowUser` vers un compte privé (`requested`), `UnfollowUser` qui annule la demande, `AcceptFollowRequest` / `DeclineFollowRequest` (`POST /v1/follow-requests/{requesterId}/accept|decline`, `404 follow_request_not_found`), `ListFollowRequests` (`GET /v1/me/follow-requests`), `RemoveFollower` (`DELETE /v1/users/{id}/follower`), blocage étendu aux demandes et `UpdateSettings` transactionnel qui accepte les demandes au passage en public par le port transverse `FollowRequestAccepter` (règle partagée `modules/social/application/follow-request-acceptance.ts`, adapter `SocialFollowRequestAccepter`) ; champ `requested` de `Relationship` / `FollowStatus` et de la relation lue par `RelationshipReader`. Côté iOS : `FollowStore` à trois états (« Suivre », « Demandé », « Suivi(e) »), `FollowButton` avec `isRequested`, section « Demandes d'abonnement (N) » de la feature `Activity` (Accepter / Refuser optimistes), « Supprimer » dans mes abonnés (`FollowListViewModel.removeFollower`).

- T21 (P1) pose les événements `media.ready` / `media.failed` du contrat, l'adapter `media/infrastructure/queue-events` (QueueEvents BullMQ ouvert au démarrage et fermé avec l'API, relecture du statut et du propriétaire, mêmes URL que REST), et `Core/Media/MediaProcessingEvents` partagé par les publications et la photo de profil via `UploadManager`. Le temps réel termine l'attente ; REST rattrape au premier plan, après authentification du WebSocket, à 20 s puis toutes les 10 s. Le résultat du worker était déjà défini et validé dans `packages/jobs`. Conforme à ADR-022, aucune nouvelle décision d'architecture. Tests existants uniquement à la demande du lead ; validation physique sur la démo encore à réaliser.

### T22 — Publication et lecture d'un reel depuis le profil (#33)

- Contrat : MP4 ≤ 50 MiB, `kind = reel`, variantes HLS/miniature, durée, grille paginée `GET /v1/users/{id}/reels` ; exceptions de compatibilité exactes validées par le lead dev le 2026-11-02.
- Worker : `process-video` (`videos.ts`, ffprobe/ffmpeg, file `media-video`, concurrence 1, délai de 10 min), refus précis, miniature par sharp ; purge récursive du dossier média. Migration `0014_reel_video` pour les motifs d'échec.
- API : validation du type des médias avant rattachement, QueueEvents vidéo, lecture visible des reels ; miniatures statiques conservées dans l'Activité et la modération (lecteurs hors tranche).
- iOS : `VideoPreparer` (AVAssetWriter), `SystemVideoCamera`, file de publication vidéo persistée, repli REST après 120 s ; onglet de profil Reels et `ReelPlayerView` avec pool de deux lecteurs réutilisés, miniature jusqu'à la première image, pause et son coupé par défaut.
- Seed : trois mires animées CC0 produites localement, envoyées et traitées par la vraie file vidéo (`apps/worker/src/seed-reels.ts`). Worker actif nécessaire.
- Reste à valider : démo sur iPhone physique, export de 60 s sur iPhone, taille Docker et mémoire Railway.

### T23 — Je gère mes amis proches (#34)

- Contrat : `GET /v1/me/close-friends` (`UserPage`, pages de 20), `PUT` / `DELETE /v1/me/close-friends/{userId}` → `204` idempotents, code `422 cannot_close_friend_self` (ajout et retrait de soi-même).
- Base : table `close_friends` (migration `0015_close_friends`, clé `(owner_id, friend_id)`, index `(owner_id, created_at DESC)` et `friend_id`, `CHECK` contre soi-même).
- API, module `social` : `AddCloseFriend` (visibilité `canViewProfile` lue dans la transaction de l'écriture, *scope* `CloseFriendTransaction`), `RemoveCloseFriend`, `ListCloseFriends` (`DrizzleSocialGraphReader.listCloseFriends`, comptes actifs sans blocage) ; `BlockUser` retire des amis proches dans les deux sens (`closeFriends` dans `BlockTransaction`). `RelationshipReader.viewerIsCloseFriend` reste à `false` jusqu'à T24 (stories).
- iOS : `SocialService` (`listCloseFriends`, `addCloseFriend`, `removeCloseFriend`), Paramètres > « Amis proches » (`Features/Settings/CloseFriendsView`, `CloseFriendsViewModel` : ajout / retrait optimistes sur `OptimisticSync`, recherche par `GET /v1/search/users` sans moi-même). L'état « ami proche » d'un résultat de recherche est celui de la liste chargée (le contrat ne l'expose pas dans `UserSummary`).
- Reste à valider : démo sur iPhone physique.

### T24 — Je publie une story et mes abonnés la regardent (#35)

- Contrat : `POST /v1/stories` (`201 Story`, 20 / h), `GET /v1/stories/tray` (`StoryTray`, 100 auteurs au plus, sans curseur : ADR-034), `GET /v1/users/{id}/stories` (`StoryList`), `POST /v1/stories/{id}/view` (corps `{}` obligatoire, `anonymous` limité à `false`), `DELETE /v1/stories/{id}` ; code `404 story_not_found` ; `story` ajouté à `MediaPurpose` (rupture validée par le lead dev le 2026-11-03, `oasdiff-err-ignore.txt`).
- Base : migration `0016_stories`, tables `stories` (`media_id` unique, `SET NULL` à la purge : la story supprimée garde sa ligne) et `story_views` ; `purgeAccountData` recompte `view_count` des stories vues par le compte supprimé.
- API, module `ephemeral` : `PublishStory` (port `PlusStatus` sur `GetPlan`, durée fixée à la publication), `GetStoryTray` (visibilité traduite en SQL dans `DrizzleStoryReader.tray`), `GetUserStories` (`canViewStory`), `ViewStory` (vue et `view_count` dans une transaction), `DeleteStory` ; `RelationshipReader.viewerIsCloseFriend` lit désormais `close_friends`.
- iOS, feature `Stories` : `StoryService`, bandeau (`StoryTrayView`, fourni à `FeedView` par `RootView` en en-tête, anneau en pointillés pour les amis proches), viewer plein écran (`StoryViewerViewModel` : 5 s par story, première non vue, vue envoyée à l'affichage, suppression), création (`CreateStoryViewModel`, `UploadService` avec `purpose` `story`) ; suppression optimiste par `StoryDeletionStore` (`OptimisticSync`, partagé par le bandeau et le viewer, alerte dans le viewer ou le bandeau, ADR-020) ; `Core/Media/SystemPhotoCamera`.
- Seed : 76 stories picsum 9:16 réécrites à chaque seed pour rester actives, amis proches (Léa → compte de démo ; Chloé : story amis proches invisible pour lui).
- Bandeau vérifié par `EXPLAIN ANALYZE` sur le seed : 0,9 ms.
- Reste à valider : démo sur iPhone physique.


### T25 — Je vois qui a regardé ma story et je retrouve mes stories archivées (#36)

- Contrat : `GET /v1/stories/{id}/viewers` (`StoryViewerPage`, curseur `(viewed_at, viewer_id)`, recherche `q` par username ou nom), `GET /v1/me/stories/archive` (`ArchivedStoryPage`, curseur `(created_at, id)`), `anonymous: true` accepté par `POST /v1/stories/{id}/view` ; `403 plus_required` pour les avantages sans abonnement actif. Clients régénérés, sans rupture de compatibilité.
- API, module `ephemeral` : `ListStoryViewers` (auteur seulement, active ou archivée ; comptes actifs sans blocage), `ListArchivedStories` (archive privée, expiration filtrée à la lecture), `ViewStory` (Plus relu au moment de la vue anonyme, aucune écriture ni compteur). Aucune nouvelle table ni migration.
- iOS : feuille « Vues » paginée avec recherche Plus et paywall, réglage de vue anonyme dans le viewer, Profil > menu > « Archive » (grille paginée, ouverture dans le viewer et accès aux vues). Le paywall est fourni par `App` via l’environnement ; le plan est relu depuis le routeur pour débloquer l’écran après un achat. Une préférence anonyme conservée après expiration ne devient jamais une vue normale silencieusement.
- Décisions : application d’ADR-025, ADR-012, ADR-006 et ADR-007 ; aucune nouvelle décision d’architecture.
- Reste à valider : parcours de démo sur iPhone physique (A publie, B regarde normalement, C Plus anonymement ; A voit seulement B puis retrouve sa story et ses vues dans l’Archive après expiration).


## T26 — Messages texte en temps réel (#37)

- Contrat : `GET` / `POST /v1/conversations`, `GET` / `POST /v1/conversations/{id}/messages`, événement `message.created` (même message que REST), clients régénérés. Historique par 30, rattrapage `after` par 100 avec continuation `nextCursor` ; conversations non vides par 20.
- Base : migration `0017_thin_slapstick`, tables `conversations`, `conversation_members`, `messages`, RLS sans policy, unicité de la paire et de `(sender_id, client_id)`, index de pagination. Seed idempotent de conversations texte, dont une avec le compte `SEED_VIEWER_USERNAME` s'il est renseigné.
- API : module `messaging`, `GetOrCreateConversation`, `ListConversations`, `ListMessages`, `SendMessage` ; transaction message + date de conversation, sérialisation des envois avant attribution de leur date, événement aux deux membres après commit, limite de 60 envois/minute. `canMessage` pour chaque accès ; listes filtrées selon la même règle, historique conservé après déblocage.
- iOS : `Core/Messaging` (service et store partagé, dédoublonnage par identifiant, retry avec le même `clientId`, rattrapage des conversations ouvertes après authentification WebSocket), feature `Messages` (liste, recherche, conversation, barre Liquid Glass, menu Signaler/Bloquer), bouton Message sur le profil via `ConversationRoute`. Aucune lecture/non-lus/photo/partage (T27 et suivantes).
- Décisions : application des ADR existants, aucune nouvelle décision d'architecture.
- Reste à valider : démo sur deux iPhone physiques, réception immédiate puis rattrapage après coupure réseau. Migration à appliquer sur la démo avant le test.


## T27 — « Vu » et messages non lus (#38)

- Contrat : `POST /v1/conversations/{id}/read` `{ messageId }` → `204` ; `Conversation.unreadCount` et `otherMemberLastReadMessageId` ; `ConversationPage.unreadConversationCount` (toutes pages) ; événement `conversation.read`. Clients régénérés, sans rupture de compatibilité.
- Base : aucune migration (`conversation_members.last_read_message_id`, clé étrangère composite vers un message de la même conversation).
- API, module `messaging` : `MarkConversationRead` (mise à jour conditionnelle : la position n'avance que vers un message plus récent, même en concurrence ; message d'une autre conversation → `404 conversation_not_found` ; `conversation.read` à l'autre membre après commit, seulement si la position a avancé), compteurs de non-lus dans l'aperçu et `unreadConversationCount` dans `ListConversations` (même traduction SQL de `canMessage` que la liste).
- iOS : `MessagingStore` (pastille `unreadConversationCount` relue par REST au premier plan et après reconnexion, ajustée à chaque `message.created` ; lecture du dernier message à l'affichage d'une conversation et à chaque message reçu pendant qu'elle est ouverte, échec silencieux réessayé à l'affichage suivant ; « Vu » sous mon dernier message lu par l'autre, jamais en arrière), `RealtimeClient` (`conversation.read`), pastille `.badge` sur l'onglet Messages, conversation non lue en gras avec pastille dans la liste.
- Décisions : application d'ADR-023 et ADR-021 ; points à confirmer par le lead dev listés dans la PR.
- Reste à valider : démo sur deux iPhone physiques (A écrit, la pastille de B s'allume, B ouvre, A voit « Vu »).


## T28 — J'envoie une photo dans une conversation (#39)

- Contrat : `purpose = message` (rupture validée par le lead dev le 2026-11-04, `oasdiff-err-ignore.txt`), `POST …/messages` accepte `SendImageMessage` (`kind = image`, `mediaId`, `body` facultatif ; `oneOf` sans `discriminator`, non pris en charge par Ajv), `Message.mediaId`, `body` vide pour une photo sans texte, `GET /v1/media/{id}/signed-url?variant=` → `SignedMediaUrl`. Variantes absentes de `GET /v1/media/{id}` et de `media.ready` pour `message` (`MediaReady.data.variants` facultatif, validé le 2026-11-04). Clients régénérés.
- Base : migration `0018_message_images` (`CHECK` par `kind` de `messages`, index unique partiel `messages_media_id_key`). Aucune nouvelle table.
- Stockage : `variantsBucket(purpose)` (`packages/db`) choisit `media-private` pour `message` et `instant` ; utilisé par `process-image`, `purge-orphan-media` et `purge-account`.
- API : `SendMessage` (photo de l'expéditeur, `image`, rattachée par `attachMediaOrThrow` dans la transaction du message ; renvoi du même `clientId` sans nouveau rattachement), `GetMessagePhotoUrl` (module `messaging` : message de la photo → `requireConversation`, invisible → `404 media_not_found`), port `PrivateMediaUrls` (adapter `SupabasePrivateMediaUrls`, 1 h), `hasPublicVariants` (module `media`) : aucune URL publique pour une photo de message.
- iOS : `MessagingStore.sendPhoto` (bulle optimiste depuis le fichier choisi, upload `purpose` `message` par `UploadService`, `mediaId` conservé pour les renvois avec le même `clientId`, nouvel upload si la photo est refusée), `MediaStatus.privateReady` (`media.ready` sans variantes), `Core/Messaging/MessagePhotoURLs` (URL signées réutilisées jusqu'à une minute de leur expiration, `ImageRequest.imageID` par média et variante, pipeline Nuke `withDataCache` dédié), `MessagePhotoView` / `PendingPhotoView` et boutons Caméra / Photothèque de la barre de saisie (feature `Messages`), aperçu « Photo » dans la liste.
- Reste à valider : démo sur deux iPhone physiques (A envoie une photo, B la voit ; l'URL copiée expire au bout d'une heure).



## T29 — Partage de post en message privé

- Contrat `SendPostShareMessage`, aperçu `SharedPost` nullable et type de message ouvert ; clients TypeScript et Swift régénérés.
- `messaging` : port propre `SharedPostReader`, résolution par lecteur via `canViewContent` pour les historiques, rattrapages, inbox, ouvertures, envois et événements WebSocket ; renvois idempotents.
- Migrations `0019` / `0020` : `post_share` admis par le `CHECK`, suppression de la FK qui empêchait de purger le post référencé. Aucune nouvelle table.
- iOS : action `openSharePost` fournie par `App`, feuille de sélection multiple avec conversations récentes et recherche, états par destinataire et réessai ; référence dans `MessagingStore.Pending`, bulle d'aperçu vers `PostRoute`, contenu indisponible préservant le message.
- ADR-035 proposé. Validation physique sur la démo à réaliser : A partage à B et C ; C non abonné d'un auteur privé voit « Contenu indisponible ».
