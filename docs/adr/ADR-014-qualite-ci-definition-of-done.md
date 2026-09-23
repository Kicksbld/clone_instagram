# ADR-014 — Qualité, CI, tests et definition of done

## Statut
Proposé

## Contexte
L'objectif pédagogique du projet est de bien développer avec l'IA. L'IA ne se souvient pas d'une session à l'autre et casse facilement ce qu'elle ne voit pas : sans conventions écrites et garde-fous automatiques, elle réinvente les règles à chaque tranche.

Une tranche doit pouvoir être déclarée terminée selon des critères identiques pour toutes, vérifiables par le lead dev.

Source : cahier des charges, `08-qualite-conventions-ia.md`.

## Décision
- **Outils de qualité** :

| Produit | Lint / format | Typage | Tests | Architecture |
|---|---|---|---|---|
| API / worker | ESLint + Prettier | `tsc --noEmit` | Vitest | dependency-cruiser (ADR-005) |
| Backoffice | ESLint + Prettier | `tsc --noEmit` | Vitest + Playwright | règles d'import ESLint (ADR-011) |
| App iOS | SwiftLint + SwiftFormat | compilateur Swift 6 strict | Swift Testing (+ XCUITest optionnel) | revue |
| Contrat | Redocly CLI | — | — | — |

- **CI** : GitHub Actions sur chaque push — validation du contrat, lint, typecheck, tests et build des parties TypeScript, avec Postgres et Redis en services. App iOS : build et tests **en local** avant chaque intégration (`xcodebuild test`), runners macOS optionnels. Railway et Vercel déploient `main` une fois la CI verte (ADR-009).
- **Tests par niveau** :

| Niveau | Outil | Contenu |
|---|---|---|
| Domaine (API) | Vitest | Règles pures : visibilité, transitions de statut, validation des usernames |
| Use cases | Vitest + adapters en mémoire | Scénarios métier sans base : blocage, compte privé, idempotence, compteurs |
| Adapters | Vitest + Postgres réel (Supabase local ou Testcontainers) | Requêtes Drizzle, contraintes, pagination par curseur |
| Routes | Vitest + `fastify.inject` | Contrat respecté, codes d'erreur, authentification, rôle admin |
| Worker | Vitest + fichiers d'exemple | Image avec EXIF GPS → sortie sans EXIF ; fichier invalide → `failed` |
| iOS : ViewModels, services | Swift Testing, faux injectés, transport factice | États de chargement, erreurs, mises à jour optimistes et retour arrière, conversion des DTO |
| iOS : UploadManager, onboarding, paywall | Swift Testing | Enchaînement des états, reprise après échec ; username pris ; offre selon la variante, achat annulé, restauration |
| iOS : parcours | XCUITest (optionnel) | Connexion → publication → like |
| Backoffice | Vitest ; Playwright | Schémas Zod, filtres ; connexion admin, refus d'un non-admin, traitement d'un signalement, bannissement, page Analytics |

- **Cas limites obligatoires**, testés dès qu'ils s'appliquent à la tranche : utilisateur bloqué, compte privé non suivi, compte suspendu, double like, message envoyé deux fois avec le même `clientId` (P1), média d'un autre utilisateur, transition de statut invalide, curseur invalide, avantage Plus demandé sans abonnement actif, abonnement expiré, RevenueCat injoignable pendant un rafraîchissement.
- **Definition of done** d'une tranche :
  - [ ] Le contrat est à jour et les clients sont régénérés.
  - [ ] Lint, typecheck, tests et build passent sur toutes les parties touchées.
  - [ ] Les cas limites applicables sont testés.
  - [ ] La politique de visibilité est appliquée à toutes les lectures ajoutées (ADR-006).
  - [ ] Les erreurs sont gérées côté app (message compréhensible, pas de crash, possibilité de réessayer).
  - [ ] La feature a été testée sur iPhone physique, de bout en bout, sur l'environnement de démo.
  - [ ] Aucun secret ni donnée de test personnelle n'est versionné.
  - [ ] Les décisions prises en cours de route sont consignées dans un nouvel ADR (statut `Proposé`).
- **Interdits** : accès direct à la base depuis un client, `any` en TypeScript, force unwrap en Swift, secret dans le code, `--no-verify`, test désactivé pour faire passer la CI, `eslint-disable` / `swiftlint:disable` sans commentaire justificatif.
- **Conventions pour l'IA** uniquement dans des fichiers `CLAUDE.md` (jamais d'`AGENTS.md`) : le fichier racine, plus un par app et package, créé au scaffolding, sans répéter le fichier racine ni recopier les ADR (il y renvoie) :
  - `apps/api` : emplacement de chaque type de fichier, use case de référence (ADR-005) ;
  - `apps/worker` : pas de logique métier, idempotence, transitions de statut (ADR-008) ;
  - `apps/backoffice` : organisation par feature, règles d'import, sécurité des Server Actions (ADR-011) ;
  - `ios` : MVVM, organisation par feature, concurrence, Liquid Glass (ADR-010) ;
  - `packages/contract` : conventions et procédure de régénération (ADR-003).

  Chacun contient une section « Interdits ».
- **Versionnement** : commits au format *Conventional Commits* (`feat(posts): …`, `fix(media): …`) ; une branche et un commit par tranche verticale, jamais de commit mêlant plusieurs features.

## Alternatives
- Conventions transmises oralement à chaque session : aucun fichier à maintenir, mais l'IA les oublie d'une session à l'autre. Non retenu.
- CI iOS sur runners macOS : app vérifiée à chaque push, mais consommation élevée de minutes. Non retenu (optionnel).
- `AGENTS.md` en plus de `CLAUDE.md` : compatible avec d'autres outils, mais deux fichiers à garder synchronisés. Non retenu.

## Conséquences
### Positives
- Ce que l'IA casse est détecté immédiatement, sans relecture manuelle exhaustive.
- Critère de fin identique pour toutes les tranches.
- Conventions disponibles à chaque session, sans dépendre de la mémoire de la conversation.

### Négatives
- L'app iOS n'est vérifiée qu'en local : un oubli de `xcodebuild test` passe la CI.
- Le test sur iPhone physique et sur la démo allonge chaque tranche.
- Les fichiers `CLAUDE.md` doivent être tenus à jour au fil du scaffolding.

## Liens
- ADR-001 (une tranche n'est terminée qu'avec la definition of done)
- ADR-005 (dependency-cruiser)
- ADR-006 (cas limites de visibilité)
- ADR-009 (déploiement après CI verte)
- ADR-011 (règles d'import du backoffice)
