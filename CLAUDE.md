# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## État du dépôt

Projet de cours : clone d'Instagram iOS + backend + backoffice, développé par un seul lead dev (Killian) avec l'IA, en moins de 4 semaines, **exécuté uniquement en local**.

À ce stade, le dépôt ne contient que la spécification (`docs/cahier-des-charges/`, à lire en priorité) et un agent ADR (`docs/adr/Agent ADR Architecte.md`). **Aucun code n'existe encore.** L'arborescence, les commandes et les outils ci-dessous sont la cible définie par le cahier des charges : vérifier qu'ils existent avant de les utiliser, et mettre à jour ce fichier au fur et à mesure du scaffolding.

Le cahier des charges est la source de vérité. En cas de doute, relire le fichier concerné plutôt que d'improviser :
- `01` périmètre et priorités (P0 → P3), `03` entités et règles métier, `04` contrat d'API, `05` iOS, `06` backend, `07` backoffice, `08` qualité et workflow, `09` décisions et points à vérifier.

## Monorepo cible (pnpm)

```
apps/api/          Fastify + TypeScript strict, architecture hexagonale, Drizzle
apps/worker/       consommateurs BullMQ (sharp, ffmpeg → HLS), SANS logique métier
apps/backoffice/   Next.js App Router, Tailwind, shadcn/ui ; client de l'API uniquement
packages/contract/ openapi.yaml (source de vérité) + types générés
packages/db/       schéma Drizzle, migrations, seed, fonctions de transition de statut
ios/               projet Xcode SwiftUI (Swift 6 strict, iOS 27, Liquid Glass)
supabase/          config.toml de la CLI Supabase
```

## Commandes (prévues)

```bash
supabase start              # Postgres, Auth, Storage, Studio
docker compose up -d        # Redis (file BullMQ uniquement)
pnpm dev                    # API + worker + backoffice
pnpm lint | pnpm typecheck | pnpm test | pnpm build
pnpm contract:generate      # régénère les clients depuis openapi.yaml
pnpm db:migrate | pnpm db:seed
xcodebuild test             # app iOS, lancé en local (pas de CI macOS)
```

Tests : Vitest (API, worker, backoffice), Playwright (backoffice), Swift Testing (+ XCUITest optionnel) pour iOS. Qualité : ESLint + Prettier + `tsc --noEmit` + dependency-cruiser côté TS ; SwiftLint + SwiftFormat côté iOS ; validation OpenAPI (Redocly).

## Architecture — principes non négociables

1. **L'API est la seule porte d'entrée vers les données.** Supabase est une *infrastructure* (Postgres, Auth, Storage), pas un backend : ni PostgREST côté client, ni Supabase Realtime, ni RLS comme mécanisme d'autorisation. Les seules exceptions : la connexion via Supabase Auth et le transfert de fichiers via URL présignées / publiques. RLS doit être activé **sans aucune policy** (ou l'exposition du schéma `public` désactivée) sur toutes nos tables.
2. **Contract-first.** Toute évolution d'échange : modifier `packages/contract/openapi.yaml` → valider → régénérer (Swift via `swift-openapi-generator`, TS via `openapi-typescript` / `openapi-fetch`) → implémenter. Ne jamais inventer d'endpoint ou de champ.
3. **Rien de lourd dans l'API** : tout traitement > quelques centaines de ms passe par un job BullMQ traité par le worker.
4. **Le WebSocket notifie, il n'est jamais la source de vérité.** Envoi des messages par REST (idempotent via `clientId`), réception par WS, rattrapage par REST. Authentification WS par un premier message `{type:"auth", token}`, jamais de token dans l'URL.

### Backend (`apps/api`) — hexagonal par module

Modules métier : `identity`, `social`, `media`, `posts`, `engagement`, `feed`, `ephemeral`, `messaging`, `activity`, `moderation`. Chacun : `domain/` (aucun import externe) → `application/ports` + `application/use-cases` (un fichier par use case) → `infrastructure/http` + `infrastructure/persistence`. Transverse dans `shared/`. Composition manuelle dans `main.ts` (pas de conteneur DI). dependency-cruiser fait échouer la CI si les dépendances ne pointent pas vers l'intérieur.

- Le contrôleur authentifie, **le use case autorise** (propriétaire, rôle admin, visibilité).
- **Politique de visibilité unique** (`shared/domain/visibility` : `canViewProfile`, `canViewContent`, `canViewStory`, `canMessage`, `isMutual`) appelée par *toutes* les lectures. Aucune requête ne réimplémente les filtres de blocage / compte privé / audience. Un contenu invisible renvoie **404**, pas 403.
- Écritures multi-tables (ligne + compteur dénormalisé + notification) dans une seule transaction via le port `UnitOfWork`.
- Erreurs métier typées (`NotFound`, `Forbidden`, `Conflict`, `BusinessRule`) converties en Problem Details (RFC 9457) avec un `code` stable.
- Pas d'entité riche sans raison (un like n'en a pas besoin ; post, média, conversation oui).

### Worker (`apps/worker`)

Aucune logique métier : traite les fichiers et change les statuts via les fonctions de transition partagées de `packages/db`. Jobs idempotents, 3 tentatives, concurrence 1 pour la vidéo. Revalide toujours le fichier réel (type, dimensions, durée via `ffprobe`) ; supprime l'EXIF des images.

**Machine à états des médias** : `pending_upload → uploaded → processing → ready | failed` (`failed → uploaded` pour relance). Transitions écrites en `UPDATE … WHERE id = $1 AND status = '<attendu>'` ; zéro ligne touchée = transition invalide. Seul le worker passe en `processing`/`ready`/`failed`. Un post n'est créé que lorsque tous ses médias sont `ready`.

**Fin de traitement (P1, D21)** : les jobs médias renvoient `{ mediaId, ownerId }` ; un adapter de l'API abonné aux `QueueEvents` de la file `media` publie `media.ready` / `media.failed` au propriétaire via `RealtimePublisher`. Un événement perdu (WebSocket fermé) est rattrapé par `GET /v1/media/{id}`. Ne pas ajouter de pub/sub Redis : Redis reste limité à la file de jobs.

### Données (`packages/db`)

- Migrations **uniquement via drizzle-kit** ; jamais modifier une migration appliquée ni le schéma depuis le Studio ; ne jamais toucher au schéma `auth`.
- `profiles.id` = id Supabase Auth ; le profil est créé par `POST /v1/me/onboarding`, pas par trigger.
- UUID v7 générés par l'app, `timestamptz` UTC, énumérations en `text` + `CHECK`, pas de FK polymorphe (une table de like par cible ; colonnes nullables + `CHECK` « exactement une »).
- Suppression logique (`deleted_at`) pour posts/commentaires/stories ; suppression **réelle** pour un compte (job de purge).
- Stories jamais supprimées à expiration : archivées via `expires_at`.
- Pagination par curseur opaque `(created_at, id)` en base64, jamais `OFFSET`. Réponse `{ items, nextCursor }`.

### App iOS (`ios/`)

MVVM avec `@Observable` / `@MainActor` : View → ViewModel (seulement si l'écran a un état réel) → Service injecté par protocole → client OpenAPI généré. Les services convertissent DTO → modèles de l'app. Une cible unique organisée en `App/`, `Core/`, `DesignSystem/`, `Features/<feature>/` ; une feature n'importe jamais une autre feature. Dossiers synchronisés Xcode. Mises à jour optimistes (like, save, follow) avec retour arrière. Images via Nuke (jamais `AsyncImage`), variante adaptée à la taille d'affichage ; pool de 2–3 `AVPlayer` pour les reels ; `UploadManager` en `URLSession` background. Liquid Glass uniquement sur la navigation et les contrôles, **jamais sur le contenu**. Toute nouvelle dépendance doit être justifiée dans `09`.

### Backoffice (`apps/backoffice`)

Organisation par feature (`features/*/{components,data,schemas}`), `app/` ne contient que les routes. Seuls `features/*/data/` importent `lib/api`. Aucun appel API depuis le navigateur : tout passe par le serveur Next.js, jeton en cookie httpOnly (`@supabase/ssr`). **Chaque Server Action revérifie la session** (le middleware n'est qu'un confort). L'API reste l'autorité pour le rôle admin ; toute action admin écrit dans `admin_audit_log`. Pagination / filtres dans l'URL.

## Environnement local — pièges

- L'iPhone physique ne peut pas joindre `localhost` : API et Supabase doivent être exposés sur l'IP locale du Mac, y compris les URL publiques générées par Storage (`PUBLIC_MEDIA_BASE_URL`).
- iOS : `NSAllowsLocalNetworking`, `NSLocalNetworkUsageDescription`, URL dans `Local.xcconfig` (non versionné, modèle versionné).
- ffmpeg requis sur la machine qui exécute le worker.
- `SUPABASE_SERVICE_ROLE_KEY` uniquement dans l'API et le worker ; l'app et le navigateur n'ont que la clé publique. `.env` non versionné, `.env.example` versionné. L'API refuse de démarrer si une variable manque.

## Workflow et conventions

- **Tranches verticales**, par ordre de priorité : contrat → migration → backend (domaine → use case → adapters → route + tests) → iOS (service → ViewModel → vues + tests) → backoffice. Une phase P n'est commencée que si la précédente est fonctionnelle et testée.
- Cas limites à tester systématiquement (06 § 7) : utilisateur bloqué, compte privé non suivi, compte suspendu, double like, message rejoué avec le même `clientId`, média d'un autre utilisateur, transition de statut invalide, curseur invalide.
- Definition of done : voir `08 § 6` (contrat à jour et clients régénérés, lint/typecheck/tests/build verts, visibilité appliquée, testé sur iPhone physique).
- Interdits : accès direct à la base depuis un client, `any` en TypeScript, force unwrap en Swift, secrets dans le code, `--no-verify`, tests désactivés, `eslint-disable` / `swiftlint:disable` sans commentaire justificatif.
- Commits en Conventional Commits (`feat(posts): …`), un commit / une branche par tranche verticale.
- Conventions pour l'IA uniquement dans des fichiers `CLAUDE.md` (jamais d'`AGENTS.md`) : ce fichier racine, plus un `CLAUDE.md` par app/package prévu en `08 § 2` (`apps/api`, `apps/worker`, `apps/backoffice`, `ios`, `packages/contract`), à créer au scaffolding sans répéter le contenu racine.
- Décisions d'architecture : l'IA propose, le lead dev tranche. Toute décision est consignée dans `09-decisions-risques.md` et/ou sous forme d'ADR selon `docs/adr/Agent ADR Architecte.md` (statut toujours `Proposé`, numérotation `ADR-XXX` incrémentale dans `docs/adr/`, index dans `docs/adr/README.md`). Avant de proposer du code, vérifier la conformité aux ADR existants.
