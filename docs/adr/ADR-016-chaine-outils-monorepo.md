# ADR-016 — Chaîne d'outils du monorepo : packages internes consommés depuis leurs sources, versions épinglées

## Statut
Proposé

## Contexte
Le monorepo pnpm (ADR-002) contient trois packages internes (`packages/contract`, `packages/db`, `packages/jobs`) importés par l'API, le worker et le backoffice. La fiche T0a demandait de vérifier, au démarrage, le mode de consommation de ces packages (`workspace:*`, sources TypeScript exportées directement ou packages compilés) : il doit fonctionner en dev, avec le build Docker de l'API et du worker sur Railway (ADR-009) et avec Next.js sur Vercel (ADR-011).

Au démarrage de T0a (septembre 2026), deux versions récentes des outils n'étaient pas utilisables :
- TypeScript 7 (compilateur natif) n'est pas supporté par `typescript-eslint`, qui exige une version inférieure à 6.1 ; or ESLint en mode typé est l'outil de lint imposé par ADR-014 ;
- pnpm 12 ne démarre pas avec le corepack fourni par Node 24.

## Décision
- **Packages internes consommés depuis leurs sources TypeScript** : dépendances `workspace:*`, champ `exports` qui pointe vers `./src/index.ts`, aucune étape de build pour les packages.
  - API et worker : `tsx watch` en dev ; `tsdown` en build, qui intègre les packages `@clone/*` au bundle (`deps.alwaysBundle`) et laisse les dépendances npm externes. La sortie `dist/main.mjs` est autonome, prête pour le Dockerfile (T1).
  - Backoffice : `transpilePackages` dans `next.config.ts`.
  - `packages/contract` exporte aussi `generated/openapi.json`, lu par l'API pour valider les entrées (ADR-005).
- **Versions épinglées** :
  - Node 24 (LTS, `.nvmrc` et `engines`) ;
  - pnpm 10, installé par `corepack enable` à partir du champ `packageManager` ;
  - TypeScript 6.0.x, tant que `typescript-eslint` ne supporte pas TypeScript 7.
- Un seul `.env` à la racine en local : l'API et le worker le lisent par `--env-file-if-exists`, le backoffice depuis `next.config.ts`, drizzle-kit depuis `drizzle.config.ts`.

## Alternatives
- Packages compilés (build de chaque package vers `dist/`) : format standard, mais une étape de build et un ordre de build à maintenir entre les packages, et un mode watch supplémentaire en dev. Non retenu.
- TypeScript 7 : compilateur plus rapide, mais le lint typé d'ADR-014 ne fonctionnerait plus. Non retenu pour l'instant.
- pnpm 12 : dernière version, mais incompatible avec le corepack de Node 24. Non retenu pour l'instant.

## Conséquences
### Positives
- Aucune étape de build entre un package interne et ses consommateurs : une modification est visible immédiatement en dev, en test et au typecheck.
- Bundle de l'API et du worker autonome, sans les sources des packages internes au runtime.
- Versions d'outils identiques en local et en CI.

### Négatives
- Chaque consommateur doit savoir compiler du TypeScript (`tsx`, `tsdown`, `transpilePackages`) ; un nouveau consommateur doit être configuré de la même façon.
- Montées de version de TypeScript et de pnpm à refaire quand l'écosystème les supporte.
- `openapi-typescript` déclare TypeScript 5 en dépendance pair : avertissement à l'installation, sans effet constaté.

## Liens
- ADR-002 (monorepo et packages partagés)
- ADR-003 (contrat et génération)
- ADR-005 (validation des entrées par le contrat)
- ADR-009 (Railway, Vercel, variables d'environnement)
- ADR-011 (backoffice Next.js)
- ADR-014 (outils de qualité, CI)
- ADR-015 (packages/jobs)
