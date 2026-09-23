# ADR-011 — Backoffice Next.js organisé par feature, client de l'API uniquement

## Statut
Proposé

## Contexte
Le backoffice P0 couvre la connexion admin, la file de modération, la gestion des utilisateurs (dont suspension, bannissement, suppression) et la page Analytics.

Il manipule des actions sensibles, et toute la logique métier vit déjà dans l'API (ADR-004, ADR-005). Le dupliquer en accédant directement à la base créerait un second backend.

Décision source : D17.

## Décision
- **Next.js (App Router)**, TypeScript `strict`, Tailwind CSS, shadcn/ui, react-hook-form + Zod ; hébergé sur Vercel.
- **Client de l'API uniquement** (`/v1/admin/*`) via `openapi-fetch` et les types générés ; jamais d'accès direct à la base ni à PostHog.
- **Organisation par feature** : `app/` ne contient que les routes ; `features/*/{components,data,schemas}`. Seuls les fichiers `features/*/data/` importent `lib/api` (vérifié par le lint).
- **Aucun appel API depuis le navigateur** : tout passe par le serveur Next.js ; jeton en cookie httpOnly (`@supabase/ssr`).
- **Chaque Server Action revérifie la session** ; le middleware n'est qu'un confort.
- L'API reste l'autorité pour le rôle `admin` ; chaque action admin est écrite dans `admin_audit_log`. Actions destructives confirmées avec un motif obligatoire.
- Pagination et filtres dans l'URL.
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
- ADR-013 (analytics lus via l'API)
