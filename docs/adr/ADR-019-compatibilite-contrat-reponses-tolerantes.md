# ADR-019 — Compatibilité du contrat : réponses tolérantes, ruptures détectées par la CI

## Statut
Proposé

## Contexte
Le contrat (ADR-003) déclarait `additionalProperties: false` sur tous ses objets, entrées comme réponses. Le client Swift généré par `swift-openapi-generator` applique cette règle au décodage : un champ inconnu dans une réponse fait échouer tout le décodage.

En T10, `GET /v1/me` a gagné le champ `plan`. Dès le déploiement de l'API, une app compilée avant T10 n'a plus pu décoder son propre profil et affichait « Connexion impossible », alors que l'API répondait normalement. Le même problème reviendra à chaque tranche qui ajoute un champ, et dès qu'une version de l'app tournera sur un iPhone sans être recompilée.

Côté API, `additionalProperties: false` n'apporte rien sur une réponse : Fastify sérialise les réponses avec leur schéma et n'envoie jamais un champ absent du contrat.

La relecture du diff de `openapi.yaml` (ADR-003) ne suffit pas à repérer une rupture : ajouter un champ obligatoire à une réponse paraît anodin.

## Décision
- **Entrées strictes, réponses tolérantes** : `additionalProperties: false` est obligatoire sur les schémas d'entrée (corps de requête) et interdit sur les schémas de réponse. Un client ignore un champ de réponse qu'il ne connaît pas ; l'API rejette toujours un champ d'entrée inconnu (ADR-003, ADR-005).
- **Changements compatibles** (déployables sans recompiler l'app) : nouvel endpoint, nouveau champ dans une réponse (obligatoire ou facultatif), nouveau champ facultatif dans une entrée, nouveau code d'erreur sur un statut déjà documenté.
- **Changements cassants** (interdits sauf exception assumée) : retirer ou renommer un champ de réponse obligatoire, changer un type, rendre obligatoire un champ d'entrée, ajouter une valeur à une énumération d'une réponse (le client Swift ne décode pas une valeur inconnue), retirer un endpoint ou un statut de réponse.
- **Garde-fou CI** : `oasdiff breaking` (version épinglée, binaire vérifié par sa somme SHA-256) compare `packages/contract/openapi.yaml` à celui de `main` et fait échouer la CI sur toute erreur. En local : `pnpm contract:breaking` (oasdiff installé par Homebrew).
- **Rupture assumée** : décidée par le lead dev, listée dans `packages/contract/oasdiff-err-ignore.txt` (créé à cette occasion) et signalée dans la PR, avec la consigne de recompiler l'app avant de tester sur la démo. Une valeur d'énumération ajoutée à une réponse suit cette procédure.
- Garanties testées : côté API, un champ hors contrat n'est jamais envoyé ; côté iOS, `GET /v1/me` décode une réponse qui contient un champ inconnu.

## Alternatives
- Statu quo, tout strict, en recompilant l'app avant chaque déploiement de l'API : aucun changement, mais chaque ajout de champ casse les versions installées et le problème de T10 revient. Écarté par le lead dev.
- Nouvelle version d'API (`/v2`) à chaque changement de forme : robuste, mais très lourd pour un projet mené tranche par tranche. Écarté par le lead dev.
- Règle écrite sans garde-fou CI : rien à installer, mais une rupture ne se voit pas à la relecture du diff. Écarté par le lead dev.

## Conséquences
### Positives
- Ajouter un champ à une réponse ne casse plus une app déjà installée ; l'API peut être déployée avant la recompilation de l'app.
- Les ruptures sont détectées automatiquement à chaque push, et non sur l'iPhone.
- Les entrées restent rejetées si elles contiennent un champ inconnu.

### Négatives
- Un outil de plus dans la CI (oasdiff), épinglé et mis à jour à la main.
- Le client Swift ne signale plus un champ inattendu : un champ ajouté par erreur à l'API n'est plus visible côté app.
- Une rupture assumée demande une étape explicite (fichier d'exceptions et recompilation de l'app).

## Liens
- ADR-003 (contrat OpenAPI unique, validation des entrées)
- ADR-005 (validation des entrées par les schémas du contrat)
- ADR-010 (conversion des DTO dans l'app)
- ADR-014 (CI)
- ADR-017 (client OpenAPI généré dans la cible `APIClient`)
