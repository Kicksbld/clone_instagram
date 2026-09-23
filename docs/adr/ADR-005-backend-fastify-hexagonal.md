# ADR-005 — Backend Fastify + TypeScript + Drizzle, architecture hexagonale par module

## Statut
Proposé

## Contexte
L'API porte toute la logique métier (ADR-004) de douze modules (`identity`, `social`, `media`, `posts`, `engagement`, `feed`, `ephemeral`, `messaging`, `activity`, `moderation`, `billing`, `analytics`).

Le code est largement produit par l'IA : l'architecture doit donner à chaque type de code un emplacement évident et être vérifiable automatiquement, sinon elle dérive.

Le langage doit être maîtrisé par le lead dev et partagé avec le backoffice.

Décisions sources : D6, D7.

## Décision
- **Stack** : Node.js LTS + TypeScript `strict`, Fastify, Drizzle ORM + drizzle-kit, Vitest.
- **Architecture hexagonale par module métier** :
  - `domain/` : entités, règles, erreurs métier, sans aucun import externe ;
  - `application/ports/` (interfaces) et `application/use-cases/` (un fichier par use case) ;
  - `infrastructure/http/` (routes) et `infrastructure/persistence/` (adapters Drizzle).
- Transverse dans `shared/` : erreurs de base, politique de visibilité (ADR-006), ports `UnitOfWork`, `Clock`, `IdGenerator`, `JobQueue`, `RealtimePublisher`, `AnalyticsTracker`, auth JWT, config.
- **Composition manuelle** dans `main.ts`, sans conteneur d'injection de dépendances.
- Règles :
  - le contrôleur authentifie, **le use case autorise** ;
  - écritures multi-tables dans une transaction via `UnitOfWork` ;
  - erreurs typées (`NotFound`, `Forbidden`, `Conflict`, `BusinessRule`) converties en *Problem Details* par un gestionnaire unique ;
  - pas d'entité riche sans raison (un like n'en a pas besoin).
- **dependency-cruiser** fait échouer la CI si les dépendances ne pointent pas vers l'intérieur.
- Configuration validée au démarrage : l'API refuse de démarrer si une variable manque.

## Alternatives
- NestJS : structure imposée et DI intégrée, mais plus lourd, basé sur des décorateurs. Écarté (D6).
- Prisma : bon outillage, mais plus éloigné du SQL que Drizzle, alors que le feed et la visibilité demandent des requêtes précises. Écarté (D6).
- Autre langage serveur : écarté, TypeScript est maîtrisé et partagé avec le backoffice (D6).
- Couches techniques globales (`controllers/`, `services/`, `repositories/`) : plus simple au départ, mais pas de frontière entre modules et dépendances non contrôlables. Écarté (D7).
- Conteneur DI : moins de code d'assemblage, mais dépendances implicites. Écarté (D7).

## Conséquences
### Positives
- Emplacement évident pour chaque fichier ; périmètre clair pour l'IA.
- Use cases testables avec des adapters en mémoire (RevenueCat et PostHog inclus).
- Violations d'architecture détectées par la CI.

### Négatives
- Plus de fichiers et de code d'assemblage qu'une API en couches simple.
- `main.ts` grossit avec le nombre de modules.

## Liens
- ADR-003 (types générés depuis le contrat)
- ADR-004 (l'API est la seule porte d'entrée)
- ADR-006 (politique de visibilité)
- ADR-007 (conventions de données)
