# packages/contract — conventions

Contrat unique, contract-first : [ADR-003](../../docs/adr/ADR-003-contrat-openapi-contract-first.md).

- `openapi.yaml` (OpenAPI 3.1) est la **seule source de vérité** des échanges avec l'app iOS et le backoffice (REST et, à partir de la P1, événements WebSocket). Les messages internes API ↔ worker sont dans `packages/jobs` (ADR-015).
- Chemins écrits en entier : routes métier sous `/v1/…` ; `GET /health` est hors version. `servers` reste `/`.
- Sécurité `bearerAuth` par défaut ; une route publique déclare `security: []`.
- Erreurs : réponse `application/problem+json` avec le schéma `ProblemDetails` et un `code` stable, ajouté au tableau des codes de la description.
- Pagination, identifiants, dates, codes HTTP : conventions d'ADR-003 et d'ADR-007.

## Procédure

1. Modifier `openapi.yaml` (seulement les endpoints et champs listés dans la fiche de la tranche).
2. `pnpm contract:generate` : validation Redocly, puis régénération de `generated/openapi.json` (lu par l'API pour valider les entrées) et `generated/schema.d.ts` (types de l'API et du backoffice).
3. Faire relire le diff de `openapi.yaml` avant d'implémenter.
4. Versionner les fichiers générés : la CI vérifie qu'ils sont à jour.

## Interdits

- Modifier `generated/` à la main.
- Endpoint ou champ inventé, absent de la fiche.
- Avertissement Redocly laissé sans correction ni entrée justifiée dans `.redocly.lint-ignore.yaml`.
- Schéma d'objet sans `additionalProperties: false` pour une entrée.
