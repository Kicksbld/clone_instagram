# Cahier des charges — Clone Instagram

> Exercice de cours : reproduire au plus proche l'app iOS d'Instagram, son backend et un backoffice, en développement assisté par IA.
> Statut : **v1 — validé en brainstorming, à relire**. Lead dev : Killian (seul + IA).

> **Usage** : ce cahier décrit le périmètre et le contexte. Il sert **uniquement à préparer une phase** : rédiger ses ADR (`docs/adr/`) et son plan (`docs/plan/`). Il n'est pas lu pendant le développement d'une tranche : la fiche du plan et les ADR qu'elle cite sont alors la seule source de contexte (ADR-001). En cas de divergence, l'ADR fait foi.

## Sommaire

| Fichier | Contenu |
|---|---|
| [01-contexte-perimetre.md](01-contexte-perimetre.md) | Contexte, objectifs, contraintes, périmètre par priorité, hors périmètre |
| [02-architecture-globale.md](02-architecture-globale.md) | Vue d'ensemble des produits, flux entre eux, environnements (dev local, démo hébergée), secrets, monorepo |
| [03-entites-metier.md](03-entites-metier.md) | Modules métier, entités, règles, modèle de données, machines à états, index du feed |
| [04-contrat-api.md](04-contrat-api.md) | Conventions d'API, liste des endpoints, événements temps réel |
| [05-app-ios.md](05-app-ios.md) | Stack et architecture de l'app mobile |
| [06-backend.md](06-backend.md) | Stack et architecture du backend (API + worker) |
| [07-backoffice.md](07-backoffice.md) | Stack et architecture du backoffice |
| [08-qualite-conventions-ia.md](08-qualite-conventions-ia.md) | Tests, lint, CI, conventions pour le développement avec IA, definition of done |
| [09-decisions-risques.md](09-decisions-risques.md) | Journal des décisions, risques, points à vérifier |

## Résumé des choix structurants

- **App iOS** : Swift 6, SwiftUI, Liquid Glass (Instagram « réinterprété iOS 27 »), MVVM avec `@Observable`.
- **Backend** : Node.js + TypeScript, Fastify, architecture hexagonale, Drizzle ORM ; worker séparé (BullMQ sur Redis) pour le traitement des médias (sharp, ffmpeg → HLS).
- **Infrastructure** : Supabase **utilisé comme infrastructure** (Postgres, Auth, Storage) derrière notre API ; Redis uniquement pour la file de jobs.
- **Backoffice** : Next.js (App Router), Tailwind CSS, shadcn/ui ; client de l'API uniquement, jamais d'accès direct à la base.
- **Monétisation et mesure** : paywall « Clone Plus » avec RevenueCat (statut vérifié par l'API), analytics et A/B test avec PostHog, résultats affichés dans le backoffice via l'API.
- **Contrat** : une spec OpenAPI unique, source de vérité pour les 3 produits.
- **Exécution** : développement en local (Docker + Supabase CLI) ; démo hébergée sur Supabase Cloud, Railway (API, worker, Redis) et Vercel (backoffice), iPhone physique depuis n'importe quel réseau.
- **Organisation** : monorepo pnpm.

## Glossaire

| Terme | Définition |
|---|---|
| P0 / P1 / P2 / P3 | Niveaux de priorité (voir 01) |
| Port | Interface définie par la couche application du backend, implémentée par un adapter |
| Adapter | Implémentation technique d'un port (Postgres, Redis, Storage…) |
| Média | Fichier image ou vidéo téléversé, avec son cycle de traitement |
| Instant | Photo éphémère envoyée en privé, visible une seule fois |
| Note | Texte court éphémère affiché en haut de la messagerie |
| Clone Plus | Abonnement payant de l'app, inspiré d'Instagram Plus, géré avec RevenueCat |
| Entitlement | Droit d'accès accordé par un abonnement (ici `plus`), tel que RevenueCat le renvoie |
| Feature flag / expérience | Variante attribuée à un utilisateur par PostHog, utilisée pour l'A/B test |
