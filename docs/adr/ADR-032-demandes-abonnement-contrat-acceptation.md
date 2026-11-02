# ADR-032 — Demandes d'abonnement : état `requested`, acceptation partagée et section de l'Activité

## Statut
Proposé

## Contexte
T20 (#31) applique les demandes d'abonnement d'ADR-006 et leurs notifications d'ADR-026 : `PUT /v1/users/{id}/follow` vers un compte privé crée une demande, `GET /v1/me/follow-requests` les liste, `…/accept` et `…/decline` y répondent, `DELETE /v1/users/{id}/follower` retire un abonné, le passage en public accepte les demandes en attente.

Plusieurs points n'étaient pas fixés par la fiche ni par les ADR :
- la forme de l'état `requested` dans le contrat, et le sort de `403 account_private` (P0, D32) ;
- la réponse à un refus d'une demande qui n'existe plus (la fiche ne fixe que l'acceptation : `404`) ;
- les notifications du passage en public, et celles d'une seconde acceptation pour le même demandeur (l'unicité de `notifications` garderait l'ancienne `follow_accepted`, avec son ancienne date) ;
- le retrait d'un abonné : notification, idempotence, compte invisible ;
- le passage en public est un use case du module `identity` (`UpdateSettings`), alors que les demandes et les abonnements appartiennent au module `social` (ADR-005) ;
- l'affichage des demandes dans l'Activité : les notifications `follow_request` sont aussi des groupes de `GET /v1/activity`, et la fiche ne prévoit aucun total pour le titre « Demandes d'abonnement (N) ».

Décisions prises pendant T20, à valider par le lead dev.

## Décision
- **Contrat** (changements compatibles, ADR-019) :
  - `Relationship` et `FollowStatus` gagnent un booléen obligatoire `requested` (demande en attente, jamais `true` en même temps que `following`) ; la réponse du follow vers un compte privé est `200 { following: false, requested: true }` ;
  - `403 account_private` n'est plus renvoyé : la réponse est retirée de `followUser`, le code reste au tableau des erreurs avec la mention « plus renvoyé depuis T20 » ;
  - nouveau code `404 follow_request_not_found` pour **l'acceptation et le refus** d'une demande inexistante (annulée entre-temps, déjà acceptée ou refusée) ; le refus n'est donc pas idempotent. L'acceptation renvoie aussi ce `404` si le demandeur est invisible (ADR-006) ; le refus d'une demande d'un compte invisible la supprime, sans rien révéler ;
  - `DELETE /v1/users/{id}/follower` : `204` idempotent, `404 user_not_found` si le compte est inexistant ou invisible (`canViewProfile`, comme `UnfollowUser`), `422 cannot_follow_self` sur soi-même.
- **Notifications** (ADR-026) :
  - accepter une demande : `follow_request` retirée, `follow` au compte qui accepte, `follow_accepted` au demandeur. Une ancienne `follow_accepted` du même compte est retirée puis recréée, pour dater la nouvelle acceptation ;
  - le passage en public est une acceptation de chaque demande en attente, y compris celles d'un compte suspendu (son abonnement reste invisible tant qu'il n'est pas réactivé, ses notifications sont masquées à la lecture) : mêmes notifications, une par demandeur ;
  - retirer un abonné retire sa notification `follow`, comme un désabonnement ; l'abonné n'est pas prévenu ;
  - bloquer supprime les demandes dans les deux sens avec leur `follow_request` (ADR-006, ADR-030).
- **Acceptation partagée entre modules, par un port transverse** (choix du lead dev, conforme à ADR-005) : `modules/social/application/follow-request-acceptance.ts` porte la règle d'acceptation (`acceptRemovedRequest`, `acceptAllRequests`) et son *scope* `FollowRequestAcceptance` (abonnements, demandes, compteurs, notifications), appelée par `AcceptFollowRequest`. Le passage en public passe par le port transverse `FollowRequestAccepter` (`shared/application`, `acceptAll(targetId)`), sur le modèle de `NotificationWriter` : il fait partie du *scope* `SettingsTransaction` d'`UpdateSettings` (module `identity`), et son adapter `SocialFollowRequestAccepter` (`modules/social/infrastructure`) applique la même règle sur les repositories de la transaction, assemblés dans `main.ts`. Le module `identity` n'importe rien du module `social`. `UpdateSettings` modifie d'abord le profil (ligne verrouillée jusqu'à la fin de la transaction), accepte les demandes, puis relit le profil pour renvoyer le compteur d'abonnés à jour.
- **Activité côté app** : `GET /v1/activity` renvoie toujours les groupes `follow_request` (ils comptent dans `unreadCount` et la pastille). L'app ne les affiche pas en ligne : la section « Demandes d'abonnement (N) » en tête de l'Activité est lue par `GET /v1/me/follow-requests`. `N` est le nombre de demandes chargées, suivi de « + » s'il reste des pages (« Voir plus ») ; aucun total n'est ajouté au contrat.
- **Gestes côté app** (ADR-020) : bouton Suivre à trois états par `FollowStore` (« Suivre » / « Demandé » / « Suivi(e) ») ; un appui sur « Demandé » annule la demande sans confirmation, comme Instagram ; Accepter / Refuser et « Supprimer » (retrait d'un abonné, après confirmation) masquent la ligne tout de suite et la rétablissent avec une alerte si l'API échoue ; un `404` la retire définitivement.

## Alternatives
- Remplacer `following` par un état unique (`none` / `requested` / `following`) : plus juste, mais rupture du contrat (ADR-019). Non retenu.
- Garder `403 account_private` documenté sur `followUser` : aucun changement du contrat, mais un statut qui ne peut plus arriver. Non retenu (`oasdiff` ne signale pas son retrait comme une rupture).
- Refus idempotent (`204` même sans demande) : l'app n'aurait rien à gérer, mais l'acceptation et le refus réagiraient différemment au même cas. Non retenu.
- Passage en public sans notification : moins de notifications d'un coup, mais les demandeurs ne savent pas qu'ils voient maintenant les contenus. Non retenu.
- Garder l'ancienne `follow_accepted` (`ON CONFLICT DO NOTHING`) : rien à écrire, mais une nouvelle acceptation n'apparaît pas dans l'Activité du demandeur. Non retenu.
- Écrire l'acceptation automatique dans le module `identity` : aucun import de `social`, mais la règle d'acceptation et ses notifications en double. Non retenu.
- `UpdateSettings` qui importe la fonction d'acceptation du module `social` : moins de code, mais contraire à ADR-005 (écriture dans les tables d'un autre module par import). Non retenu par le lead dev.
- Un use case `AcceptAllFollowRequests` du module `social`, appelé par la route des paramètres après `UpdateSettings` : aucun port de plus, mais acceptation hors de la transaction du passage en public, contraire à ADR-006. Non retenu par le lead dev.
- Ajouter un total au contrat de `GET /v1/me/follow-requests`, ou compter les groupes `follow_request` de l'Activité : titre exact, mais champ absent de la fiche, ou nombre faussé par la pagination de l'Activité. Non retenu.

## Conséquences
### Positives
- Aucune rupture de contrat : une app non recompilée continue de décoder les réponses ; elle n'affiche simplement pas l'état « Demandé ».
- Une seule règle d'acceptation, testée une fois, pour l'acceptation manuelle et le passage en public, dans la même transaction que le changement de paramètre (ADR-006), sans import entre modules (ADR-005).
- Une notification existe si et seulement si l'action existe, comme le veut ADR-026, y compris après un retrait d'abonné ou un blocage.

### Négatives
- Un port transverse de plus (`FollowRequestAccepter`) dans `shared/application`, utilisé par un seul use case.
- Une demande envoyée pendant le passage en public (lecture de `is_private` sans verrou) peut rester en attente vers un compte devenu public : elle reste visible dans ses demandes, acceptable ou annulable. Verrouiller le profil visé dans `FollowUser` créerait un risque d'interblocage avec la mise à jour des compteurs.
- Passer en public avec beaucoup de demandes en attente écrit deux notifications et met à jour les compteurs une fois par demandeur, dans une seule transaction.
- Le titre de la section ne donne pas le total exact au-delà de la première page (« 20+ »).

## Liens
- ADR-005 (*scope* de transaction, modules)
- ADR-006 (demandes d'abonnement, visibilité, blocage)
- ADR-019 (compatibilité du contrat)
- ADR-020 (mises à jour optimistes)
- ADR-026 (notifications in-app)
- ADR-030 (type de notification en liste ouverte, retrait au blocage)
- [T20 — #31](https://github.com/Kicksbld/clone_instagram/issues/31)
