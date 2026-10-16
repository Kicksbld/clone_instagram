# ADR-028 — Feed avec republications : union des posts et des republications, triée par date d'activité

## Statut
Proposé

## Contexte
La P2 ajoute la republication d'un post ou d'un reel : elle apparaît dans un onglet « Republications » du profil et dans le feed des abonnés de celui qui republie, avec la mention « username a republié ».

Le feed d'accueil actuel (ADR-007) ne lit qu'une source : les posts des comptes suivis et les siens, triés par `(created_at, id)`. Avec les republications, un même post peut arriver par plusieurs chemins (son auteur est suivi, et un ou plusieurs comptes suivis l'ont republié), à une date qui n'est pas celle de sa publication.

Contraintes :
- pagination par curseur exacte, sans doublon ni saut, jamais `OFFSET` (ADR-007) ;
- visibilité unique (ADR-006) : le post republié et celui qui republie doivent tous deux être visibles ;
- réponses tolérantes : l'app actuelle doit continuer à lire le feed (ADR-019) ;
- requête de feed partagée avec le module `posts` (`selectPosts`).

Décision source : D46.

## Décision
- **Table `reposts`** (module `posts`) : `user_id`, `post_id`, `created_at` (`timestamptz(3)`), clé primaire `(user_id, post_id)`. Index `reposts (user_id, created_at DESC)` et `(post_id)`. Compteur `posts.repost_count` mis à jour dans la même transaction (ADR-007).
- **Règles** : `PUT` / `DELETE /v1/posts/{id}/repost`, idempotents. On ne republie pas son propre post. Seul un post d'un compte **public** peut être republié (comme Instagram) ; si son auteur passe ensuite en privé, la republication n'est plus visible des non-abonnés de l'auteur (`canViewContent`). Notification `repost` à l'auteur (ADR-026).
- **Feed = union de deux sources**, triée sur une **date d'activité** :
  - les posts des comptes suivis et les siens, avec `activity_at = posts.created_at` ;
  - les republications des comptes suivis, avec `activity_at = reposts.created_at`, sauf celles d'un post que le lecteur voit déjà par la première source (auteur suivi, ou soi-même) ;
  - **un post n'apparaît qu'une fois** : parmi plusieurs republications du même post, seule la plus récente est gardée (`DISTINCT ON (post_id)`), avec son auteur comme « republié par ».
- **Visibilité** : pour une republication, `canViewProfile` de celui qui republie **et** `canViewContent` de l'auteur du post ; posts supprimés et auteurs non actifs exclus, comme aujourd'hui.
- **Curseur** : couple `(activity_at, post_id)` du dernier élément, encodé en base64 et opaque (ADR-007). Un post qui reçoit une nouvelle republication pendant le scroll remonte en tête, au prochain rafraîchissement ; il n'apparaît pas une seconde fois plus bas, car seule sa date d'activité la plus récente existe.
- Requête de principe, à écrire en Drizzle dans `selectPosts` (ou une variante dédiée au feed) et à valider par `EXPLAIN ANALYZE` sur le seed :

```sql
WITH own AS (
  SELECT p.id AS post_id, p.created_at AS activity_at, NULL::uuid AS reposted_by
  FROM posts p
  WHERE p.deleted_at IS NULL
    AND (p.author_id = :me OR p.author_id IN (SELECT followee_id FROM follows WHERE follower_id = :me))
), shared AS (
  SELECT DISTINCT ON (r.post_id) r.post_id, r.created_at AS activity_at, r.user_id AS reposted_by
  FROM reposts r
  WHERE r.user_id IN (SELECT followee_id FROM follows WHERE follower_id = :me)
    AND r.post_id NOT IN (SELECT post_id FROM own)
  ORDER BY r.post_id, r.created_at DESC
)
SELECT * FROM (SELECT * FROM own UNION ALL SELECT * FROM shared) feed
-- + visibilité (blocages, auteurs et « republié par » actifs, canViewContent de l'auteur)
WHERE (feed.activity_at, feed.post_id) < (:cursor_activity_at, :cursor_post_id)
ORDER BY feed.activity_at DESC, feed.post_id DESC
LIMIT 12;
```

- **Contrat** : chaque élément du feed garde la forme actuelle du post et reçoit un champ optionnel `repostedBy` (aperçu du profil : `id`, `username`, avatar), absent pour un post qui n'est pas une republication. Ajout compatible (ADR-019), sans nouvelle version du feed.
- **Profil** : `GET /v1/users/{id}/reposts`, republications d'un compte, de la plus récente à la plus ancienne, curseur `(reposts.created_at, post_id)`, avec la même visibilité.
- **Côté app** : `PostView` (`DesignSystem`) affiche « username a republié » au-dessus du post quand `repostedBy` est présent ; bouton Republier optimiste (ADR-020) ; onglet « Republications » sur le profil.
- **Explorer (P2)** n'est pas concerné : grille des posts publics récents, sans republications.
- **Cas limites** (ADR-014) : post republié par deux comptes suivis (une seule fois, la plus récente), post d'un auteur suivi republié (une seule fois, à sa date de publication), auteur passé en privé après la republication, republieur bloqué, post supprimé, republication de son propre post refusée, curseur invalide.

## Alternatives
- Republications affichées seulement sur le profil, pas dans le feed : aucune modification du feed, mais différent d'Instagram et du périmètre. Non retenu.
- Une ligne de feed par republication (doublons autorisés) : requête plus simple, mais le même post affiché plusieurs fois dans le feed. Non retenu.
- Fan-out à l'écriture (timeline précalculée par abonné) : lecture triviale, mais écriture coûteuse et inutile à notre échelle. Écarté (D15).
- Republication enregistrée comme un nouveau post qui référence l'original : une seule source pour le feed, mais l'engagement serait éclaté entre deux posts. Non retenu.

## Conséquences
### Positives
- Republications dans le feed sans doublon, avec une pagination par curseur exacte.
- Contrat compatible : l'app actuelle continue de lire le feed.
- Engagement (likes, commentaires) toujours rattaché au post d'origine.

### Négatives
- Requête de feed plus complexe et plus coûteuse (union, `DISTINCT ON`, visibilité sur deux comptes).
- Le curseur du feed porte désormais une date d'activité ; il garde le même format (date, identifiant du post), donc un curseur émis avant le déploiement reste lisible, mais la page suivante peut contenir des republications plus anciennes que la page déjà affichée.
- Un post peut remonter en tête du feed à chaque nouvelle republication.

## Liens
- ADR-006 (visibilité de l'auteur et de celui qui republie)
- ADR-007 (requête du feed, curseur, index)
- ADR-014 (cas limites)
- ADR-019 (champ `repostedBy` optionnel)
- ADR-020 (republication optimiste)
- ADR-026 (notification `repost`)
