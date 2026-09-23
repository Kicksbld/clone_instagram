# ADR-005 — Backend Fastify + TypeScript + Drizzle, architecture hexagonale par module

## Statut
Proposé

## Contexte
L'API porte toute la logique métier (ADR-004) de douze modules (`identity`, `social`, `media`, `posts`, `engagement`, `feed`, `ephemeral`, `messaging`, `activity`, `moderation`, `billing`, `analytics`).

Le code est largement produit par l'IA : l'architecture doit donner à chaque type de code un emplacement évident et être vérifiable automatiquement, sinon elle dérive.

Le langage doit être maîtrisé par le lead dev et partagé avec le backoffice.

Décisions sources : D6, D7, D8, D34.

## Décision
- **Stack** : Node.js LTS + TypeScript `strict`, Fastify, Drizzle ORM + drizzle-kit, Postgres avec l'extension `pg_trgm`, Vitest. Validation des entrées à partir des schémas de la spec (ou Zod). `@fastify/rate-limit`, logs pino. `@fastify/websocket` à partir de la P1.
- **Modules et tables** : l'utilisateur n'est qu'un identifiant référencé par des modules indépendants ; aucune entité `User` ne porte tout (« god entity »).

| Module | Responsabilité | Tables principales |
|---|---|---|
| `identity` | Profil, statut du compte, rôles admin | `profiles`, `admin_roles` |
| `social` | Abonnements, demandes, blocages, amis proches | `follows`, `follow_requests`, `blocks`, `close_friends` |
| `media` | Intentions d'upload, statut de traitement, variantes | `media` |
| `posts` | Posts et reels, médias associés, collaborations, republications | `posts`, `post_media`, `post_collaborators`, `reposts`, `post_media_tags` |
| `engagement` | Likes, commentaires, enregistrements, mentions | `post_likes`, `comments`, `comment_likes`, `saves`, `mentions` |
| `feed` | Lecture des fils (accueil, reels, explorer) | aucune (lecture) |
| `ephemeral` | Stories, vues, stories à la une, notes, instants | `stories`, `story_views`, `highlights`, `highlight_items`, `notes`, `instants`, `instant_recipients` |
| `messaging` | Conversations, messages, lecture | `conversations`, `conversation_members`, `messages` |
| `activity` | Notifications in-app | `notifications` |
| `moderation` | Signalements, actions admin, audit | `reports`, `admin_audit_log` |
| `billing` | Abonnement Clone Plus, règle `isPlus` (ADR-012) | `subscriptions` |
| `analytics` | Lecture des indicateurs pour le backoffice (ADR-013) | aucune (lecture) |

- **Architecture hexagonale par module** :

```
apps/api/src/
├── modules/<module>/
│   ├── domain/            # entités, règles, erreurs métier — aucun import externe
│   ├── application/
│   │   ├── ports/         # interfaces
│   │   └── use-cases/     # un fichier par use case
│   └── infrastructure/
│       ├── http/          # routes : mapping requête → use case → réponse
│       └── persistence/   # adapters Drizzle
├── shared/
│   ├── domain/            # politique de visibilité (ADR-006), erreurs de base, types communs
│   ├── application/       # ports transverses : UnitOfWork, Clock, IdGenerator, JobQueue, RealtimePublisher, AnalyticsTracker
│   └── infrastructure/    # auth JWT, gestion d'erreurs, rate limit, WebSocket, config
└── main.ts                # composition root : assemblage manuel des dépendances
```

- Le **port** est une interface de la couche application (`PostRepository`, `MediaStorage`, `JobQueue`…) ; l'**adapter** l'implémente (Drizzle, Supabase Storage, BullMQ…). Le domaine n'importe rien, l'application n'importe que le domaine, l'infrastructure importe tout.
- **Composition manuelle** dans `main.ts`, sans conteneur d'injection de dépendances.
- **Règles** :

| Règle | Détail |
|---|---|
| Un use case = une intention | `CreatePost`, `LikePost`, `FollowUser`… ; entrée et sortie typées, sans objet HTTP |
| Autorisation dans le use case | Le contrôleur authentifie ; le use case décide (propriétaire, rôle admin, visibilité) |
| Visibilité | Tout use case de lecture passe par la politique unique (ADR-006) |
| Compte suspendu ou banni | Refus global dans la vérification d'authentification (`shared/infrastructure`), pour toutes les routes sauf `GET /v1/me` (l'app affiche l'écran « Compte suspendu ») et `DELETE /v1/me` (suppression du compte toujours possible) : `403 account_suspended`. Aucun use case n'a à le revérifier |
| Transactions | Port `UnitOfWork` : `uow.run(async (tx) => …)` pour tout use case qui écrit dans plusieurs tables (ligne + compteur + notification) |
| Erreurs | Erreurs typées (`NotFound`, `Forbidden`, `Conflict`, `BusinessRule`) converties en *Problem Details* (ADR-003) par un gestionnaire unique |
| Pas de domaine riche sans raison | Un like n'a pas besoin d'entité ni de mapper ; un post, un média ou une conversation, oui |
| Logs | pino, JSON structuré, identifiant de requête ; jamais de jeton ni de donnée personnelle |
| Configuration | Validée au démarrage : l'API refuse de démarrer si une variable manque (liste : ADR-009) |

- **Use case de référence : liker un post.**
  1. La route `PUT /v1/posts/:id/like` valide la requête et récupère l'utilisateur authentifié.
  2. Le use case `LikePost` charge le post, vérifie `canViewContent`, puis, dans une transaction : insère dans `post_likes` (aucun effet si déjà liké) ; incrémente `posts.like_count` seulement si une ligne a été insérée ; (P1) crée une notification pour l'auteur, sauf si c'est soi-même.
  3. Le use case renvoie `{ liked: true, likeCount }` ; la route le sérialise selon le contrat.
- **Rate limiting** en mémoire (`@fastify/rate-limit`, une seule instance d'API), réponse `429` + `Retry-After`. Valeurs initiales :

| Portée | Limite |
|---|---|
| Défaut, par utilisateur | 120 requêtes / minute |
| `POST /media/uploads` | 30 / heure |
| `POST /posts`, `POST /stories` | 20 / heure |
| `POST …/comments` | 30 / minute |
| `POST …/messages` | 60 / minute |
| `POST /reports` | 10 / heure |

- **dependency-cruiser** fait échouer la CI si `domain/` importe `application/` ou `infrastructure/`, ou si `application/` importe `infrastructure/`.
- Tests : ADR-014.

## Alternatives
- NestJS : structure imposée et DI intégrée, mais plus lourd, basé sur des décorateurs. Écarté (D6).
- Prisma : bon outillage, mais plus éloigné du SQL que Drizzle, alors que le feed et la visibilité demandent des requêtes précises. Écarté (D6).
- Autre langage serveur : écarté, TypeScript est maîtrisé et partagé avec le backoffice (D6).
- Couches techniques globales (`controllers/`, `services/`, `repositories/`) : plus simple au départ, mais pas de frontière entre modules et dépendances non contrôlables. Écarté (D7).
- Conteneur DI : moins de code d'assemblage, mais dépendances implicites. Écarté (D7).
- Compte suspendu ou banni : refuser seulement les écritures, use case par use case. Le compte pourrait encore lire les contenus des autres (un compte banni pour harcèlement verrait toujours ses victimes), et chaque use case d'écriture devrait penser à vérifier le statut. Écarté par le lead dev (D34).
- Rate limit stocké dans Redis : partagé entre instances, mais Redis est réservé à la file de jobs et il n'y a qu'une instance. Écarté (D8).

## Conséquences
### Positives
- Emplacement évident pour chaque fichier ; périmètre clair pour l'IA.
- Use cases testables avec des adapters en mémoire (RevenueCat et PostHog inclus).
- Violations d'architecture détectées par la CI.

### Négatives
- Plus de fichiers et de code d'assemblage qu'une API en couches simple.
- `main.ts` grossit avec le nombre de modules.
- Le rate limiting en mémoire est remis à zéro à chaque redémarrage de l'API (limite assumée).

## Liens
- ADR-003 (types générés, conventions d'erreurs)
- ADR-004 (l'API est la seule porte d'entrée)
- ADR-006 (politique de visibilité)
- ADR-007 (conventions de données)
- ADR-009 (variables d'environnement)
- ADR-014 (tests)
