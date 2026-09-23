# ADR-003 — Contrat OpenAPI unique, contract-first, clients générés

## Statut
Proposé

## Contexte
Trois produits (app iOS en Swift, API et backoffice en TypeScript) échangent des données. Écrire les types à la main de chaque côté crée des dérives : champ renommé d'un côté seulement, endpoint inventé par l'IA, format d'erreur incohérent.

L'objectif pédagogique est de bien développer avec l'IA, en s'appuyant sur des garde-fous automatiques.

Décision source : D18.

## Décision
- `packages/contract/openapi.yaml` est **l'unique source de vérité** des échanges : endpoints REST **et** schémas des événements WebSocket.
- Workflow **contract-first** : modifier la spec → la valider (Redocly CLI) → régénérer (`pnpm contract:generate`) → implémenter.
- Génération :
  - client Swift : `swift-openapi-generator` (plugin de build, à partir d'une copie de la spec) ;
  - types de l'API : `openapi-typescript` ;
  - client du backoffice : `openapi-typescript` + `openapi-fetch`.
- Conventions communes (`04` § 1) : préfixe `/v1`, erreurs *Problem Details* (RFC 9457) avec un `code` stable, pagination `{ items, nextCursor }`, champs inconnus rejetés, contenu invisible → 404.
- Il est interdit d'inventer un endpoint ou un champ absent de la spec.
- La CI valide la spec à chaque push.

## Alternatives
- Types écrits à la main de chaque côté : aucun outillage, mais dérives inévitables entre les produits, surtout avec du code généré par IA. Écarté (D18).
- Code-first (spec générée depuis les routes Fastify) : pas de double saisie, mais le contrat n'existe qu'une fois le backend écrit, ce qui empêche de concevoir l'échange avant d'implémenter les deux côtés. Non retenu.

## Conséquences
### Positives
- Un changement de contrat casse la compilation de tous les clients concernés.
- L'IA a une référence exécutable et ne peut pas inventer de champ sans que cela se voie.
- Le format des erreurs et de la pagination est identique partout.

### Négatives
- Chaque évolution passe par une étape supplémentaire (spec, validation, régénération).
- Le code généré (surtout en Swift) doit être converti en modèles de l'app par les services.

## Liens
- ADR-001 (le contrat est la première étape de chaque tranche)
- ADR-005 (validation des entrées de l'API)
- ADR-010 (conversion DTO → modèles dans l'app)
- ADR-011 (client `openapi-fetch` du backoffice)
