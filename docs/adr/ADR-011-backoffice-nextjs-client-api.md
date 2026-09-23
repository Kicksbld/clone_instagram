# ADR-011 — Backoffice Next.js organisé par feature, client de l'API uniquement

## Statut
Proposé

## Contexte
Le backoffice P0 couvre la connexion admin, la file de modération, la gestion des utilisateurs (dont suspension, bannissement, suppression) et la page Analytics.

Il manipule des actions sensibles, et toute la logique métier vit déjà dans l'API (ADR-004, ADR-005). Le dupliquer en accédant directement à la base créerait un second backend.

Décision source : D17.

## Décision
- **Stack** : Next.js (App Router, dernière version stable à vérifier au démarrage), TypeScript `strict`, Tailwind CSS, shadcn/ui (tables, formulaires, dialogues, toasts), shadcn DataTable (TanStack Table) avec pagination et filtres côté serveur, react-hook-form + Zod, Vitest et Playwright ; hébergé sur Vercel. `hls.js` pour la lecture vidéo à partir de la P1.
- **Client de l'API uniquement** (`/v1/admin/*`) via `openapi-fetch` et les types générés ; jamais d'accès direct à la base ni à PostHog.
- **Organisation par feature** :

```
apps/backoffice/src/
├── app/                   # routes uniquement : (auth)/login, (admin)/users, reports, analytics…
├── features/<feature>/
│   ├── components/        # présentation, sans logique métier ni requête
│   ├── data/              # queries.ts (lectures), actions.ts (Server Actions)
│   └── schemas/           # Zod (formulaires)
├── lib/
│   ├── api/               # client openapi-fetch, injection du jeton côté serveur
│   └── auth/              # session Supabase côté serveur
├── components/ui/         # composants shadcn
└── middleware.ts          # redirection des non-connectés (confort) ; nom du fichier à vérifier selon la version (proxy.ts)
```

- Règles vérifiées par le lint : seuls les fichiers `features/*/data/` importent `lib/api` ; les composants n'effectuent jamais de requête.
- **Aucun appel API depuis le navigateur** : tout passe par le serveur Next.js ; jeton en cookie httpOnly (`@supabase/ssr`), jamais transmis au client.
- **Chaque Server Action revérifie la session** avant d'appeler l'API (ce sont des endpoints POST publics) ; le middleware n'est qu'un confort.
- L'API reste l'autorité pour le rôle `admin` (vérifié dans chaque use case d'administration) ; la connexion d'un compte sans rôle `admin` est refusée. Chaque action admin qui modifie des données est écrite par l'API dans `admin_audit_log`. Actions destructives (bannissement, suppression) confirmées par un dialogue avec motif obligatoire.
- **Conventions d'interface** : pagination, tri et filtres dans l'URL ; états vides, de chargement et d'erreur explicites sur chaque écran ; toast de confirmation après chaque action et revalidation de la page concernée.
- Création des admins par script ou seed, sans écran d'inscription.

## Alternatives
- Architecture MVC : il n'y a pas de modèle côté backoffice, les controllers seraient artificiels. Écarté (D17).
- Accès direct à la base : plus rapide à écrire, mais logique dupliquée et autorisation contournée. Écarté (D17).
- Appels API depuis le navigateur : plus simple, mais jeton exposé au JavaScript. Non retenu.

## Conséquences
### Positives
- Une seule logique métier et une seule autorisation, dans l'API.
- Jeton admin jamais exposé au navigateur.
- Organisation prévisible pour l'IA.

### Négatives
- Chaque besoin du backoffice demande d'abord un endpoint admin dans le contrat et l'API.
- Server Actions à sécuriser une par une (revérification de la session).

## Liens
- ADR-003 (client `openapi-fetch`)
- ADR-004 (l'API est la seule porte d'entrée)
- ADR-013 (analytics : pas de duplication, lien direct vers PostHog)
- ADR-014 (tests Vitest et Playwright)
