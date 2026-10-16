# apps/backoffice — conventions

Backoffice client de l'API uniquement : [ADR-011](../../docs/adr/ADR-011-backoffice-nextjs-client-api.md). Contrat : [ADR-003](../../docs/adr/ADR-003-contrat-openapi-contract-first.md). Connexion admin (à partir de T14) : [ADR-004](../../docs/adr/ADR-004-supabase-infrastructure-derriere-api.md).

## Organisation par feature

| Fichier | Emplacement |
|---|---|
| Routes (pages, layouts) uniquement | `src/app/` |
| Présentation, sans requête ni logique métier | `src/features/<feature>/components/` |
| Lectures (`queries.ts`) et Server Actions (`actions.ts`) | `src/features/<feature>/data/` |
| Schémas Zod des formulaires | `src/features/<feature>/schemas/` |
| Client `openapi-fetch` (types générés, jeton injecté côté serveur) | `src/lib/api/` |
| Session Supabase côté serveur | `src/lib/auth/` |
| Composants shadcn/ui (`npx shadcn add …`) | `src/components/ui/` |

- Tout appel à l'API passe par le serveur Next.js. `src/lib/api` et `data/` importent `server-only`.
- **Chaque Server Action revérifie la session** avant d'appeler l'API ; `src/proxy.ts` (Next 16, ex-`middleware.ts`) n'est qu'un confort de redirection.
- L'API reste l'autorité pour le rôle `admin`.
- Pagination, tri et filtres dans l'URL ; états vides, de chargement et d'erreur explicites ; toast et revalidation après chaque action.
- **Session admin** (T14) : `src/lib/auth/session.ts` (client `@supabase/ssr` sur `cookies()`, cookies httpOnly), connexion et déconnexion par Server Action (`features/auth/data/actions.ts`) : le navigateur n'appelle jamais Supabase. Chaque page et chaque Server Action commence par `requireAdmin()` (`features/auth/data/session.ts`, `GET /v1/admin/me`), qui renvoie le client API avec le jeton ; refus → `/logout?error=…` (route qui ferme la session).
- **Server Action** de référence : `moderateUser` (`features/users/data/actions.ts`) — `requireAdmin()`, entrée revalidée par Zod, appel API, `revalidatePath`, résultat `{ ok, message }` pour le toast. Le composant la reçoit en prop depuis la page (`ModerationActions`).
- **Tableau** : `@tanstack/react-table` v9 (`useTable`, `createColumnHelper`), sans traitement de lignes : pagination, filtres et tri restent côté serveur, dans l'URL.
- Tests : Vitest (`*.test.ts` à côté du code). Pas de Playwright en T14 ni en T15 : parcours vérifiés à la main par le lead dev.

## Interdits

- Import de `@/lib/api` ailleurs que dans `src/features/*/data/`, et d'`openapi-fetch` ailleurs que dans `src/lib/api` (ESLint `no-restricted-imports`).
- Requête dans un composant ; appel API depuis le navigateur ; jeton exposé au JavaScript du client.
- Accès direct à la base, à Supabase (hors connexion) ou à PostHog.
- Server Action sans revérification de la session.
- `any`, `eslint-disable` sans justification, test désactivé.

## Next.js

Le bloc ci-dessous est géré par `next dev` (qui recréerait sinon un `AGENTS.md`, interdit par ADR-014) : ne pas le modifier.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
