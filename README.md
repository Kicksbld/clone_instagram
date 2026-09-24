# Clone Instagram

Projet de cours : un clone d'Instagram composé de trois produits.

- **App iOS** : SwiftUI.
- **Backend** : une API Fastify et un worker BullMQ.
- **Backoffice d'administration** : Next.js.

Le projet tourne dans deux environnements : en local pour le développement, et sur une démo hébergée (Supabase Cloud, Railway, Vercel). Les deux sont en place (§ 7).

> **Avancement** : T0a (socle TypeScript, contrat d'API, CI) est terminée. T0b (squelette iOS : l'app affiche l'état de `/health`) est terminée. T1 (démo hébergée : Supabase Cloud, Railway, Vercel) est terminée. Détail dans le [plan P0](docs/plan/P0.md).

---

## 1. Prérequis

| Outil | Version | Installation (macOS) |
|---|---|---|
| Docker Desktop | récent | [docker.com](https://www.docker.com/products/docker-desktop/) — **doit être lancé** avant toute commande |
| Node.js | 24 | `nvm install 24` (le fichier `.nvmrc` fixe la version) |
| pnpm | 10 (épinglé) | `corepack enable` ; la bonne version est lue dans `package.json` |
| Supabase CLI | ≥ 2.117 | `brew install supabase/tap/supabase` (mise à jour : `brew upgrade supabase`) |
| Xcode | 27 (SDK iOS 27) | Mac App Store ; app iOS uniquement |
| XcodeGen, SwiftLint, SwiftFormat | récents | `brew bundle --file ios/Brewfile` (fait par `ios/scripts/bootstrap.sh`) |

## 2. Première installation

À faire une seule fois, après le clonage :

```bash
git clone git@github.com:Kicksbld/clone_instagram.git
cd clone_instagram
nvm use                  # Node 24
corepack enable          # active pnpm
pnpm install

cp .env.example .env     # puis compléter les valeurs locales (voir ci-dessous)

supabase start           # Postgres, Auth, Storage, Studio (premier lancement : téléchargement des images Docker)
docker compose up -d     # Redis
pnpm db:migrate          # applique les migrations
```

**Valeurs locales à renseigner dans `.env`.** Les autres variables servent aux tranches suivantes et peuvent rester vides pour l'instant.

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres   # « Database URL » de `supabase status`
REDIS_URL=redis://127.0.0.1:6379
API_URL=http://127.0.0.1:3000
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_PUBLISHABLE_KEY=sb_publishable_…                          # « Publishable » de `supabase status`
```

> `.env` n'est jamais versionné. Les noms de variables sont les mêmes en local et sur la démo ; seules les valeurs changent.

## 3. Lancer le projet (au quotidien)

Docker Desktop doit être lancé.

```bash
supabase start           # base de données, auth, stockage
docker compose up -d     # Redis
pnpm dev                 # API + worker + backoffice (Ctrl+C pour arrêter)
```

**Vérifier que tout tourne :**

| Service | Adresse | Attendu |
|---|---|---|
| API | http://localhost:3000/health | `{"status":"ok"}` |
| Backoffice | http://localhost:3001 | « API : ok » |
| Worker | logs de `pnpm dev` | `Worker démarré` (files `media`, `maintenance`) |
| Supabase Studio | http://127.0.0.1:54323 | interface d'administration de la base |
| Mails de test (Mailpit) | http://127.0.0.1:54324 | emails envoyés par Supabase Auth |

## 4. App iOS

**Première fois** (installe les outils, crée les fichiers de configuration locaux et génère le projet Xcode) :

```bash
ios/scripts/bootstrap.sh
open ios/CloneInstagram.xcodeproj
```

Le projet Xcode est généré à partir de `ios/project.yml` et n'est pas versionné : relancer `xcodegen generate` (depuis `ios/`) après un `git pull` qui modifie `project.yml`. Au premier build, Xcode demande d'autoriser le plugin `OpenAPIGenerator` : accepter.

**Lancer** : l'API doit tourner (`pnpm dev`). Dans Xcode, choisir le schéma `CloneInstagram` et un simulateur, puis ▶︎. L'écran « État de l'API » doit afficher « API disponible ».

| Configuration | Schéma | Fichier à compléter (non versionné) | API appelée |
|---|---|---|---|
| Local | `CloneInstagram` | `ios/CloneInstagram/Resources/Config/Local.xcconfig` | `http://localhost:3000` (simulateur) ; sur iPhone, l'IP du Mac |
| Demo | `CloneInstagram-Demo` | `ios/CloneInstagram/Resources/Config/Demo.xcconfig` | API Railway (à partir de T1) |

**Tests** (en local, pas de CI macOS) :

```bash
cd ios
xcodebuild test -project CloneInstagram.xcodeproj -scheme CloneInstagram \
  -destination 'platform=iOS Simulator,name=iPhone 17' -skipPackagePluginValidation
```

SwiftLint et SwiftFormat sont lancés à chaque build (et à la main : `swiftlint lint`, `swiftformat --lint .` depuis `ios/`).

## 5. Arrêter et relancer

| Action | Commande | Données |
|---|---|---|
| Arrêter l'API, le worker et le backoffice | `Ctrl+C` dans le terminal de `pnpm dev` | — |
| Arrêter Supabase | `supabase stop` | **conservées** (volume Docker) |
| Arrêter Redis | `docker compose stop` | conservées |
| Relancer plus tard | `supabase start`, puis `docker compose up -d`, puis `pnpm dev` | retrouvées |

**Repartir de zéro** (efface toutes les données locales) :

```bash
supabase stop --no-backup      # supprime la base locale
docker compose down -v         # supprime le conteneur et les données Redis
```

Au prochain `supabase start`, relancer `pnpm db:migrate` (puis `pnpm db:seed` quand un seed existera).

## 6. Commandes utiles

| Commande | Rôle |
|---|---|
| `pnpm dev` | Lance l'API (port 3000), le worker et le backoffice (port 3001) |
| `pnpm lint` | ESLint, Prettier et règles d'architecture (dependency-cruiser) |
| `pnpm typecheck` | Vérification des types TypeScript |
| `pnpm test` | Tests Vitest de tous les packages |
| `pnpm build` | Build de production de l'API, du worker et du backoffice |
| `pnpm contract:generate` | Valide `openapi.yaml`, régénère les types des clients et met à jour la copie de l'app iOS |
| `pnpm db:migrate` | Applique les migrations Drizzle |
| `pnpm db:seed` | Remplit la base avec des données de démo (vide pour l'instant) |
| `pnpm test:supabase` | Vérifie qu'aucune table n'est lisible avec la clé publique Supabase (hors CI, voir § 7) |
| `supabase status` | Affiche les clés locales de Supabase (l'API de Supabase est sur http://127.0.0.1:54321) |

La CI GitHub Actions lance, à chaque push : validation du contrat, lint, typecheck, tests et build.

## 7. Démo hébergée

Même code qu'en local ; seule la configuration change (variables dans Railway et Vercel, jamais dans le dépôt).

| Élément | Hébergement | Déploiement |
|---|---|---|
| Postgres, Auth, Storage | Supabase Cloud, projet `clone-instagram-demo` (UE) | buckets : `supabase seed buckets --linked` |
| API | Railway, service `api` (`apps/api/Dockerfile`, `apps/api/railway.json`) | automatique sur `main` après CI verte ; migrations appliquées avant le démarrage |
| Worker | Railway, service `worker` (`apps/worker/Dockerfile`, avec ffmpeg) | automatique sur `main` après CI verte |
| Redis | Railway, service Redis | — |
| Backoffice | Vercel (racine `apps/backoffice`) | automatique sur `main`, mis en ligne après CI verte |

- **Base de données** : Railway se connecte au **Session pooler** de Supabase (IPv4, port 5432) ; la connexion directe de Supabase est en IPv6 uniquement.
- **Aucune migration à la main** : Railway lance `db:migrate` avant chaque nouvelle version de l'API ; si elle échoue, l'ancienne version reste en ligne.
- **Vérifier la clé publique de la démo** :
  ```bash
  SUPABASE_URL=https://<ref>.supabase.co SUPABASE_PUBLISHABLE_KEY=<clé publishable> pnpm test:supabase
  ```
- **Coût** : Railway, offre Hobby (5 $ / mois après l'essai de 29 jours) ; Supabase en offre gratuite. Le projet Supabase gratuit se met en pause après une période d'inactivité : le réveiller depuis le dashboard avant une démo.

## 8. Organisation du code

```
apps/api/            API Fastify, architecture hexagonale par module
apps/worker/         consommateurs BullMQ (traitement des médias), sans logique métier
apps/backoffice/     backoffice Next.js, client de l'API uniquement
packages/contract/   openapi.yaml : contrat unique de l'API + types générés
packages/db/         schéma Drizzle, migrations, identifiants, pagination
packages/jobs/       contrat des jobs entre l'API et le worker
ios/                 app iOS SwiftUI (projet XcodeGen : project.yml)
supabase/            configuration de Supabase en local
docs/                cahier des charges, décisions d'architecture (ADR), plan
```

Principes clés :
- **L'API est la seule porte d'entrée vers les données.** Supabase sert d'infrastructure : Postgres, Auth, Storage. Son API de données automatique est désactivée.
- **Contract-first.** Toute évolution de l'API commence dans `packages/contract/openapi.yaml`.
- **Développement par tranches verticales**, chacune livrée dans une branche et un commit.

## 9. Documentation

| Document | Contenu |
|---|---|
| [docs/plan/P0.md](docs/plan/P0.md) | Plan de la phase P0, découpé en tranches, avec l'avancement |
| [docs/adr/](docs/adr/README.md) | Décisions d'architecture (ADR) et leurs raisons |
| [docs/ia-workflow.md](docs/ia-workflow.md) | Méthode de développement avec l'IA |
| [docs/cahier-des-charges/](docs/cahier-des-charges/) | Cahier des charges complet |

## 10. Problèmes fréquents

| Symptôme | Solution |
|---|---|
| `Cannot connect to the Docker daemon` | Lancer Docker Desktop, puis relancer la commande |
| `supabase start` : « already running » ou conteneur `created` | `supabase stop`, puis `supabase start` |
| `pnpm` introuvable ou mauvaise version | `corepack enable` (avec Node 24 actif : `nvm use`) |
| L'API refuse de démarrer : « Configuration invalide » | Compléter `.env` (la variable fautive est nommée dans le message) |
| Backoffice : « API : injoignable » | Vérifier que l'API tourne (`/health`) et que `API_URL` est renseignée dans `.env` |
| Port 3000 ou 3001 déjà utilisé | Arrêter l'autre processus : `lsof -ti tcp:3000 \| xargs kill` |
| App iOS : « API injoignable » | Vérifier que `pnpm dev` tourne ; sur iPhone, mettre l'IP du Mac dans `Local.xcconfig` (même Wi-Fi) et accepter l'accès au réseau local |
| Xcode : « Plugin must be enabled » ou build bloqué sur `OpenAPIGenerator` | Autoriser le plugin dans Xcode ; en ligne de commande, ajouter `-skipPackagePluginValidation` |
| Storage local : bucket `uploads`, `media-public` ou `media-private` absent | `supabase seed buckets` (crée les buckets déclarés dans `supabase/config.toml`) |
| Railway : l'API ne démarre pas après un déploiement | Onglet *Deployments* → logs du pré-déploiement (migration) puis du démarrage ; vérifier les variables du service |
| Xcode : fichier `.xcconfig` introuvable | Lancer `ios/scripts/bootstrap.sh` (crée `Local.xcconfig` et `Demo.xcconfig`) |
