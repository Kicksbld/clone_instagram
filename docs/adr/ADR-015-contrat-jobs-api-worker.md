# ADR-015 — Contrat des jobs entre l'API et le worker : package `packages/jobs`

## Statut
Proposé

## Contexte
L'API enfile des jobs BullMQ que le worker consomme (`process-image`, `purge-account`, `purge-content-files`…, ADR-008). Les deux processus doivent s'accorder sur les noms des files, les noms des jobs, la forme de chaque payload et, pour les jobs média, la valeur de retour `{ mediaId, ownerId }` lue par l'adapter `QueueEvents` de l'API à partir de la P1.

Aucun emplacement n'est prévu pour ce contrat :
- `packages/contract/openapi.yaml` décrit les échanges avec les clients (REST et WebSocket, ADR-003), pas les messages internes au backend ;
- le worker n'importe jamais `apps/api` (ADR-002), et l'API ne doit pas dépendre d'une autre app ;
- `packages/db` porte le schéma et les transitions de statut, pas la file de jobs.

Si chaque côté écrit ses propres types, un champ renommé d'un seul côté ne casse pas la compilation : le job échoue à l'exécution, en arrière-plan, après ses tentatives. Les payloads arrivent de Redis sans aucun typage à l'exécution. L'API et le worker sont déployés séparément sur Railway (ADR-009) : pendant un déploiement, un job enfilé par l'ancienne version peut être traité par la nouvelle.

## Décision
- Un troisième package partagé, **`packages/jobs`**, importé par l'API et le worker. Il contient :
  - les noms des files (`media`, `maintenance`, puis `push` en P2) et des jobs ;
  - pour chaque job, un **schéma Zod** du payload et, s'il en a une, de la valeur de retour ; les types TypeScript en sont déduits (`z.infer`), jamais écrits à la main ;
  - les options communes des jobs (3 tentatives, délai croissant ; ADR-008).
- `packages/jobs` ne dépend que de Zod : ni BullMQ, ni `packages/db`, ni aucune app.
- **Payloads minimaux** : uniquement des identifiants (ex. `{ mediaId }`). Le worker relit l'état en base avant d'agir ; aucun fichier, aucune donnée métier ni donnée personnelle dans un payload.
- **Validation à la réception** : le worker valide chaque payload avec son schéma avant tout traitement. Un payload invalide fait échouer le job définitivement, sans nouvelle tentative, et l'erreur est journalisée.
- **Côté API, hexagonal (ADR-005)** : le port `JobQueue` (`shared/application`) expose une méthode par intention (ex. `enqueueImageProcessing(mediaId)`) avec des types de la couche application ; seul l'adapter BullMQ (`shared/infrastructure`) importe `packages/jobs`. dependency-cruiser interdit l'import de `packages/jobs` hors de `infrastructure/`.
- **Évolution compatible** : un job déjà en file doit rester traitable par la nouvelle version du worker. On peut ajouter un champ optionnel ; renommer, supprimer ou changer le type d'un champ impose un nouveau nom de job.
- La forme exacte de chaque payload est écrite dans `packages/jobs` par la tranche qui crée le job. Jobs P0 :

| File | Job | Payload | Valeur de retour | Tranche |
|---|---|---|---|---|
| `media` | `process-image` | `{ mediaId }` | `{ mediaId, ownerId }` | T3 |
| `maintenance` | `purge-orphan-media` | aucun (job répété toutes les heures) | — | T3 |
| `maintenance` | `purge-account` | identifiant du profil supprimé | — | T13 |
| `maintenance` | `purge-content-files` | identifiant du contenu supprimé | — | T15 |

## Alternatives
- Contrat des jobs dans `packages/db` : pas de nouveau package, mais la file de jobs n'a rien à voir avec le schéma de base, et le package mélangerait deux responsabilités. Non retenu.
- Jobs décrits dans `openapi.yaml` : un seul fichier de contrat, mais des messages internes au backend apparaîtraient dans le contrat public et dans le client Swift généré. Non retenu.
- Types écrits de chaque côté : aucune configuration, mais la dérive n'est détectée qu'à l'exécution, par un job en échec. Non retenu.
- Types TypeScript seuls, sans Zod : plus léger, mais rien ne vérifie à l'exécution ce qui arrive de Redis, notamment un job enfilé par une ancienne version pendant un déploiement. Non retenu.

## Conséquences
### Positives
- Un changement de payload casse la compilation de l'API et du worker en même temps.
- Un payload invalide est refusé tout de suite, avec une erreur claire, au lieu d'échouer au milieu d'un traitement.
- Le port `JobQueue` reste indépendant de BullMQ ; les use cases se testent avec un adapter en mémoire.

### Négatives
- Un package de plus à configurer (workspace, TypeScript, lint).
- Chaque nouveau job demande une étape de plus : son schéma dans `packages/jobs`.
- La règle de compatibilité limite les changements de payload (nouveau nom de job pour un changement incompatible).

## Liens
- ADR-002 (monorepo et packages partagés)
- ADR-003 (le contrat OpenAPI reste réservé aux échanges avec les clients)
- ADR-005 (port `JobQueue`, dependency-cruiser)
- ADR-008 (files, jobs, tentatives, idempotence)
- ADR-009 (déploiements séparés de l'API et du worker)
- ADR-014 (outils de qualité)
