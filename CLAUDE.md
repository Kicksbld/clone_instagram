# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## État du dépôt

Projet de cours : clone d'Instagram iOS + backend + backoffice, développé par un seul lead dev (Killian) avec l'IA. **Dev en local** (Supabase CLI, Redis Docker) et **démo hébergée** (Supabase Cloud, Railway pour API + worker + Redis, Vercel pour le backoffice), plus les SaaS RevenueCat et PostHog Cloud. P0 est l'objectif ; P1 à P3 viennent ensuite, dans l'ordre. Onboarding, paywall, analytics et A/B test sont imposés et font partie de P0.

Le socle TypeScript existe (T0a) : `apps/api`, `apps/worker`, `apps/backoffice`, `packages/contract`, `packages/db`, `packages/jobs`, sans table ni authentification. Le squelette iOS existe (T0b) : `ios/`, projet XcodeGen, écran d'état de `/health`. La démo est déployée (T1) : Supabase Cloud, Railway (`apps/*/Dockerfile`, réglages des services dans le README § 7, migrations en pré-déploiement), Vercel ; détail dans `README.md` § 7. T2 pose l'authentification (JWT ES256 vérifiés par JWKS, ADR-018), le module `identity` (table `profiles`) et l'onboarding iOS en wireframe. T3 pose le pipeline média (ADR-008) : module `media` (table `media`, upload présigné, ports `UnitOfWork` et `JobQueue`), jobs `process-image` et `purge-orphan-media` dans le worker (sharp), photo de profil. T4 pose la politique de visibilité (`apps/api/src/shared/domain/visibility.ts`, ADR-006) et le port transverse `RelationshipReader` (tables `follows` et `blocks`), `GET /v1/users/{username}`, la feature iOS `Profile`, un onglet Recherche provisoire (username exact, remplacé en T5) et un seed minimal (`SEED_VIEWER_USERNAME`). Mettre à jour ce fichier au fur et à mesure du scaffolding.

## Sources de contexte (ADR-001)

| Document | Rôle | Quand le lire |
|---|---|---|
| Fiche de la tranche dans [`docs/plan/P0.md`](docs/plan/P0.md) | Quoi faire : contrat, tables, règles métier, cas limites, hors tranche | Pendant le développement |
| ADR cités par la fiche ([`docs/adr/`](docs/adr/README.md)) | Comment faire : décisions et règles techniques | Pendant le développement |
| Cahier des charges (`docs/cahier-des-charges/`) | Périmètre et contexte du projet | **Uniquement** pour rédiger les ADR et le plan d'une nouvelle phase |

- **Pendant une tranche, la fiche et ses ADR sont la seule source de contexte.** Ne pas lire le cahier des charges.
- Si une information manque dans la fiche et les ADR : s'arrêter et le signaler au lead dev, ne pas inventer ni aller la chercher ailleurs.
- En cas de divergence, l'ADR fait foi. Le résumé ci-dessous n'est qu'un rappel : le détail est dans l'ADR indiqué.

## Monorepo (pnpm, ADR-002)

```
apps/api/          Fastify + TypeScript strict, architecture hexagonale, Drizzle
apps/worker/       consommateurs BullMQ (sharp, ffmpeg → HLS), SANS logique métier
apps/backoffice/   Next.js App Router, Tailwind, shadcn/ui ; client de l'API uniquement
packages/contract/ openapi.yaml (source de vérité) + types générés
packages/db/       schéma Drizzle, migrations, seed, fonctions de transition de statut
packages/jobs/     contrat API ↔ worker : files, jobs, schémas Zod des payloads (ADR-015)
ios/               app SwiftUI (Swift 6 strict, cible iOS 26 / SDK iOS 27, Liquid Glass) ; project.yml XcodeGen (ADR-017)
supabase/          config.toml de la CLI Supabase
```

## Commandes

Node 24 (`.nvmrc`), pnpm via `corepack enable` (version épinglée dans `package.json`). Copier `.env.example` en `.env` et le compléter.

```bash
supabase start              # Postgres, Auth, Storage, Studio
docker compose up -d        # Redis (file BullMQ uniquement)
pnpm install
pnpm dev                    # API (:3000) + worker + backoffice (:3001)
pnpm lint | pnpm typecheck | pnpm test | pnpm build
pnpm contract:generate      # régénère les clients depuis openapi.yaml
pnpm db:migrate | pnpm db:seed
ios/scripts/bootstrap.sh    # app iOS : outils Homebrew, .xcconfig locaux, xcodegen generate
xcodebuild test             # app iOS, lancé en local (pas de CI macOS) ; commande complète dans ios/CLAUDE.md
```

Outils de qualité et tests par niveau : ADR-014.

## Règles non négociables (rappel)

1. **L'API est la seule porte d'entrée vers les données** (ADR-004). Supabase = infrastructure (Postgres, Auth, Storage) : ni PostgREST côté client, ni Realtime, ni RLS comme autorisation. Exceptions : connexion Supabase Auth, fichiers via URL présignées / publiques. RLS activé **sans policy** sur toutes nos tables.
2. **Contract-first** (ADR-003) : `openapi.yaml` → valider → `pnpm contract:generate` → implémenter. Jamais d'endpoint ou de champ inventé.
3. **Hexagonal par module** (ADR-005) : `domain/` sans import externe → `application/{ports,use-cases}` → `infrastructure/{http,persistence}` ; composition manuelle dans `main.ts`. Le contrôleur authentifie, **le use case autorise**. Écritures multi-tables via `UnitOfWork`. Erreurs typées → Problem Details.
4. **Visibilité unique** (ADR-006) : toute lecture passe par `shared/domain/visibility`. Contenu invisible → **404**, jamais 403.
5. **Données** (ADR-007) : migrations drizzle-kit uniquement, jamais le schéma `auth`, UUID v7, `timestamptz` UTC, `text` + `CHECK`, pas de FK polymorphe, pagination par curseur `(created_at, id)`, jamais `OFFSET`.
6. **Rien de lourd dans l'API** (ADR-008) : traitement par job BullMQ dans le worker, sans logique métier ; Redis = file de jobs uniquement. Machine à états des médias par `UPDATE … WHERE status = '<attendu>'`. Payloads de jobs définis dans `packages/jobs` (identifiants uniquement), validés par le worker (ADR-015).
7. **Abonnement vérifié par l'API** (ADR-012) : règle unique `isPlus`, `POST /v1/me/subscription/refresh`, pas de webhooks. Refus : `403 plus_required`.
8. **Analytics jamais bloquants, sans donnée personnelle** (ADR-013) : `distinct_id` = id de profil ; l'app passe par `AnalyticsService` ; le backoffice ne duplique rien, simple lien « Ouvrir dans PostHog ».
9. **iOS** (ADR-010) : MVVM `@Observable` / `@MainActor`, services injectés par protocole, une feature n'importe jamais une autre, Nuke (jamais `AsyncImage`), Liquid Glass jamais sur le contenu.
10. **Backoffice** (ADR-011) : aucun appel API depuis le navigateur, chaque Server Action revérifie la session, seuls `features/*/data/` importent `lib/api`.
11. **Environnements** (ADR-009) : même code, seule la config change ; secrets jamais versionnés ; l'iPhone n'atteint pas `localhost` (IP du Mac ou démo).
12. **Le WebSocket notifie, il n'est jamais la source de vérité** (P1, ADR à rédiger).

## Workflow et conventions

- **Méthode** : [`docs/ia-workflow.md`](docs/ia-workflow.md). On prend la première tranche non cochée du plan courant, on reste dans sa fiche (ligne « Hors tranche »), on la coche une fois la definition of done validée.
- **Ordre dans une tranche** : contrat → migration → backend (domaine → use case → adapters → route + tests) → iOS (service → ViewModel → vues + tests) → backoffice.
- **Definition of done, cas limites obligatoires, interdits, commits** : ADR-014.
- **README.md = guide de démarrage** (pour le lead dev et le professeur) : à chaque tranche qui change l'installation, les commandes, les services, les ports ou les variables d'environnement, mettre à jour `README.md` (prérequis, installation, lancement, arrêt / relance, problèmes fréquents, avancement). Clair et concis.
- Conventions pour l'IA uniquement dans des fichiers `CLAUDE.md` (jamais d'`AGENTS.md`) : ce fichier, plus un par app/package (`apps/api`, `apps/worker`, `apps/backoffice`, `ios`, `packages/contract`), créé au scaffolding, qui renvoie aux ADR sans les recopier.

## Décisions d'architecture (ADR)

Agent de référence : [`docs/adr/Agent ADR Architecte.md`](docs/adr/Agent%20ADR%20Architecte.md). Le lire **en entier** avant de créer, modifier ou vérifier un ADR, et respecter exactement son template et son fonctionnement.

- L'IA propose et formalise, le lead dev tranche. Seul un humain accepte ou remplace un ADR.
- Un ADR uniquement pour une décision importante et durable. Les ADR d'une nouvelle phase partent du cahier des charges (`09` § 1, décisions `Dx`) et des explications du lead dev ; ne rien inventer. Un ADR contient tout le détail dont les tranches auront besoin, sans renvoi au cahier.
- Fichiers `docs/adr/ADR-XXX-titre-en-kebab-case.md`, numéro = plus haut numéro existant + 1, sur trois chiffres ; ne jamais réutiliser un numéro. Statut toujours `Proposé` à la création.
- Chaque nouvel ADR est ajouté à l'index `docs/adr/README.md` et, si c'est une nouvelle décision, reporté dans `09-decisions-risques.md` du cahier des charges.
- **Avant de proposer du code**, rechercher les ADR concernés et conclure par `Conforme aux ADR existants`, `Contradiction avec ADR-XXX` ou `Décision non documentée — ADR recommandé`.
