# ADR-003 — Contrat OpenAPI unique, contract-first, clients générés

## Statut
Proposé

## Contexte
Trois produits (app iOS en Swift, API et backoffice en TypeScript) échangent des données. Écrire les types à la main de chaque côté crée des dérives : champ renommé d'un côté seulement, endpoint inventé par l'IA, format d'erreur incohérent.

L'objectif pédagogique est de bien développer avec l'IA, en s'appuyant sur des garde-fous automatiques.

Décision source : D18.

## Décision
- `packages/contract/openapi.yaml` est **l'unique source de vérité** des échanges : endpoints REST **et** schémas des événements WebSocket.
- Workflow **contract-first** : modifier la spec → la valider (Redocly CLI) → régénérer (`pnpm contract:generate`) → implémenter.
- La spec grandit tranche par tranche : la fiche de la tranche liste les endpoints à ajouter ; leur forme exacte est écrite dans `openapi.yaml` et relue par le lead dev avant l'implémentation.
- Génération :
  - client Swift : `swift-openapi-generator` (plugin de build, à partir d'une copie de la spec, transport `URLSession`) ;
  - types de l'API : `openapi-typescript` ;
  - client du backoffice : `openapi-typescript` + `openapi-fetch`.
- **Conventions communes** :

| Sujet | Règle |
|---|---|
| Base | `/v1`, JSON, UTF-8 ; dans `openapi.yaml`, chemins écrits en entier (`/v1/…`) et `servers` à `/`, car le client `openapi-fetch` (une seule `baseUrl`) et `swift-openapi-generator` (qui ignore les `servers` par route) ne gèrent pas une route hors `/v1` autrement |
| Authentification | `Authorization: Bearer <JWT Supabase>` sur tous les endpoints sauf `GET /health` |
| Santé | `GET /health`, hors `/v1`, sans authentification : liveness `200 { status: "ok" }`, sans interroger Postgres ni Redis |
| Identifiants | UUID v7 |
| Dates | ISO 8601 UTC |
| Pagination | `?cursor=<opaque>&limit=<1..50>` (défaut 20) → `{ items: [...], nextCursor: string \| null }` ; curseur défini dans ADR-007 |
| Erreurs | *Problem Details* (RFC 9457) : `{ type, title, status, detail, code }`, avec un `code` stable (ex. `username_taken`, `profile_not_found`, `media_not_ready`, `plus_required`, `account_suspended`) |
| Validation | Toute entrée est validée contre le schéma ; les champs inconnus sont rejetés |
| Idempotence | Like, save, follow, block : `PUT` / `DELETE`, naturellement idempotents ; envoi de message (P1) : `clientId` |
| Visibilité | Un contenu invisible pour l'appelant renvoie **404**, pas 403 (ADR-006) |
| Rate limiting | `429` avec en-tête `Retry-After` (limites : ADR-005) |

- Codes HTTP : `200`, `201`, `204`, `400` (validation), `401` (non authentifié), `403` (compte suspendu ou banni : `account_suspended` ; rôle manquant ; abonnement Plus requis : `plus_required`), `404`, `409` (conflit : username pris, transition invalide), `422` (règle métier), `429`.
- Il est interdit d'inventer un endpoint ou un champ absent de la spec.
- La CI valide la spec à chaque push.

## Alternatives
- Types écrits à la main de chaque côté : aucun outillage, mais dérives inévitables entre les produits, surtout avec du code généré par IA. Écarté (D18).
- Code-first (spec générée depuis les routes Fastify) : pas de double saisie, mais le contrat n'existe qu'une fois le backend écrit, ce qui empêche de concevoir l'échange avant d'implémenter les deux côtés. Non retenu.

## Conséquences
### Positives
- Un changement de contrat casse la compilation de tous les clients concernés.
- L'IA a une référence exécutable et ne peut pas inventer de champ sans que cela se voie.
- Le format des erreurs et de la pagination est identique partout.

### Négatives
- Chaque évolution passe par une étape supplémentaire (spec, validation, régénération).
- Le code généré (surtout en Swift) doit être converti en modèles de l'app par les services.

## Liens
- ADR-001 (le contrat est la première étape de chaque tranche)
- ADR-005 (validation des entrées, rate limiting)
- ADR-006 (404 pour un contenu invisible)
- ADR-007 (curseur de pagination)
- ADR-010 (conversion DTO → modèles dans l'app)
- ADR-011 (client `openapi-fetch` du backoffice)
