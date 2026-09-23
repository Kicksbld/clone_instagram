# ADR-007 — Conventions du modèle de données

## Statut
Proposé

## Contexte
Le schéma Postgres est partagé par l'API et le worker (`packages/db`) et sera écrit en grande partie par l'IA, module par module. Sans conventions fixées dès la première migration, chaque table suivrait ses propres choix (identifiants, énumérations, suppression, pagination), avec des migrations difficiles à corriger ensuite.

Le feed chronologique doit rester exact pendant le scroll, et les données doivent vraiment disparaître lors d'une suppression de compte.

Décisions sources : D12, D13, D15.

## Décision
- **Migrations uniquement via drizzle-kit**, versionnées ; jamais de modification d'une migration appliquée (on en ajoute une nouvelle), ni du schéma depuis le Studio ; jamais de modification du schéma `auth`. Le schéma Drizzle de `packages/db` est la référence ; la fiche de tranche indique les tables et colonnes à ajouter.
- **Identifiants** : UUID v7 générés par l'application (triés dans le temps, favorables aux index).
- **Dates** : `timestamptz` en UTC. Les colonnes qui servent de curseur de pagination (`created_at`) sont en précision milliseconde (`timestamptz(3)`, `precision: 3` dans Drizzle), la précision des dates JavaScript : avec la précision microseconde par défaut de Postgres, le curseur, arrondi à la milliseconde, sauterait ou dupliquerait des éléments.
- **Énumérations** : `text` + contrainte `CHECK` (pas d'`enum` Postgres).
- **Username** : 1 à 30 caractères `[a-z0-9._]`, stocké en minuscules, unique.
- **Pas de clé étrangère polymorphe** : une table de like par cible (`post_likes`, `comment_likes`) ; colonnes nullables + `CHECK` « exactement une » quand une ligne vise plusieurs types (ex. `reports`, `mentions`).
- **Posts et reels dans une seule table `posts`** (colonne `kind`), car tout l'engagement s'applique aux deux.
- **Compteurs dénormalisés** (`follower_count`, `post_count`, `like_count`…), incrémentés de façon atomique dans la même transaction que l'écriture.
- **Suppression** : logique (`deleted_at`) pour posts, commentaires, stories, et toutes les lectures filtrent `deleted_at IS NULL` ; réelle pour un compte (job de purge, ADR-008).
- **Pagination par curseur** : couple `(created_at, id)` du dernier élément, encodé en base64 et opaque pour le client ; l'`id` départage deux éléments créés au même instant ; jamais `OFFSET` ; réponse `{ items, nextCursor }`. Un curseur invalide est rejeté en `400`.
- **Feed d'accueil chronologique** : posts et reels des comptes suivis + ses propres posts, non supprimés, auteurs visibles (ni bloqués dans un sens ou dans l'autre, ni non actifs), du plus récent au plus ancien. Pas de recommandation ni de fan-out à l'écriture. Requête de principe, à écrire en Drizzle et à valider par `EXPLAIN ANALYZE` sur les données de seed :

```sql
SELECT p.*
FROM posts p
WHERE p.deleted_at IS NULL
  AND (p.author_id = :me
       OR p.author_id IN (SELECT followee_id FROM follows WHERE follower_id = :me))
  AND p.author_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = :me
                          UNION SELECT blocker_id FROM blocks WHERE blocked_id = :me)
  -- + exclusion des auteurs dont le statut n'est pas active
  AND (p.created_at, p.id) < (:cursor_created_at, :cursor_id)
ORDER BY p.created_at DESC, p.id DESC
LIMIT 20;
```

- **Index** :

| Index | Usage |
|---|---|
| `posts (author_id, created_at DESC, id DESC) WHERE deleted_at IS NULL` | Feed, grille du profil |
| `posts (kind, created_at DESC, id DESC) WHERE deleted_at IS NULL` | Onglet Reels (P1) |
| `follows` PK `(follower_id, followee_id)` + index `(followee_id)` | Abonnements / abonnés |
| `blocks` PK `(blocker_id, blocked_id)` + index `(blocked_id)` | Politique de visibilité |
| `comments (post_id, created_at) WHERE parent_id IS NULL` | Commentaires d'un post |
| `stories (author_id, expires_at)` | Stories actives (P1) |
| `messages (conversation_id, created_at DESC, id DESC)` | Historique d'une conversation (P1) |
| `notifications (recipient_id, created_at DESC)` | Onglet Activité (P1) |
| `profiles USING gin (username gin_trgm_ops)` | Recherche d'utilisateurs (`pg_trgm`) |

- **Seed** (`pnpm db:seed`) : une centaine d'utilisateurs, des relations d'abonnement et des posts avec images d'exemple, pour tester le feed et valider les index.

## Alternatives
- Table `likes` polymorphe : une seule table, mais aucune intégrité référentielle garantie par la base. Écarté (D13).
- Deux tables `posts` et `reels` : séparation nette, mais toutes les tables d'engagement doublées. Écarté (D12).
- Pagination par `OFFSET` : plus simple, mais doublons pendant le scroll et lectures inutiles sur les grandes pages. Écarté (D15).
- Algorithme de recommandation ou fan-out à l'écriture : plus proche d'Instagram, mais hors périmètre et inutile à notre échelle. Écarté (D15).
- `enum` Postgres : typage fort en base, mais plus difficile à migrer. Non retenu.

## Conséquences
### Positives
- Intégrité garantie par la base ; migrations homogènes.
- Pagination exacte et performante.
- Suppression de compte conforme (données réellement effacées).

### Négatives
- Compteurs dénormalisés à maintenir avec soin dans chaque use case d'écriture.
- Plus de tables (une par cible de like).
- Toutes les lectures doivent filtrer `deleted_at`.
- Dates des colonnes de curseur limitées à la milliseconde ; toute nouvelle colonne de curseur doit déclarer cette précision.
- Republications (P2) : le feed devra devenir l'union de deux sources triée sur une date d'activité.

## Liens
- ADR-004 (RLS sans policy sur chaque nouvelle table)
- ADR-005 (`UnitOfWork` pour les compteurs)
- ADR-006 (visibilité dans les requêtes de liste)
- ADR-008 (machine à états des médias)
