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
| Ports transverses (`UnitOfWork`, `Clock`, `IdGenerator`, `JobQueue`…) | `src/shared/application/` |
| Config, gestion d'erreurs, schémas du contrat, auth, adapter BullMQ | `src/shared/infrastructure/` |
| Assemblage des dépendances | `src/main.ts` (manuel, sans conteneur DI) ; l'app HTTP est construite par `src/app.ts` |
| Tests | `test/` (Vitest ; routes via `fastify.inject`) |

## Recettes

- **Nouvelle route** : écrire l'opération dans `packages/contract/openapi.yaml`, lancer `pnpm contract:generate`, puis déclarer la route avec `schema: routeSchemaFor('<operationId>')` (`shared/infrastructure/http/contract-schemas.ts`). Validation et champs inconnus : gérés par ce schéma.
- **Erreur métier** : lever une sous-classe de `DomainError` (`NotFoundError`, `ForbiddenError`, `ConflictError`, `BusinessRuleError`) avec un `code` stable documenté dans le contrat. Le gestionnaire unique la convertit en Problem Details.
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
