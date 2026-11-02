# ADR-029 — Onglet Amis des Reels : interactions des abonnés mutuels calculées à la lecture

## Statut
Proposé

## Contexte
L'onglet Reels d'Instagram a deux sous-onglets : « Reels » et « Amis » (lancé mondialement en août 2025). L'onglet Amis montre les reels que les abonnés mutuels ont créés, aimés, commentés ou republiés, avec leurs photos de profil sur chaque reel ; un réglage « Activité dans l'onglet Amis » permet de dire qui voit ses J'aime et ses commentaires (abonnés mutuels par défaut, ou personne). Le lead dev veut ces deux sous-onglets en P1, l'onglet « Reels » restant chronologique.

Contraintes :
- tous les fils sont chronologiques, sans recommandation ni fan-out à l'écriture (D15) ;
- pagination par curseur exacte, sans doublon ni saut, jamais `OFFSET` (ADR-007) ;
- visibilité unique (ADR-006) : le reel, l'ami et son interaction doivent être visibles du lecteur ;
- une interaction retirée (J'aime retiré, commentaire supprimé) ne doit plus apparaître ;
- les J'aime et les commentaires d'un compte sont exposés à ses amis : il faut un réglage pour s'y opposer.

Sources : comportement d'Instagram vérifié dans des guides tiers datés d'août 2025 à avril 2026 (la page officielle n'a pas pu être lue). Décision source : D51.

## Décision
- **Deux sous-onglets** en haut de l'onglet Reels :
  - **Reels** : reels visibles du lecteur, venant des comptes publics et des comptes qu'il suit (privés compris), ses propres reels exclus, comptes bloqués et non actifs exclus, du plus récent au plus ancien ; `GET /v1/reels/feed`, curseur `(created_at, id)`, pages de 10 ;
  - **Amis** : `GET /v1/reels/friends`, décrit ci-dessous.
- **Ami** = abonné mutuel (`isMutual`, ADR-006).
- **Interaction d'ami** : un abonné mutuel a **créé**, **aimé** ou **commenté** un reel (P1) ; **republié** en P2 (ADR-028).
- **Onglet Amis = union de trois sources (quatre en P2), calculée à la lecture**, sans table stockée :
  - reels créés par un ami (`posts.created_at`) ;
  - reels aimés par un ami (`post_likes.created_at`), si l'ami n'a pas désactivé le réglage ;
  - reels commentés par un ami (date de son commentaire le plus récent, commentaire non supprimé), si l'ami n'a pas désactivé le réglage ;
  - (P2) reels republiés par un ami (`reposts.created_at`).
- **Un reel n'apparaît qu'une fois** (`DISTINCT ON (post_id)`), à la **date de l'interaction d'ami la plus récente** (`activity_at`) ; du plus récent au plus ancien, curseur `(activity_at, post_id)` encodé en base64 et opaque (ADR-007), pages de 10. Même principe que le feed avec républications (ADR-028).
- **Exclusions** : ses propres reels et ses propres interactions ; reels supprimés ; reel invisible du lecteur (`canViewContent` de l'auteur : un ami qui aime le reel d'un compte privé que le lecteur ne suit pas ne le fait pas apparaître) ; amis et auteurs bloqués (dans un sens ou dans l'autre) ou non actifs.
- **Retrait immédiat** : rien n'est stocké, donc un J'aime retiré, un commentaire supprimé ou un abonnement mutuel rompu disparaît de l'onglet au chargement suivant.
- **Réponse** : chaque élément garde la forme actuelle du post et reçoit `friendInteractions` : jusqu'à 3 aperçus `{ user (id, username, avatar), kinds: ['created' | 'liked' | 'commented'], commentText? }`, du plus récent au plus ancien, et `friendInteractionCount` (nombre total d'amis). Champs optionnels, absents hors de l'onglet Amis (ADR-019).
- **Liste complète des amis d'un reel** : `GET /v1/reels/{id}/friend-interactions`, mêmes règles de visibilité et de réglage, pour la feuille ouverte depuis le reel.
- **Réglage de confidentialité** : colonne `profiles.friends_tab_activity` (`mutuals` | `nobody`, défaut `mutuals`, `text` + `CHECK`, ADR-007) ; modifiable par `PATCH /v1/me/settings` `{ friendsTabActivity }`, dont le corps accepte désormais l'un ou l'autre de `isPrivate` et `friendsTabActivity` (au moins un, contrainte assouplie sur une entrée : compatible, ADR-019) ; renvoyé par `GET /v1/me`. Avec `nobody`, les J'aime et commentaires du compte n'alimentent plus l'onglet Amis de personne ; ses propres reels continuent d'y apparaître (contenus déjà visibles de ses abonnés).
- **Requête de principe**, à écrire en Drizzle dans le module `feed` et à valider par `EXPLAIN ANALYZE` sur le seed :

```sql
WITH friends AS (
  SELECT f.followee_id AS id FROM follows f
  JOIN follows b ON b.follower_id = f.followee_id AND b.followee_id = :me
  WHERE f.follower_id = :me
), interactions AS (
  SELECT p.id AS post_id, p.author_id AS friend_id, p.created_at AS at, 'created' AS kind
    FROM posts p WHERE p.kind = 'reel' AND p.author_id IN (SELECT id FROM friends)
  UNION ALL
  SELECT l.post_id, l.user_id, l.created_at, 'liked'
    FROM post_likes l JOIN profiles pr ON pr.id = l.user_id AND pr.friends_tab_activity = 'mutuals'
    WHERE l.user_id IN (SELECT id FROM friends)
  UNION ALL
  SELECT c.post_id, c.author_id, max(c.created_at), 'commented'
    FROM comments c JOIN profiles pr ON pr.id = c.author_id AND pr.friends_tab_activity = 'mutuals'
    WHERE c.author_id IN (SELECT id FROM friends) AND c.deleted_at IS NULL
    GROUP BY c.post_id, c.author_id
), latest AS (
  SELECT DISTINCT ON (post_id) post_id, at AS activity_at FROM interactions
  ORDER BY post_id, at DESC
)
SELECT … FROM latest JOIN posts p ON p.id = latest.post_id AND p.kind = 'reel' AND p.deleted_at IS NULL
-- + visibilité (canViewContent de l'auteur, blocages, comptes actifs, ses propres reels exclus)
WHERE (latest.activity_at, latest.post_id) < (:cursor_activity_at, :cursor_post_id)
ORDER BY latest.activity_at DESC, latest.post_id DESC
LIMIT 10;
```

- **Index** ajoutés : `post_likes (user_id, created_at DESC)` et `comments (author_id, created_at DESC)`.
- **Côté app** (feature `Reels`) : sélecteur « Reels » / « Amis » en haut de l'onglet ; sur un reel de l'onglet Amis, jusqu'à 3 photos de profil et une phrase (« **léa** a aimé », « **léa** et 2 autres amis ont interagi ») ; un appui ouvre une feuille listant les amis et leur interaction (« a aimé », « a commenté : texte », « a créé »), chaque ligne ouvre le profil. Réglage dans Paramètres > Confidentialité > « Activité dans l'onglet Amis ».
- **Hors périmètre** : recommandations « Blend », masquer l'interaction d'un ami en particulier, répondre en message privé depuis la feuille des amis, posts photo dans l'onglet Amis.
- **Cas limites** (ADR-014) : reel aimé par deux amis (une seule fois, à la date la plus récente), J'aime retiré, ami qui passe son réglage à `nobody`, abonnement mutuel rompu, reel d'un compte privé non suivi aimé par un ami, ami bloqué, auteur bloqué, propre reel aimé par un ami (exclu), curseur invalide.

## Alternatives
- Onglet Reels unique, chronologique : rien à ajouter, mais différent d'Instagram. Non retenu par le lead dev.
- Fan-out à l'écriture (table d'interactions par lecteur, alimentée à chaque J'aime ou commentaire) : lecture triviale, mais écriture multipliée par le nombre d'amis, et retrait (unlike, rupture d'abonnement, changement de réglage) à propager partout. Écarté (D15).
- Table d'interactions dédiée, alimentée par les use cases d'engagement : une seule source à lire, mais une copie de `post_likes` et `comments` à garder cohérente. Non retenu.
- Une ligne par interaction (un reel aimé par trois amis affiché trois fois) : requête plus simple, mais doublons dans l'onglet. Non retenu.
- Pas de réglage de confidentialité : plus simple, mais les J'aime d'un compte exposés sans possibilité de s'y opposer. Non retenu.

## Conséquences
### Positives
- Onglet Amis fidèle à Instagram, sans traitement en arrière-plan ni table supplémentaire.
- Une interaction retirée disparaît immédiatement, par construction.
- Même principe de date d'activité et de curseur que le feed avec républications (ADR-028).

### Négatives
- Requête coûteuse (abonnés mutuels, trois sources, `DISTINCT ON`, visibilité) : à valider par `EXPLAIN ANALYZE` sur le seed, deux index de plus.
- Un reel peut remonter en tête de l'onglet à chaque nouvelle interaction d'ami.
- Les J'aime et commentaires d'un compte sont visibles de ses amis par défaut.

## Liens
- ADR-006 (`isMutual`, `canViewContent`, blocage)
- ADR-007 (curseur, index, `text` + `CHECK`)
- ADR-014 (cas limites)
- ADR-019 (champs optionnels, entrée assouplie)
- ADR-024 (lecture des reels)
- ADR-028 (date d'activité ; républications dans l'onglet Amis en P2)
