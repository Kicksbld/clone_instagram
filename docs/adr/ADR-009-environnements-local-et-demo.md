# ADR-009 — Deux environnements : dev local et démo hébergée déployée dès le début

## Statut
Proposé

## Contexte
La démo se fait sur un iPhone physique. En tout-local (D19, remplacée), un wifi d'école peut bloquer la communication entre appareils, `localhost` est injoignable depuis l'iPhone et l'app aurait besoin d'exceptions ATS pour le HTTP.

Le worker est un processus long qui a besoin de ffmpeg, et l'API ouvre des WebSocket (P1) : l'hébergement doit accepter des processus longs et une image Docker personnalisée.

Découvrir les problèmes de déploiement en fin de projet serait trop tard.

Décision source : D29 (remplace D19).

## Décision
- **Deux environnements, même code, même architecture ; seule la configuration change.** Mêmes noms de variables d'environnement partout.

| Élément | Dev (local) | Démo (hébergée) |
|---|---|---|
| Postgres, Auth, Storage | Supabase CLI (`supabase start`) | Supabase Cloud |
| API | `pnpm dev` | Railway, service `api` (Dockerfile) |
| Worker | `pnpm dev` | Railway, service `worker` (Dockerfile avec ffmpeg) |
| Redis | `docker compose up -d` | Railway, service Redis |
| Backoffice | `pnpm dev` | Vercel |
| App iOS | configuration `Local` | configuration `Demo` (HTTPS) |

- Le **squelette** (API `/health`, worker, backoffice, app connectée) est déployé **dès le début**, puis chaque tranche est validée sur la démo.
- Railway et Vercel déploient automatiquement `main` une fois la CI verte.
- **Les migrations Drizzle sont appliquées sur Supabase Cloud par une étape de pré-déploiement Railway** du service `api`, exécutée avant le démarrage de la nouvelle version. Si la migration échoue, la nouvelle version ne démarre pas. Aucune migration n'est appliquée à la main sur la démo.
- Secrets : `.env` non versionné et `.env.example` versionné en local ; variables Railway et Vercel en démo ; jamais dans le repo ni dans les Dockerfiles.
- iOS : `NSAllowsLocalNetworking` et `NSLocalNetworkUsageDescription` uniquement dans la configuration `Local`.

## Alternatives
- Tout en local (D19) : gratuit et simple, mais démo fragile selon le réseau, IP locale à gérer, HTTP sans TLS. Remplacé par D29.
- Render ou Fly.io au lieu de Railway : écartés (D29) ; Railway accepte les processus longs et une image avec ffmpeg.
- Migrations appliquées manuellement sur Supabase Cloud : aucun outillage, mais risque d'oubli ou de décalage entre le schéma et la version déployée de l'API. Écarté par le lead dev au profit de l'étape de pré-déploiement.

## Conséquences
### Positives
- Démo fiable sur n'importe quel réseau, en HTTPS, sans exception iOS.
- Problèmes de déploiement découverts dès le premier jour.
- Schéma de la démo toujours aligné sur la version déployée de l'API.

### Négatives
- Deux configurations Supabase (CLI et Cloud) à garder identiques.
- Coût et limites des offres gratuites ; le projet Supabase gratuit peut être mis en pause après inactivité.
- Une migration destructrice s'applique automatiquement sur la démo dès la fusion dans `main`.
- Connexion Railway → Supabase Cloud (directe ou pooler selon le support IPv6) à vérifier.

## Liens
- ADR-001 (chaque tranche validée sur la démo)
- ADR-004 (Supabase CLI et Cloud)
- ADR-007 (migrations drizzle-kit)
- ADR-008 (worker avec ffmpeg)
