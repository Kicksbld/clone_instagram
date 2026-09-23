# 07 — Backoffice

## 1. Stack

| Besoin | Choix | Justification |
|---|---|---|
| Framework | Next.js (App Router), dernière version stable (à vérifier au démarrage) | Rendu serveur, Server Actions |
| Langage | TypeScript `strict` | — |
| Style | Tailwind CSS | — |
| Composants | shadcn/ui (tables, formulaires, dialogues, toasts) | Couvre les besoins d'un outil d'administration |
| Tables | shadcn DataTable (TanStack Table) | Pagination et filtres côté serveur |
| Formulaires | react-hook-form + Zod | — |
| Accès API | `openapi-fetch` + types générés depuis `packages/contract` | Client typé, aucune route inventée |
| Session | `@supabase/ssr` (cookies httpOnly) | Le jeton n'est jamais exposé au JavaScript du navigateur |
| Lecture vidéo | `hls.js` | Chrome ne lit pas le HLS nativement |
| Tests | Vitest ; Playwright pour les parcours critiques | — |

## 2. Architecture

### 2.1 Pourquoi pas MVC

- Il n'y a **pas de « Model »** dans le backoffice : il ne parle qu'à l'API. Le modèle et la logique métier vivent dans le backend.
- Next.js (App Router) s'organise autour des Server Components, des Server Actions et du routage par dossiers ; une couche de « controllers » serait artificielle.

### 2.2 Organisation par feature

Trois responsabilités séparées :

| Responsabilité | Où | Rôle |
|---|---|---|
| Accès aux données | `features/*/data/` + `lib/api/` | Requêtes (lectures) et actions (mutations) vers l'API |
| Orchestration | Pages (Server Components) et Server Actions | Charger les données, déclencher les mutations, revalider |
| Présentation | `features/*/components/`, `components/ui/` | Composants sans logique métier |

```
apps/backoffice/src/
├── app/                      # routes uniquement
│   ├── (auth)/login/
│   └── (admin)/
│       ├── dashboard/
│       ├── reports/
│       ├── users/
│       ├── content/
│       └── audit/
├── features/
│   ├── reports/
│   │   ├── components/
│   │   ├── data/             # queries.ts, actions.ts
│   │   └── schemas/          # Zod (formulaires)
│   ├── users/
│   ├── content/
│   ├── audit/
│   └── dashboard/
├── lib/
│   ├── api/                  # client openapi-fetch, injection du jeton côté serveur
│   └── auth/                 # session Supabase côté serveur
├── components/ui/            # composants shadcn
└── middleware.ts             # redirection des visiteurs non connectés (confort, pas sécurité) ;
                              # nom du fichier à vérifier selon la version de Next.js (proxy.ts dans les versions récentes)
```

Règles vérifiées par le lint :
- Seuls les fichiers `features/*/data/` importent `lib/api`.
- Les composants n'effectuent jamais de requête eux-mêmes.
- Aucun appel à l'API depuis le navigateur : tout passe par le serveur Next.js.

## 3. Sécurité

| Point | Règle |
|---|---|
| Autorité | L'API vérifie le rôle `admin` dans chaque use case d'administration ; c'est elle qui fait foi |
| Server Actions | Ce sont des endpoints POST publics : **chaque action revérifie la session** avant d'appeler l'API. Le middleware ne suffit pas |
| Jeton | Stocké en cookie httpOnly, lu côté serveur, jamais transmis au client |
| Actions destructives | Dialogue de confirmation avec motif obligatoire (bannissement, suppression) |
| Traçabilité | Chaque action est enregistrée par l'API dans le journal d'audit |
| Création des admins | Par script ou migration de seed (pas d'écran d'inscription admin) |

## 4. Fonctionnalités

| P | Écran | Contenu |
|---|---|---|
| P0 | Connexion | Email + mot de passe ; refus si le compte n'a pas le rôle admin |
| P0 | File de modération | Signalements ouverts, filtres (motif, type de contenu), aperçu du contenu signalé (image, vidéo, texte), actions « supprimer le contenu » ou « classer » avec note |
| P0 | Utilisateurs | Recherche, fiche (profil, statut, compteurs, signalements reçus et émis), suspendre, bannir, réactiver, supprimer |
| P1 | Contenus | Liste filtrable des posts, reels, stories, commentaires ; suppression directe |
| P1 | Journal d'audit | Liste filtrable (admin, action, période) |
| P1 | Tableau de bord | Compteurs : utilisateurs, posts du jour, signalements ouverts, médias en échec |
| P2 | Statistiques | Évolution dans le temps |
| P2 | Jobs médias | Médias en échec, motif, relance |

Conventions d'interface :
- Pagination, tri et filtres **dans l'URL** (partageables, compatibles avec le rendu serveur).
- États vides, de chargement et d'erreur explicites sur chaque écran.
- Toast de confirmation après chaque action ; revalidation de la page concernée.

## 5. Tests

| Niveau | Outil | Contenu |
|---|---|---|
| Logique | Vitest | Schémas Zod, formatage, construction des filtres |
| Parcours | Playwright | Connexion admin ; refus d'un non-admin ; traitement d'un signalement ; bannissement d'un utilisateur |
