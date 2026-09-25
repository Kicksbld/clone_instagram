# apps/api — conventions

Architecture hexagonale par module : [ADR-005](../../docs/adr/ADR-005-backend-fastify-hexagonal.md). Contrat et erreurs : [ADR-003](../../docs/adr/ADR-003-contrat-openapi-contract-first.md). Données : [ADR-007](../../docs/adr/ADR-007-conventions-donnees.md). Jobs : [ADR-015](../../docs/adr/ADR-015-contrat-jobs-api-worker.md).

## Où mettre quoi

| Fichier | Emplacement |
|---|---|
| Entité, règle, erreur métier d'un module | `src/modules/<module>/domain/` |
| Port (interface) d'un module | `src/modules/<module>/application/ports/` |
| Use case (un fichier par intention) | `src/modules/<module>/application/use-cases/` |
| Route HTTP | `src/modules/<module>/infrastructure/http/` |
| Adapter Drizzle | `src/modules/<module>/infrastructure/persistence/` |
| Visibilité, erreurs de base (`DomainError`…) | `src/shared/domain/` |
| Ports transverses (`UnitOfWork`, `Clock`, `IdGenerator`, `JobQueue`, `RelationshipReader`…) | `src/shared/application/` |
| Config, gestion d'erreurs, schémas du contrat, auth, adapter BullMQ | `src/shared/infrastructure/` |
| Assemblage des dépendances | `src/main.ts` (manuel, sans conteneur DI) ; l'app HTTP est construite par `src/app.ts` |
| Tests | `test/` (Vitest ; routes via `fastify.inject`) |

## Recettes

- **Nouvelle route** : écrire l'opération dans `packages/contract/openapi.yaml`, lancer `pnpm contract:generate`, puis déclarer la route avec `schema: routeSchemaFor('<operationId>')` (`shared/infrastructure/http/contract-schemas.ts`). Validation et champs inconnus : gérés par ce schéma.
- **Erreur métier** : lever une sous-classe de `DomainError` (`NotFoundError`, `ForbiddenError`, `ConflictError`, `BusinessRuleError`) avec un `code` stable documenté dans le contrat. Le gestionnaire unique la convertit en Problem Details.
- **Authentification** : toute route `/v1` est enregistrée dans le scope de `app.ts`, qui vérifie le JWT Supabase (ES256, JWKS, ADR-018) ; la route lit l'utilisateur par `authenticatedUserId(request)` et le passe au use case.
- **Module de référence (T2)** : `modules/identity` — domaine pur, port `ProfileRepository`, use cases, adapter Drizzle qui traduit les violations d'unicité en erreurs métier, routes typées par le contrat.
- **Tests** : use cases et routes avec les adapters en mémoire (`test/support/test-app.ts`, JWT de test dans `test/support/tokens.ts`) ; adapters Drizzle sur un vrai Postgres (`test/support/database.ts`, schéma à jour par `pnpm db:migrate`).
- **Lecture visible** (ADR-006) : le use case lit la relation par le port `RelationshipReader` (`shared/application`), puis applique `canViewProfile` / `canViewContent`… de `shared/domain/visibility.ts` ; invisible → `NotFoundError`. Référence : `GetProfile` (`modules/identity`).
- **Liste paginée** (ADR-007) : la route décode `?cursor=` (`decodeCursor` de `@clone/db`, mal formé → `InvalidCursorError` de `shared/domain/pagination.ts`, `400 invalid_cursor`) et encode `next` en `nextCursor` ; l'adapter lit `limit + 1` lignes et traduit la visibilité en SQL. Référence : `modules/social` (`ListFollowers`, `DrizzleSocialGraphReader`).
- **Use case de référence** : `LikePost` (ADR-005) — autorisation et visibilité dans le use case, `UnitOfWork` si plusieurs tables, compteur modifié seulement si une ligne change.
- **Variable d'environnement** : l'ajouter au schéma de `shared/infrastructure/config.ts` et à `.env.example`.

## Interdits

- `domain/` qui importe autre chose que du domaine ; `application/` qui importe `infrastructure/` ; `@clone/jobs` hors de `infrastructure/` (dependency-cruiser, `pnpm lint`).
- Endpoint, champ ou code d'erreur absent du contrat.
- Autorisation dans la route ; lecture sans la politique de visibilité ; 403 pour un contenu invisible (→ 404).
- Accès à Supabase par PostgREST, Realtime ou RLS comme autorisation.
- Jeton, en-tête d'authentification, IP ou donnée personnelle dans les logs.
- Traitement lourd dans l'API (→ job du worker).
- `any`, `eslint-disable` sans justification, test désactivé.
