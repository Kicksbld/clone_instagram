# ADR-004 — Supabase comme infrastructure derrière l'API

## Statut
Proposé

## Contexte
Il nous faut Postgres, un service d'authentification (email + mot de passe, Sign in with Apple) et un stockage de fichiers, en local comme sur la démo hébergée.

Supabase fournit ces briques, mais expose aussi par défaut une API de données automatique (PostgREST), un service temps réel et un modèle d'autorisation par RLS. Si les clients s'en servaient directement, la logique métier serait éparpillée entre l'API, les policies RLS et les clients, ce qui contredit l'architecture hexagonale.

La clé publique Supabase est embarquée dans l'app : sans protection, elle permet de lire la base sans passer par l'API.

Décision source : D5.

## Décision
- **L'API est la seule porte d'entrée vers les données.** Supabase sert d'infrastructure : Postgres, Auth, Storage.
- Deux exceptions encadrées côté clients :
  - la **connexion** via Supabase Auth (module `Auth` de `supabase-swift` dans l'app, `@supabase/ssr` dans le backoffice) ;
  - le **transfert de fichiers** via des URL d'upload présignées et des URL publiques ou signées délivrées par l'API.
- Pas de PostgREST côté client, pas de Supabase Realtime, pas de RLS comme mécanisme d'autorisation.
- Sur toutes nos tables : **RLS activé sans aucune policy** (refus total) ou exposition du schéma `public` désactivée. Un test vérifie qu'on ne peut rien lire avec la clé publique.
- L'API vérifie elle-même la signature des JWT Supabase.
- `profiles.id` = identifiant Supabase Auth ; le profil est créé par `POST /v1/me/onboarding`, pas par un trigger. Le schéma `auth` n'est jamais modifié.
- La clé `service_role` n'est présente que dans l'API et le worker.
- La configuration Supabase (exposition du schéma, buckets, fournisseur Apple) est identique entre la CLI et le Cloud.

## Alternatives
- Clients connectés directement à Supabase (PostgREST, RLS, Realtime) : moins de code serveur, mais logique métier répartie entre policies SQL et clients, difficile à tester et contraire à l'architecture hexagonale. Écarté (D5).
- Postgres, authentification et stockage auto-gérés sans Supabase : contrôle total, mais beaucoup trop de travail à mettre en place (auth, Sign in with Apple, stockage S3, URL signées). Non retenu.

## Conséquences
### Positives
- Toute la logique métier et l'autorisation vivent dans l'API, testées au même endroit.
- Même pile en local (CLI) et en démo (Cloud).
- Auth et Storage fournis clés en main, y compris Sign in with Apple.

### Négatives
- Risque élevé d'exposer la base si la protection RLS / exposition du schéma est oubliée sur une nouvelle table.
- Une partie des fonctionnalités de Supabase est volontairement inutilisée.
- Écarts possibles de configuration entre CLI et Cloud à surveiller.

## Liens
- ADR-005 (l'API porte toute la logique)
- ADR-008 (upload présigné vers Storage)
- ADR-009 (Supabase CLI en local, Cloud en démo)
