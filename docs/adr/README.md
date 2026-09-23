# Architecture Decision Records

Décisions d'architecture du projet, rédigées selon [Agent ADR Architecte.md](Agent%20ADR%20Architecte.md). Seul le lead dev accepte ou remplace un ADR.

**Pendant le développement d'une tranche, la fiche du plan et les ADR qu'elle cite sont la seule source de contexte** (ADR-001). Le cahier des charges ne sert qu'à rédiger les ADR et le plan d'une nouvelle phase ; en cas de divergence, l'ADR fait foi.

| ADR | Titre | Statut |
|---|---|---|
| [ADR-001](ADR-001-decoupage-phases-tranches-verticales.md) | Découpage en phases P0 → P3 et livraison par tranches verticales | Proposé |
| [ADR-002](ADR-002-monorepo-pnpm.md) | Monorepo pnpm : trois produits et deux packages partagés | Proposé |
| [ADR-003](ADR-003-contrat-openapi-contract-first.md) | Contrat OpenAPI unique, contract-first, clients générés | Proposé |
| [ADR-004](ADR-004-supabase-infrastructure-derriere-api.md) | Supabase comme infrastructure derrière l'API | Proposé |
| [ADR-005](ADR-005-backend-fastify-hexagonal.md) | Backend Fastify + TypeScript + Drizzle, architecture hexagonale par module | Proposé |
| [ADR-006](ADR-006-politique-visibilite-unique.md) | Politique de visibilité unique (contenu invisible → 404) | Proposé |
| [ADR-007](ADR-007-conventions-donnees.md) | Conventions du modèle de données | Proposé |
| [ADR-008](ADR-008-pipeline-media-worker.md) | Pipeline média : upload présigné, worker BullMQ sans logique métier | Proposé |
| [ADR-009](ADR-009-environnements-local-et-demo.md) | Deux environnements : dev local et démo hébergée déployée dès le début | Proposé |
| [ADR-010](ADR-010-app-ios-swiftui-mvvm.md) | App iOS : SwiftUI natif, MVVM `@Observable`, cible iOS 26, une cible organisée par feature | Proposé |
| [ADR-011](ADR-011-backoffice-nextjs-client-api.md) | Backoffice Next.js organisé par feature, client de l'API uniquement | Proposé |
| [ADR-012](ADR-012-abonnement-clone-plus-revenuecat.md) | Abonnement Clone Plus : RevenueCat, statut vérifié par l'API | Proposé |
| [ADR-013](ADR-013-analytics-ab-test-posthog.md) | Analytics et A/B test avec PostHog, backoffice passant par l'API | Proposé |
| [ADR-014](ADR-014-qualite-ci-definition-of-done.md) | Qualité, CI, tests et definition of done | Proposé |

## À rédiger avant le plan de leur phase (P1 et plus)

À partir du cahier des charges, avec tout le contenu dont les tranches auront besoin.

- Messagerie : envoi REST, réception WebSocket (D16)
- Vidéo en HLS via ffmpeg (D10)
- Stories archivées, jamais supprimées (D14)
- Notification de fin de traitement média par QueueEvents (D21)
- Avantages Clone Plus limités à 4 (D28)
