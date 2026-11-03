# ADR-034 — Bandeau des stories : une seule réponse non paginée, 100 auteurs au plus

## Statut
Proposé

## Contexte
ADR-025 définit `GET /v1/stories/tray` (auteurs, soi-même et comptes suivis, ayant une story active visible) et son ordre : sa propre story d'abord, puis les auteurs ayant une story non vue, puis les autres ; dans chaque groupe, de la story la plus récente à la plus ancienne. Il ne dit pas si la réponse est paginée.

Contraintes :
- ADR-007 impose la pagination par curseur `(created_at, id)` pour les listes, jamais `OFFSET` ;
- l'ordre du bandeau dépend de l'état vu / non vu, qui change pendant la lecture : un curseur `(created_at, id)` ne suit pas cet ordre, et un auteur passerait d'un groupe à l'autre entre deux pages ;
- la requête du bandeau combine abonnements, audience, blocages et vues ; elle est validée par `EXPLAIN ANALYZE` sur le seed (ADR-025).

Point remonté au lead dev pendant T24 (#35).

## Décision
- `GET /v1/stories/tray` renvoie une seule réponse `{ items }`, **sans curseur**, avec **100 auteurs au plus** (`maxItems: 100` dans le contrat, `STORY_TRAY_LIMIT` dans le module `ephemeral`).
- Les 100 premiers auteurs sont pris dans l'ordre du bandeau d'ADR-025 : sa propre story et les auteurs non vus passent avant les auteurs vus.
- Choix du lead dev en T24.

## Alternatives
- Pagination par curseur : conforme à ADR-007, mais le curseur `(created_at, id)` ne suit pas l'ordre vu / non vu, et un auteur vu entre deux pages changerait de groupe. Non retenu.
- Réponse non paginée sans plafond : plus simple, mais la taille de la réponse et le coût de la requête grandissent avec le nombre de comptes suivis ayant une story. Non retenu.

## Conséquences
### Positives
- L'ordre du bandeau reste exact : il est calculé en une seule requête.
- Taille de la réponse bornée, quel que soit le nombre de comptes suivis.

### Négatives
- Au-delà de 100 auteurs, les auteurs vus les plus anciens n'apparaissent pas dans le bandeau ; leurs stories restent accessibles depuis leur profil (`GET /v1/users/{id}/stories`).
- Exception à la règle de pagination d'ADR-007 pour cette lecture.

## Liens
- ADR-025 (bandeau des stories)
- ADR-007 (pagination par curseur)
