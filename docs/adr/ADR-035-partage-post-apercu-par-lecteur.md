# ADR-035 — Partage de post : aperçu résolu par lecteur, référence conservée après suppression

## Statut
Proposé

## Contexte
T29 permet d'envoyer un post ou un reel à plusieurs comptes en message privé. ADR-006 et ADR-023 imposent de relire le contenu avec la visibilité du lecteur : un destinataire peut ne pas suivre l'auteur privé alors que l'expéditeur le suit. Un message reste dans l'historique après la suppression du post.

## Décision
- Le module `messaging` possède son port `SharedPostReader`, sans import du module `posts`. Son adapter lit le post non supprimé, son auteur et le premier média ; `SharedPosts` applique `canViewContent`.
- L'aperçu expose `id`, `kind` ouvert, `caption`, `author` (`id`, `username`) et `thumbnail` facultatif. Le message conserve `kind = post_share` et `sharedPostId` ; `sharedPost` est `null` pour un contenu supprimé ou invisible.
- La résolution s'applique aux historiques, rattrapages, derniers messages des conversations, réponses d'envoi et réouvertures de conversation. `message.created` est résolu séparément pour chacun des deux membres, après la transaction ; aucun aperçu commun aux deux comptes.
- La visibilité de l'expéditeur est vérifiée avant un nouvel envoi. Un renvoi avec le même `clientId` restitue le message existant, avec l'aperçu relu ; la disparition du post ne crée ni doublon ni nouvel événement.
- `shared_post_id` est une référence sans clé étrangère : la purge du post ne supprime ni ne bloque le message. Le `CHECK` exige cette référence uniquement pour `post_share`, avec `body` facultatif (stocké vide) et sans média privé.
- L'app envoie un message par destinataire, avec un `clientId` distinct conservé pour ses tentatives. Les échecs sont indépendants ; le store optimiste existant porte les messages en attente et leur référence.

## Alternatives
- Copier l'aperçu à l'envoi : ne respecte pas les changements de visibilité et la suppression (ADR-023).
- Publier l'aperçu de l'expéditeur aux deux membres : révèle le contenu d'un auteur privé au destinataire non abonné.
- Conserver la clé étrangère existante sans action de suppression : empêche la purge d'un post partagé ; supprimer le message en cascade contredit ADR-023.

## Conséquences
### Positives
- La même politique protège chaque canal de lecture, y compris le temps réel et l'inbox.
- Le message subsiste lorsque le contenu devient indisponible, et les renvois restent idempotents.

### Négatives
- Les aperçus demandent des lectures supplémentaires et une résolution distincte par destinataire en temps réel.
- La base ne garantit plus l'existence du post référencé ; cette absence est un état normal du message.

## Liens
- [T29 — issue #40](https://github.com/Kicksbld/clone_instagram/issues/40)
- ADR-006 (visibilité)
- ADR-007 (références de contenu)
- ADR-019 (réponses tolérantes)
- ADR-020 (optimisme)
- ADR-023 (messagerie)
