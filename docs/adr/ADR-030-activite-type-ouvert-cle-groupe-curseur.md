# ADR-030 — Activité : type de notification en liste ouverte, clé de groupe et curseur

## Statut
Proposé

## Contexte
T18 pose l'Activité (ADR-026) avec quatre types de notification : `like`, `comment`, `comment_reply`, `follow`. Les tranches suivantes en ajoutent d'autres : `follow_request` et `follow_accepted` (T20), `mention` (T34, T36), `comment_like` (T37), `collab_invite` et `repost` en P2.

Trois points du contrat et de la pagination n'étaient pas fixés par ADR-026 :
- ajouter une valeur à une énumération d'une réponse est un changement cassant (ADR-019) : le client Swift ne décode pas une valeur inconnue. Avec une énumération, chaque tranche qui ajoute un type imposerait une rupture assumée et une app recompilée avant de tester sur la démo ;
- ADR-026 fixe `group_key = like:<postId>` pour les J'aime, et une clé « unique » pour les autres types, sans en donner le format ;
- la pagination se fait par curseur `(date la plus récente, group_key)` (ADR-026). Or le curseur commun `(created_at, id)` n'accepte qu'un UUID comme second membre (ADR-007), et `like:<postId>` n'en est pas un.

Décisions prises pendant T18, validées par le lead dev.

## Décision
- **`type` en liste ouverte** : dans `openapi.yaml`, `ActivityType` est une chaîne, sans `enum`. Sa description liste les types connus. L'app iOS convertit les types qu'elle connaît et **ignore un groupe d'un type inconnu**, comme un événement WebSocket inconnu (ADR-021). Une nouvelle tranche ajoute un type sans rupture de contrat : l'app non recompilée ne montre simplement pas ces groupes.
- **Côté base, la liste reste fermée** : `CHECK notifications_type` n'autorise que les types livrés ; chaque tranche ajoute les siens par migration. Il en va de même pour `NotificationType` dans `shared/domain/notification.ts` (ADR-007).
- **Format de la clé de groupe**, calculée à l'insertion par `groupKeyOf` (`shared/domain/notification.ts`) :
  - J'aime : `like:<postId>`, puis plus tard `comment_like:<commentId>` (ADR-026) ;
  - les autres types ne se regroupent pas : `<type>:<id de la notification>`, par exemple `follow:<uuid>`.

  Toute clé est donc de la forme `<type>:<uuid>`. Elle est exposée au client comme identifiant opaque et stable du groupe (`ActivityGroup.id`).
- **Curseur de l'Activité** : même encodage opaque que les autres listes (base64url d'un couple `[date ISO, identifiant]`, 128 caractères au plus, ADR-007). Le second membre est la clé de groupe au lieu d'un UUID :
  - `decodeCursor` (`packages/db`) et `parseCursor` (API) acceptent un validateur d'identifiant facultatif (UUID par défaut) ;
  - la route `GET /v1/activity` passe `isGroupKey` ;
  - un curseur mal formé renvoie `400 invalid_cursor`, comme ailleurs ;
  - tri `(date la plus récente DESC, group_key DESC)`, comparaison `(created_at, group_key) < (curseur)`.
- **Retrait des notifications d'abonnement au blocage** : `BlockUser` supprime les abonnements dans les deux sens. Il retire aussi leurs notifications `follow` dans la même transaction, pour qu'une notification n'existe que si l'action existe (ADR-026). Sans ce retrait, « X a commencé à vous suivre » réapparaîtrait après un déblocage.

## Alternatives
- `type` en `enum` : contrat plus précis et types générés plus stricts. Mais chaque tranche qui ajoute un type serait une rupture assumée (ADR-019), avec une app à recompiler avant la démo. Non retenu.
- Clé unique égale à l'identifiant de la notification (UUID seul) : le curseur commun suffirait, mais le format différerait de `like:<postId>`, sans structure commune à valider. Non retenu.
- Curseur propre à l'Activité, avec son propre encodage : aucune modification de `decodeCursor`, mais un second format de curseur à maintenir et à tester. Non retenu.
- Curseur `(date, id de la notification la plus récente du groupe)` : UUID compatible avec le curseur commun, mais il s'écarte du curseur `(date la plus récente, group_key)` d'ADR-026, et le tri par groupe ne serait plus stable. Non retenu.
- Laisser au blocage les notifications d'abonnement, masquées à la lecture : rien à écrire, mais elles réapparaissent au déblocage. Non retenu.

## Conséquences
### Positives
- Ajouter un type de notification ne casse plus le contrat : migration, domaine, contrat et app peuvent évoluer dans la même tranche, sans rupture assumée.
- Une seule forme de clé (`<type>:<uuid>`), validée avant d'atteindre la base.
- Un seul encodage de curseur pour toute l'API.

### Négatives
- Le contrat ne liste plus formellement les types : le client doit lire la description et ignorer les inconnus (testé côté iOS).
- La liste des types est écrite à plusieurs endroits (migration, domaine, contrat, conversion iOS), à tenir alignés à chaque tranche.
- Une app non recompilée ne montre pas les groupes d'un nouveau type, alors que `unreadCount` les compte.

## Liens
- ADR-007 (curseurs, colonnes nullables + `CHECK`)
- ADR-019 (réponses tolérantes, énumérations de réponse cassantes)
- ADR-021 (événement inconnu ignoré par l'app)
- ADR-026 (notifications in-app, `group_key`, curseur de l'Activité)
