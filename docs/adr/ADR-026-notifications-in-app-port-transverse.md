# ADR-026 — Notifications in-app : port transverse écrit dans la transaction de l'action

## Statut
Proposé

## Contexte
La P1 ajoute l'onglet Activité : likes, commentaires, réponses, likes de commentaires, abonnements, demandes d'abonnement, mentions, puis en P2 invitations de collaboration et republications. Les notifications sont regroupées à l'affichage (« X et 5 autres ont aimé votre publication »). La P2 ajoute les notifications push (ADR-027).

Les notifications sont créées par des use cases de plusieurs modules (`LikePost` dans `engagement`, `FollowUser` dans `social`, `CreatePost` dans `posts`…), alors que la table `notifications` appartient au module `activity`. Contraintes :
- un module n'importe pas un autre module (ADR-005) ; une notification doit être écrite **dans la même transaction** que l'action, et disparaître si l'action est annulée (unlike, suppression) ;
- pas de notification vers soi-même ni depuis un compte bloqué ;
- le projet a déjà deux ports transverses du même genre : `AdminAuditLog`, écrit dans la transaction de l'action, et `AnalyticsTracker`, appelé après elle ;
- le WebSocket ne fait que signaler la nouveauté (ADR-021).

Décision source : D44.

## Décision
- **Port transverse `NotificationWriter`** (`shared/application`), sur le modèle d'`AdminAuditLog` : il fait partie du *scope* de transaction des use cases qui notifient (`UnitOfWork`, ADR-005), et son adapter Drizzle (module `activity`, `infrastructure/persistence`) écrit dans la même transaction que l'action.
  - `notify({ recipientId, actorId, type, postId?, commentId?, storyId? })` → notification créée, ou rien ;
  - `retract({ recipientId, actorId, type, postId?, commentId? })` : supprime la notification correspondante (unlike, commentaire supprimé, désabonnement, demande annulée, like de commentaire retiré).
- **Règle dans le domaine** : `shouldNotify(actorId, recipientId)` (`shared/domain`) refuse la notification vers soi-même ; l'adapter n'insère pas si un blocage existe dans un sens ou dans l'autre (`INSERT … WHERE NOT EXISTS` sur `blocks`). Les use cases n'ont rien à revérifier.
- **Après la transaction, port transverse `NotificationDispatcher`** (`shared/application`) : `dispatch(notifications créées)` publie `activity.created { unreadCount }` au destinataire par `RealtimePublisher` (ADR-021), puis, en P2, enfile le job `send-push` (ADR-027). Comme `AnalyticsTracker`, un échec est journalisé, jamais propagé.
- **Table `notifications`** (module `activity`) : `id`, `recipient_id`, `actor_id`, `type`, `post_id`, `comment_id`, `story_id` (colonnes nullables + `CHECK` par type, ADR-007), `group_key`, `created_at` (`timestamptz(3)`), `read_at`. Index `notifications (recipient_id, created_at DESC)`. Unicité de `(recipient_id, actor_id, type, post_id, comment_id)` pour les types répétables (un like retiré puis remis ne crée pas de doublon).
- **Types** et qui les crée :

| Type | P | Créé par | Retiré par |
|---|---|---|---|
| `like` | P1 | `LikePost` | `UnlikePost` |
| `comment` | P1 | `CreateComment` (commentaire racine, à l'auteur du post) | suppression du commentaire |
| `comment_reply` | P1 | `CreateComment` (réponse, à l'auteur du commentaire parent) | suppression de la réponse |
| `comment_like` | P1 | `LikeComment` | `UnlikeComment` |
| `follow` | P1 | `FollowUser` (compte public), acceptation d'une demande (au destinataire) | désabonnement |
| `follow_request` | P1 | `FollowUser` vers un compte privé | demande annulée, acceptée ou refusée |
| `follow_accepted` | P1 | acceptation d'une demande (au demandeur) | — |
| `mention` | P1 | création d'un post, d'un commentaire (une par compte mentionné et visible) ou d'une story (comptes de `mentionedUserIds` qui peuvent voir la story, ADR-025) | suppression du contenu |
| `collab_invite` | P2 | création d'un post avec collaborateurs | invitation acceptée, refusée ou post supprimé |
| `repost` | P2 | `RepostPost` | annulation de la republication |

- **Regroupement à la lecture, jamais stocké** : `group_key` est calculé à l'insertion (`like:<postId>`, `comment_like:<commentId>`) ; les autres types ont un `group_key` unique (pas de regroupement). `GET /v1/activity` regroupe par `group_key` : un élément = un groupe, avec le dernier acteur, le nombre total d'acteurs et la date la plus récente ; pagination par curseur `(date la plus récente, group_key)`, pages de 20.
- **Lecture** : `GET /v1/activity` applique la visibilité à la lecture : acteurs bloqués ou non actifs masqués, notification d'un post, commentaire ou story supprimé masquée. `unreadCount` = groupes contenant au moins une notification non lue. `POST /v1/activity/read` marque tout comme lu.
- **Pas de notification pour les messages** : ils ont leur propre indicateur de non-lus (ADR-023).
- **Côté app** (feature `Activity`, état partagé dans `Core/Activity`) : pastille de l'onglet mise à jour par `activity.created`, rechargée par REST à l'ouverture de l'app et après une reconnexion ; affichage par sections « Aujourd'hui », « Cette semaine », « Ce mois-ci », « Plus ancien » ; demandes d'abonnement en tête de la liste, avec Accepter / Refuser.
- **Tests** : chaque use case qui notifie vérifie la création et le retrait dans la même transaction (transaction annulée → aucune notification) ; pas de notification vers soi-même ni depuis un compte bloqué ; regroupement et pagination ; `activity.created` publié après la transaction seulement.

## Alternatives
- Le module `activity` écoute des événements de domaine publiés par les autres modules : modules mieux découplés, mais un bus d'événements à écrire, et des notifications écrites hors de la transaction de l'action (une notification peut survivre à une action annulée). Non retenu.
- Un port propre à chaque module (`LikeNotifier`, `FollowNotifier`…) : dépendances encore plus explicites, mais la même interface répétée dans chaque module et la règle « ni soi-même, ni bloqué » dupliquée. Non retenu par le lead dev au profit d'un port transverse.
- Notifications créées par un job du worker : action plus rapide, mais logique métier dans le worker et retrait (unlike) difficile à garantir. Non retenu (ADR-008).
- Regroupement stocké (une ligne par groupe mise à jour à chaque like) : lecture plus simple, mais retrait d'un seul acteur compliqué. Non retenu.

## Conséquences
### Positives
- Une notification existe si et seulement si l'action existe : même transaction, retrait dans la même transaction.
- La règle « ni soi-même, ni bloqué » est écrite une seule fois.
- Les modules ne dépendent pas du module `activity`, seulement d'un port transverse, comme pour le journal d'audit.

### Négatives
- Chaque use case qui notifie ajoute le port à son *scope* de transaction et appelle le dispatcher après la transaction.
- Le regroupement à la lecture rend la requête de `GET /v1/activity` plus coûteuse : à valider par `EXPLAIN ANALYZE` sur le seed.
- La visibilité est réappliquée à chaque lecture de l'activité.

## Liens
- ADR-005 (`UnitOfWork`, ports transverses, modules indépendants)
- ADR-006 (blocage, visibilité à la lecture)
- ADR-007 (colonnes nullables + `CHECK`, curseurs, index)
- ADR-013 (même modèle que `AnalyticsTracker` après la transaction)
- ADR-021 (`activity.created`)
- ADR-027 (notifications push)
