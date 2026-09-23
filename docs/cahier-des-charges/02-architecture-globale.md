# 02 — Architecture globale

## 1. Vue d'ensemble

```mermaid
flowchart TB
    subgraph Clients
        IOS["App iOS<br/>SwiftUI · REST + WebSocket"]
        BO["Backoffice<br/>Next.js · rendu serveur"]
    end

    subgraph Backend["Backend (monorepo, Node.js)"]
        API["API<br/>Fastify · hexagonal"]
        WK["Worker<br/>BullMQ · sharp · ffmpeg"]
    end

    subgraph Supabase["Supabase (local, via CLI)"]
        PG[("Postgres")]
        AUTH["Auth"]
        ST["Storage"]
    end

    REDIS[("Redis<br/>file de jobs BullMQ")]
    APNS["APNs (P2)"]

    IOS -- "REST /v1 + WS /ws" --> API
    BO -- "REST /v1/admin (côté serveur)" --> API
    IOS -. "connexion (email, Apple)" .-> AUTH
    BO -. "connexion admin" .-> AUTH
    IOS -. "upload présigné + lecture médias" .-> ST

    API --> PG
    API -- "vérifie les JWT" --> AUTH
    API -- "URL présignées" --> ST
    API -- "enfile des jobs" --> REDIS
    REDIS --> WK
    WK --> ST
    WK --> PG
    WK -. "push (P2)" .-> APNS
```

| Composant | Rôle | Parle à |
|---|---|---|
| App iOS | Interface utilisateur | API (toute la logique), Supabase Auth (connexion), Supabase Storage (upload présigné, lecture des médias) |
| Backoffice | Modération et administration | API (`/v1/admin/*`) depuis le serveur Next.js ; Supabase Auth (session admin) |
| API | Toute la logique métier, autorisation, contrat | Postgres, Auth (vérification JWT), Storage (URL signées), Redis (enfilage) |
| Worker | Traitements lourds et tâches planifiées | Redis (consommation), Storage, Postgres, APNs (P2) |
| Postgres | Source de vérité des données | — |
| Supabase Auth | Identités et JWT | — |
| Supabase Storage | Fichiers (originaux, variantes, HLS) | — |
| Redis | File de jobs uniquement (pas de cache) | — |

## 2. Principes

1. **L'API est la seule porte d'entrée vers les données.** Aucun client ne lit ni n'écrit dans Postgres directement. Les deux exceptions encadrées sont la connexion (Supabase Auth) et le transfert des fichiers (Storage, via URL présignées ou URL publiques).
2. **Supabase est une infrastructure, pas un backend.** On n'utilise ni l'API de données automatique (PostgREST) côté client, ni Supabase Realtime.
3. **Le contrat OpenAPI est la source de vérité** des échanges. On modifie la spec d'abord, on régénère, puis on implémente.
4. **Les traitements lourds ne tournent jamais dans l'API.** Tout ce qui dépasse quelques centaines de millisecondes passe par un job.
5. **Le WebSocket notifie, il n'est jamais la source de vérité.** Toute donnée reçue en temps réel est récupérable par REST.

> ⚠️ **Sécurité Supabase** : Supabase expose par défaut le schéma `public` via son API de données. Il faut **désactiver cette exposition** ou **activer RLS sans aucune policy** (refus total) sur toutes nos tables. Sans cela, la clé publique présente dans l'app permet de lire la base en contournant l'API.

## 3. Flux principaux

### 3.1 Authentification

```mermaid
sequenceDiagram
    participant App as App iOS
    participant Auth as Supabase Auth
    participant API
    App->>Auth: connexion (email/mot de passe ou jeton Sign in with Apple)
    Auth-->>App: JWT (access + refresh)
    App->>API: GET /v1/me (Bearer JWT)
    API->>API: vérifie la signature du JWT
    alt profil inexistant
        API-->>App: 404 profile_not_found
        App->>API: POST /v1/me/onboarding (username, nom…)
        API-->>App: 201 profil créé
    else profil existant
        API-->>App: 200 profil
    end
```

- Le profil applicatif est créé par un **endpoint d'onboarding explicite**, pas par un trigger en base.
- L'API refuse toute requête d'un compte `suspended` ou `banned` (sauf lecture de son statut).
- Backoffice : même principe, session stockée en **cookie httpOnly** (`@supabase/ssr`), rôle admin vérifié par l'API.

### 3.2 Publication d'un média

```mermaid
sequenceDiagram
    participant App as App iOS
    participant API
    participant ST as Storage
    participant Q as Redis (BullMQ)
    participant W as Worker
    participant PG as Postgres
    App->>API: POST /v1/media/uploads (type, taille)
    API->>PG: media = pending_upload
    API-->>App: mediaId + URL d'upload présignée
    App->>ST: PUT fichier (upload direct)
    App->>API: POST /v1/media/{id}/complete
    API->>PG: media = uploaded
    API->>Q: job process-image / process-video
    Q->>W: job
    W->>PG: media = processing
    W->>ST: lit l'original, écrit variantes / HLS
    W->>PG: media = ready (ou failed + motif)
    W-->>Q: fin du job, valeur de retour { mediaId, ownerId }
    Q-->>API: QueueEvents completed / failed (file media)
    API->>PG: lit le média (propriétaire, statut, variantes)
    API-->>App: WS media.ready { mediaId, variants } ou media.failed { mediaId, reason }
    Note over App,API: repli REST : GET /v1/media/{id} au retour au premier plan<br/>ou si aucun événement n'arrive dans le délai prévu
    App->>API: POST /v1/posts (mediaIds prêts)
```

- Le worker **revalide le fichier réel** (type détecté, dimensions, durée via `ffprobe`). Les déclarations du client ne font pas foi.
- Le post n'est créé que lorsque tous ses médias sont `ready`. L'app gère l'attente via son gestionnaire d'upload en arrière-plan.
- **Notification de fin de traitement (P1)** : l'API s'abonne aux `QueueEvents` BullMQ de la file `media` (`completed`, `failed`) et pousse au propriétaire du média un événement WebSocket `media.ready` ou `media.failed` via le port `RealtimePublisher`. Aucune brique supplémentaire : le mécanisme s'appuie sur la file de jobs existante, pas sur un canal pub/sub séparé. Si le WebSocket est fermé, l'événement est perdu et l'app rattrape l'état par `GET /v1/media/{id}`. En P0, avant la mise en place du WebSocket, l'app interroge ce endpoint.

### 3.3 Lecture des médias

- L'app lit les images (variantes) et les vidéos (playlist HLS) **directement depuis Storage**. `AVPlayer` lit HLS nativement.
- Médias publics (posts, reels, stories, avatars) : bucket public, chemins en UUID non devinables.
- Médias privés (images de DM, instants) : bucket privé, **URL signées de courte durée** délivrées par l'API après contrôle d'accès.

### 3.4 Messages privés

```mermaid
sequenceDiagram
    participant A as App expéditeur
    participant API
    participant B as App destinataire
    B->>API: WS /ws puis message {type: auth, token}
    A->>API: POST /v1/conversations/{id}/messages (clientId)
    API->>API: persiste (idempotent sur clientId)
    API-->>A: 201 message
    API-->>B: WS message.created
    Note over B,API: à la reconnexion
    B->>API: GET /v1/conversations/{id}/messages?after=curseur
```

- **Envoi par REST** (validé par le contrat, idempotent grâce au `clientId` généré par l'app).
- **Réception par WebSocket**, rattrapage par REST après reconnexion.
- Authentification du WebSocket par un **premier message**, jamais par un token dans l'URL (il finirait dans les logs).
- Une seule instance d'API en local : diffusion via un broker en mémoire, derrière un port `RealtimePublisher` (remplaçable par Redis pub/sub plus tard).

### 3.5 Modération

1. L'app envoie un signalement (`POST /v1/reports`).
2. Le backoffice liste les signalements (`GET /v1/admin/reports`) et en traite un : suppression logique du contenu ou classement.
3. L'API écrit l'action dans le **journal d'audit**, puis enfile un job de purge des fichiers concernés.

### 3.6 Tâches planifiées (jobs récurrents BullMQ)

| Job | Fréquence | Rôle |
|---|---|---|
| `purge-orphan-media` | Toutes les heures | Supprime les médias jamais attachés après 24 h (uploads abandonnés) |
| `purge-deleted-accounts` | À la demande + quotidien | Purge les données et fichiers d'un compte supprimé |
| `purge-instants` (P3) | Toutes les heures | Supprime les fichiers des instants ouverts par tous ou expirés |

Les stories expirées ne sont **pas** supprimées : elles sont archivées (filtre `expires_at`), ce qui permet les stories à la une.

## 4. Contrat partagé

`packages/contract/openapi.yaml` décrit tous les endpoints REST **et** les événements WebSocket (sous forme de schémas). Il génère :

| Cible | Outil |
|---|---|
| Client Swift | `swift-openapi-generator` |
| Types de l'API | `openapi-typescript` |
| Client du backoffice | `openapi-typescript` + `openapi-fetch` |

## 5. Organisation du repo

```
clone-instagram/
├── apps/
│   ├── api/            # Fastify, hexagonal
│   ├── worker/         # consommateurs BullMQ
│   └── backoffice/     # Next.js
├── packages/
│   ├── contract/       # openapi.yaml + types générés
│   └── db/             # schéma Drizzle, migrations, seed (partagé API + worker)
├── ios/                # projet Xcode
├── supabase/           # config.toml de la CLI Supabase
├── docker-compose.yml  # Redis
├── .env.example
├── CLAUDE.md           # conventions globales pour l'IA
└── docs/
    ├── cahier-des-charges/  # ce cahier des charges
    └── adr/                 # décisions d'architecture (ADR) et agent ADR
```

Le domaine et les use cases vivent dans `apps/api`. Le worker importe uniquement `packages/db` et ses propres adapters : il ne porte pas de logique métier (voir 06).

## 6. Environnement local

| Élément | Commande / outil |
|---|---|
| Supabase (Postgres, Auth, Storage, Studio) | `supabase start` |
| Redis | `docker compose up -d` |
| API, worker, backoffice | `pnpm dev` |
| App iOS | Xcode, sur iPhone physique |

**Pièges à traiter dès le départ :**

- **L'iPhone ne peut pas atteindre `localhost`.** L'API et Supabase doivent être joignables via l'IP locale du Mac. ⚠️ À vérifier : les URL publiques générées par Supabase Storage doivent utiliser cette IP, sinon les médias ne s'affichent pas sur le téléphone.
- **Côté iOS** : exception ATS `NSAllowsLocalNetworking`, description de la permission réseau local (`NSLocalNetworkUsageDescription`), URL fournies par des fichiers `.xcconfig` par environnement.
- **ffmpeg** doit être installé sur la machine qui exécute le worker (ou le worker tourne dans un conteneur qui l'inclut).

## 7. Gestion des secrets

- Fichiers `.env` **non versionnés** ; un `.env.example` versionné liste les variables sans valeurs.
- La clé `service_role` de Supabase n'est présente **que** dans l'API et le worker.
- L'app iOS et le navigateur ne reçoivent que la clé publique et les URL.
- Les clés APNs (P2) et la configuration Sign in with Apple restent hors du repo.
