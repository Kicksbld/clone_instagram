# 08 — Qualité et conventions de développement avec IA

L'objectif pédagogique du projet est de **bien** développer avec l'IA. Les règles ci-dessous sont des exigences, pas des recommandations.

## 1. Principes

1. **Le contrat d'abord.** Toute évolution d'échange commence par `openapi.yaml`, puis régénération, puis implémentation côté serveur et clients.
2. **Des conventions écrites.** L'IA ne se souvient pas d'une session à l'autre : ce qui n'est pas écrit dans un fichier `CLAUDE.md` sera réinventé.
3. **Des garde-fous automatiques.** Lint, typage, tests et règles d'architecture détectent immédiatement ce que l'IA casse.
4. **Des tranches petites et vérifiées.** Une feature à la fois, de bout en bout, relue avant la suivante.
5. **L'IA propose, le lead dev tranche.** Toute décision d'architecture est consignée dans `09-decisions-risques.md`.

## 2. Fichiers de conventions pour l'IA

| Fichier | Contenu |
|---|---|
| `CLAUDE.md` (racine) | Vue d'ensemble, carte du monorepo, commandes, workflow contract-first, règles de sécurité, definition of done |
| `apps/api/CLAUDE.md` | Architecture hexagonale, emplacement de chaque type de fichier, règles de 06 § 2.3, exemple de use case de référence |
| `apps/worker/CLAUDE.md` | Pas de logique métier, idempotence, transitions de statut |
| `apps/backoffice/CLAUDE.md` | Organisation par feature, règles d'import, sécurité des Server Actions |
| `ios/CLAUDE.md` | MVVM, organisation par feature, règles de concurrence, usage de Liquid Glass |
| `packages/contract/CLAUDE.md` | Conventions du contrat (04 § 1), procédure de régénération |

Chaque fichier contient aussi une section **« Interdits »** (exemples : accès direct à la base depuis un client, `any` en TypeScript, force unwrap en Swift, secret dans le code, désactivation d'une règle de lint sans justification).

Les conventions sont écrites uniquement dans des fichiers `CLAUDE.md` (pas d'`AGENTS.md`). Claude Code charge automatiquement le `CLAUDE.md` racine, puis celui d'un sous-dossier lorsqu'il travaille dans ce sous-dossier. Les fichiers par app ne répètent pas le fichier racine.

## 3. Outils de qualité

| Produit | Lint / format | Typage | Tests | Architecture |
|---|---|---|---|---|
| API / worker | ESLint + Prettier | `tsc --noEmit` | Vitest | dependency-cruiser |
| Backoffice | ESLint + Prettier | `tsc --noEmit` | Vitest + Playwright | règles d'import ESLint |
| App iOS | SwiftLint + SwiftFormat | compilateur Swift 6 strict | Swift Testing (+ XCUITest) | revue |
| Contrat | Validation OpenAPI (ex. Redocly CLI) | — | — | — |

Commandes racine attendues : `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm contract:generate`, `pnpm db:migrate`, `pnpm db:seed`.

## 4. Intégration continue

- GitHub Actions sur chaque push : validation du contrat, lint, typecheck, tests et build des parties TypeScript, avec Postgres et Redis en services.
- App iOS : build et tests **en local** avant chaque intégration (`xcodebuild test`). Les runners macOS consomment beaucoup de minutes ; leur usage en CI est optionnel.
- Déploiement continu de la démo : Railway (API, worker) et Vercel (backoffice) déploient automatiquement `main` une fois la CI verte.
- Aucun contournement : pas de `--no-verify`, pas de test désactivé pour faire passer la CI, pas de `eslint-disable` ou `swiftlint:disable` sans commentaire justificatif.

## 5. Workflow d'une feature

1. Relire la spécification concernée (01, 03, 04).
2. Mettre à jour `openapi.yaml`, valider, régénérer.
3. Migration de base si nécessaire.
4. Backend : domaine → use case → adapters → route, avec les tests.
5. App iOS : service → ViewModel → vues, avec les tests.
6. Backoffice si concerné.
7. Vérifier la definition of done, puis commit.

## 6. Definition of done

Une feature est terminée quand :

- [ ] Le contrat est à jour et les clients sont régénérés.
- [ ] Lint, typecheck, tests et build passent sur toutes les parties touchées.
- [ ] Les cas limites de 06 § 7 applicables sont testés.
- [ ] La politique de visibilité est appliquée à toutes les lectures ajoutées.
- [ ] Les erreurs sont gérées côté app (message compréhensible, pas de crash, possibilité de réessayer).
- [ ] La feature a été testée sur iPhone physique, de bout en bout, sur l'environnement de démo.
- [ ] Aucun secret ni donnée de test personnelle n'est versionné.
- [ ] Les décisions prises en cours de route sont ajoutées à 09.

## 7. Conventions de versionnement

- Commits au format *Conventional Commits* (`feat(posts): …`, `fix(media): …`).
- Un commit ou une branche par tranche verticale ; pas de commit mêlant plusieurs features.
- Migrations de base jamais modifiées une fois appliquées : on en ajoute une nouvelle.
