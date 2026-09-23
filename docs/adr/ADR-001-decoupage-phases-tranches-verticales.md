# ADR-001 — Découpage en phases P0 → P3 et livraison par tranches verticales

## Statut
Proposé

## Contexte
Le projet (clone iOS d'Instagram, backend et backoffice) est réalisé par un seul développeur assisté par l'IA. Le périmètre souhaité est large.

Onboarding, paywall, analytics et A/B test sont imposés par le projet et doivent être livrés.

Il faut un ordre de réalisation clair, qui garantisse à tout moment une version fonctionnelle et démontrable, et qui limite la dérive de l'IA sur de grosses modifications.

Décisions sources : D20, D22, D23 (`09-decisions-risques.md`).

## Décision
- Le périmètre est découpé en **quatre niveaux de priorité** définis dans `01-contexte-perimetre.md` § 4 :
  - **P0 — Socle** : fondations (monorepo, contrat, squelettes, CI, environnements, pipeline images), compte et profil avec onboarding, social (abonnement, recherche, blocage, signalement), posts photo et carrousel, feed, likes, commentaires, paywall Clone Plus, analytics, A/B test, backoffice de modération, utilisateurs et analytics.
  - **P1 — Fonctionnalités majeures** : demandes d'abonnement, amis proches, stories, messages privés, reels, enregistrements, mentions, activité, likes de commentaires, audit.
  - **P2 — Fonctionnalités secondaires** : stories à la une, notes, republication, collaboration, identifications, demandes de message, collections, explorer, push.
  - **P3 — Bonus** : instants.
- **P0 est l'objectif.** P1 à P3 viennent ensuite, dans l'ordre.
- Une phase n'est commencée que lorsque la précédente est **fonctionnelle et testée**.
- Chaque feature est livrée en **tranche verticale**, dans cet ordre : contrat → migration → backend (domaine → use case → adapters → route + tests) → iOS (service → ViewModel → vues + tests) → backoffice si concerné.
- Une tranche = une branche / un commit, et n'est terminée que lorsqu'elle respecte la definition of done (`08` § 6), y compris le test sur iPhone physique sur l'environnement de démo.
- Chaque phase se termine par une stabilisation (finitions, tests, corrections), sans nouvelle feature.

## Alternatives
- Planning hebdomadaire : donne des jalons datés, mais n'ordonne pas le travail par importance. Écarté à la demande du lead dev (D20).
- Recadrage complet du périmètre : réduit la liste, mais perd la vision des features secondaires. Écarté (D22).
- Traiter onboarding, paywall, analytics et A/B test en P1 ou plus tard : allège P0, mais ces éléments sont imposés. Écarté (D23).
- Développement couche par couche (tout le backend, puis toute l'app) : rien de démontrable avant la fin, intégration tardive. Non retenu (`01` § 3).

## Conséquences
### Positives
- Une version démontrable existe à la fin de chaque tranche.
- Ordre de travail explicite pour le développeur et pour l'IA.
- Les problèmes d'intégration (contrat, déploiement, iPhone) apparaissent dès la première tranche.

### Négatives
- P0 reste dense (`09` § 2).
- Des features d'Instagram visibles (stories, DM, reels) n'arrivent qu'après P0.
- Le découpage strict interdit de paralléliser une feature P1 facile tant que P0 n'est pas stable.

## Liens
- ADR-003 (contrat OpenAPI, première étape de chaque tranche)
- ADR-009 (environnement de démo, validation de chaque tranche)
