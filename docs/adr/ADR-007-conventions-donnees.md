# ADR-007 — Conventions du modèle de données

## Statut
Proposé

## Contexte
Le schéma Postgres est partagé par l'API et le worker (`packages/db`) et sera écrit en grande partie par l'IA, module par module. Sans conventions fixées dès la première migration, chaque table suivrait ses propres choix (identifiants, énumérations, suppression, pagination), avec des migrations difficiles à corriger ensuite.

Le feed chronologique doit rester exact pendant le scroll, et les données doivent vraiment disparaître lors d'une suppression de compte.

Décisions sources : D12, D13, D15.

## Décision
- **Migrations uniquement via drizzle-kit**, versionnées ; jamais de modification d'une migration appliquée, ni du schéma depuis le Studio ; jamais de modification du schéma `auth`.
- **Identifiants** : UUID v7 générés par l'application.
- **Dates** : `timestamptz` en UTC.
- **Énumérations** : `text` + contrainte `CHECK` (pas d'`enum` Postgres).
- **Pas de clé étrangère polymorphe** : une table de like par cible (`post_likes`, `comment_likes`) ; colonnes nullables + `CHECK` « exactement une » quand une ligne vise plusieurs types.
- **Posts et reels dans une seule table `posts`** (colonne `kind`), car tout l'engagement s'applique aux deux.
- **Compteurs dénormalisés**, incrémentés dans la même transaction que l'écriture.
- **Suppression** : logique (`deleted_at`) pour posts, commentaires, stories ; réelle pour un compte (job de purge).
- **Pagination par curseur** opaque `(created_at, id)` encodé en base64, jamais `OFFSET` ; réponse `{ items, nextCursor }`.
- **Feed d'accueil chronologique** (comptes suivis + soi-même), sans recommandation ni fan-out à l'écriture ; index définis dans `03` § 6.2 et validés par `EXPLAIN ANALYZE` sur des données de seed.

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

## Liens
- ADR-005 (`UnitOfWork` pour les compteurs)
- ADR-006 (visibilité dans les requêtes de liste)
- ADR-008 (machine à états des médias)
