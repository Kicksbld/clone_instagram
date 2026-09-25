# apps/worker — conventions

Pipeline média et files : [ADR-008](../../docs/adr/ADR-008-pipeline-media-worker.md). Contrat des jobs : [ADR-015](../../docs/adr/ADR-015-contrat-jobs-api-worker.md).

- Le worker traite des fichiers et met à jour des statuts ; il **ne porte aucune logique métier** (elle vit dans `apps/api`).
- Il n'importe que `@clone/db`, `@clone/jobs` et ses propres adapters, jamais `apps/api`.
- Statuts : uniquement via les fonctions de transition de `packages/db` (`UPDATE … WHERE status = '<attendu>'`).
- Chaque job est **idempotent** : il peut être rejoué (3 tentatives, `DEFAULT_JOB_OPTIONS` de `@clone/jobs`).

## Ajouter un job

1. Dans `packages/jobs` : nom du job, file, schéma Zod du payload (identifiants uniquement) et, s'il y en a une, de la valeur de retour ; types déduits par `z.infer`.
2. Dans le worker : un handler qui **valide d'abord le payload** avec ce schéma ; payload invalide → `UnrecoverableError` (échec définitif, journalisé), puis relit l'état en base avant d'agir.
3. L'enregistrer dans la table d'aiguillage passée à `createProcessor` (`src/main.ts`) ; un job répété est planifié au démarrage par `upsertJobScheduler` (idempotent).
4. Tests Vitest avec fichiers d'exemple (ADR-014) : images générées par sharp dans le test, `InMemoryStorage` (`test/support`) et Postgres réel (`pnpm db:migrate`).

Job de référence (T3) : `src/jobs/process-image.ts` — payload validé, état relu, erreur définitive (`UnrecoverableError`) après passage en `failed`, `processing_error` à la dernière tentative. Fichiers : port `WorkerStorage` (`src/storage.ts`, Supabase Storage avec la clé secrète).

Changement de payload : ajout d'un champ optionnel uniquement ; renommer, supprimer ou changer un type impose un nouveau nom de job (ADR-015).

## Interdits

- Logique métier, règle d'autorisation ou de visibilité dans le worker.
- Import de `apps/api`.
- Payload qui contient un fichier, une donnée métier ou une donnée personnelle.
- Traitement d'un payload non validé.
- Redis pour autre chose que la file de jobs.
- `any`, `eslint-disable` sans justification, test désactivé.
