# ADR-002 — Monorepo pnpm : trois produits et trois packages partagés

## Statut
Proposé

## Contexte
Le projet comprend trois produits (app iOS, backend, backoffice) et un backend lui-même découpé en API et worker. L'API et le worker partagent le schéma de base, les fonctions de transition de statut et le contrat des jobs ; les trois produits partagent le contrat d'API.

Un seul développeur travaille sur l'ensemble, avec l'IA, qui doit pouvoir modifier une tranche verticale complète d'un seul tenant.

## Décision
Un **monorepo pnpm** unique :

```
apps/api/           Fastify, hexagonal (+ Dockerfile)
apps/worker/        consommateurs BullMQ (+ Dockerfile avec ffmpeg)
apps/backoffice/    Next.js
packages/contract/  openapi.yaml + types générés
packages/db/        schéma Drizzle, migrations, seed, fonctions de transition de statut
packages/jobs/      noms des files et des jobs, schémas Zod des payloads (ADR-015)
ios/                projet Xcode
supabase/           config.toml de la CLI Supabase
docker-compose.yml  Redis (dev)
.env.example        variables sans valeurs (ADR-009)
CLAUDE.md           conventions globales pour l'IA
docs/               cahier des charges, ADR, plans de phase, méthode (ia-workflow.md)
```

- Commandes racine : `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm contract:generate`, `pnpm db:migrate`, `pnpm db:seed`.
- Le domaine et les use cases vivent dans `apps/api`. Le worker n'importe que `packages/db`, `packages/jobs` et ses propres adapters, jamais `apps/api`.
- Un fichier `CLAUDE.md` par app et package (`apps/api`, `apps/worker`, `apps/backoffice`, `ios`, `packages/contract`), sans répéter le fichier racine (contenu : ADR-014).

## Alternatives
- Un dépôt par produit : isolation plus forte, mais le contrat et le schéma devraient être publiés et synchronisés entre dépôts, et une tranche verticale serait répartie sur plusieurs commits. Non retenu.
- Monorepo sans packages partagés (schéma dupliqué dans l'API et le worker) : moins de configuration, mais risque de divergence du schéma et des transitions de statut. Non retenu.

## Conséquences
### Positives
- Une tranche verticale tient dans une seule branche et un seul commit.
- Contrat, schéma et contrat des jobs à un seul endroit, importés par ceux qui en ont besoin.
- L'IA voit l'ensemble du code et les conventions par dossier.

### Négatives
- Configuration initiale plus lourde (workspaces, TypeScript par package, CI).
- Le projet Xcode n'est pas un package pnpm : la génération du client Swift passe par une copie de `openapi.yaml` (ADR-010).

## Liens
- ADR-003 (package `contract`)
- ADR-005 (structure de `apps/api`)
- ADR-008 (worker et `packages/db`)
- ADR-010 (projet iOS)
- ADR-011 (backoffice)
- ADR-014 (fichiers `CLAUDE.md`)
- ADR-015 (package `jobs`)
