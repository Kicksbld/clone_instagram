# ADR-009 — Deux environnements : dev local et démo hébergée déployée dès le début

## Statut
Proposé

## Contexte
La démo se fait sur un iPhone physique. En tout-local (D19, remplacée), un wifi d'école peut bloquer la communication entre appareils, `localhost` est injoignable depuis l'iPhone et l'app aurait besoin d'exceptions ATS pour le HTTP.

Le worker est un processus long qui a besoin de ffmpeg, et l'API ouvre des WebSocket (P1) : l'hébergement doit accepter des processus longs et une image Docker personnalisée.

Découvrir les problèmes de déploiement en fin de projet serait trop tard.

Décisions sources : D29 (remplace D19), D31.

## Décision
- **Deux environnements, même code, même architecture ; seule la configuration change.** Mêmes noms de variables d'environnement partout.

| Élément | Dev (local) | Démo (hébergée) |
|---|---|---|
| Postgres, Auth, Storage | Supabase CLI (`supabase start`) | Supabase Cloud (projet dédié à la démo) |
| API | `pnpm dev` | Railway, service `api` (Dockerfile) |
| Worker | `pnpm dev` | Railway, service `worker` (Dockerfile avec ffmpeg) |
| Redis | `docker compose up -d` | Railway, service Redis |
| Backoffice | `pnpm dev` | Vercel |
| App iOS | configuration `Local` | configuration `Demo` (HTTPS) |

- Le **squelette** (API `/health`, worker, backoffice, app connectée) est déployé **dès le début**, puis chaque tranche est validée sur la démo.
- Railway et Vercel déploient automatiquement `main` une fois la CI verte (ADR-014).
- **Les migrations Drizzle sont appliquées sur Supabase Cloud par une étape de pré-déploiement Railway** du service `api`, exécutée avant le démarrage de la nouvelle version. Si la migration échoue, la nouvelle version ne démarre pas. Aucune migration n'est appliquée à la main sur la démo.
- Supabase Cloud est configuré comme le local : API de données (PostgREST) désactivée et RLS sans policy (ADR-004), mêmes buckets (ADR-008), fournisseur Apple.
- **Variables d'environnement** de l'API et du worker (valeurs dans `.env` en local, dans Railway en démo) :

| Variable | Utilisée par |
|---|---|
| `DATABASE_URL` | API, worker |
| `SUPABASE_URL` | API, worker |
| `SUPABASE_SERVICE_ROLE_KEY` | API, worker |
| `SUPABASE_JWT_ISSUER` (clés publiques lues sur `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, ADR-018) | API |
| `REDIS_URL` | API, worker |
| `PUBLIC_MEDIA_BASE_URL` | API (URL joignable depuis l'iPhone) |
| `API_PORT`, `LOG_LEVEL` | API |
| `REVENUECAT_SECRET_KEY`, `REVENUECAT_PROJECT_ID` | API, worker (purge) |
| `POSTHOG_HOST`, `POSTHOG_PROJECT_API_KEY` | API (événements serveur) |
| `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID` | API (lectures admin), worker (purge) |
| `APNS_*` (P2) | Worker |

  En démo, `DATABASE_URL` pointe vers Supabase Cloud et `PUBLIC_MEDIA_BASE_URL` vers l'URL publique du Storage Supabase Cloud.
- **Secrets** : `.env` non versionné et `.env.example` versionné (variables sans valeurs) ; variables Railway et Vercel en démo ; jamais dans le repo ni dans les Dockerfiles. `SUPABASE_SERVICE_ROLE_KEY`, la clé secrète RevenueCat et la clé personnelle PostHog ne sont présentes que dans l'API et le worker. L'app et le navigateur ne reçoivent que des clés publiques (Supabase, RevenueCat, projet PostHog) et des URL. Clés APNs et configuration Sign in with Apple hors du repo.
- **Pièges du dev local** :
  - l'iPhone ne peut pas atteindre `localhost` : pour tester sur iPhone en dev, l'API et Supabase doivent être joignables via l'IP locale du Mac, y compris `PUBLIC_MEDIA_BASE_URL` ; sinon, simulateur ou démo ;
  - iOS : `NSAllowsLocalNetworking` et `NSLocalNetworkUsageDescription` uniquement dans la configuration `Local` (ADR-010) ;
  - ffmpeg doit être installé sur la machine qui exécute le worker en dev ; en démo, il est dans l'image Docker du worker.

## Alternatives
- Tout en local (D19) : gratuit et simple, mais démo fragile selon le réseau, IP locale à gérer, HTTP sans TLS. Remplacé par D29.
- Render ou Fly.io au lieu de Railway : écartés (D29) ; Railway accepte les processus longs et une image avec ffmpeg.
- Migrations appliquées manuellement sur Supabase Cloud : aucun outillage, mais risque d'oubli ou de décalage entre le schéma et la version déployée de l'API. Écarté par le lead dev au profit de l'étape de pré-déploiement (D31).

## Conséquences
### Positives
- Démo fiable sur n'importe quel réseau, en HTTPS, sans exception iOS.
- Problèmes de déploiement découverts dès le premier jour.
- Schéma de la démo toujours aligné sur la version déployée de l'API.

### Négatives
- Deux configurations Supabase (CLI et Cloud) à garder identiques.
- Coût et limites des offres gratuites ; le projet Supabase gratuit peut être mis en pause après inactivité (à réveiller avant la démo).
- Une migration destructrice s'applique automatiquement sur la démo dès la fusion dans `main`.
- Connexion Railway → Supabase Cloud (directe ou pooler selon le support IPv6) à vérifier.
- La démo n'est pas une production : une seule instance d'API, de worker et de Redis, pas de supervision.

## Liens
- ADR-001 (chaque tranche validée sur la démo)
- ADR-004 (Supabase CLI et Cloud)
- ADR-007 (migrations drizzle-kit)
- ADR-008 (worker avec ffmpeg)
- ADR-010 (configurations `Local` et `Demo`)
- ADR-014 (CI)
