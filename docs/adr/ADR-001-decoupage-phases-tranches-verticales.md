# ADR-001 — Découpage en phases P0 → P3 et livraison par tranches verticales

## Statut
Proposé

## Contexte
Le projet (clone iOS d'Instagram, backend et backoffice) est réalisé par un seul développeur assisté par l'IA. Le périmètre souhaité est large.

Onboarding, paywall, analytics et A/B test sont imposés par le projet et doivent être livrés.

Il faut un ordre de réalisation clair, qui garantisse à tout moment une version fonctionnelle et démontrable, et qui limite la dérive de l'IA sur de grosses modifications.

L'IA qui code une tranche se perd si elle dispose de plusieurs sources de contexte qui se recouvrent (cahier des charges, ADR, plan) : elle peut suivre une version différente de la règle selon le fichier lu.

Décisions sources : D20, D22, D23, D33 (cahier des charges, `09-decisions-risques.md`).

## Décision
- Le périmètre est découpé en **quatre niveaux de priorité**, détaillés dans le cahier des charges (`01-contexte-perimetre.md` § 4) :
  - **P0 — Socle** : fondations (monorepo, contrat, squelettes, CI, environnements, pipeline images), compte et profil avec onboarding, social (abonnement, recherche, blocage, signalement), posts photo et carrousel, feed, likes, commentaires, paywall Clone Plus, analytics, A/B test, backoffice de modération, utilisateurs et analytics.
  - **P1 — Fonctionnalités majeures** : demandes d'abonnement, amis proches, stories, messages privés, reels, enregistrements, mentions, activité, likes de commentaires, audit.
  - **P2 — Fonctionnalités secondaires** : stories à la une, notes, republication, collaboration, identifications, demandes de message, collections, explorer, push.
  - **P3 — Bonus** : instants.
- **P0 est l'objectif.** P1 à P3 viennent ensuite, dans l'ordre.
- Une phase n'est commencée que lorsque la précédente est **fonctionnelle et testée**.
- **Rôle des documents** :
  - le **cahier des charges** (`docs/cahier-des-charges/`) décrit le périmètre et le contexte. Il sert uniquement à rédiger les ADR et le plan d'une phase, avant son démarrage ;
  - les **ADR** (`docs/adr/`) fixent les décisions et les règles techniques ;
  - le **plan de phase** (`docs/plan/P0.md`, `P1.md`…) découpe la phase en tranches ; chaque fiche de tranche porte les règles métier dont la tranche a besoin.
- **Pendant le développement d'une tranche, les seules sources de contexte sont la fiche de la tranche et les ADR qu'elle cite.** Le cahier des charges n'est pas lu. Une information absente de la fiche et des ADR est un manque à signaler au lead dev (on complète alors la fiche ou l'ADR), jamais à inventer ni à chercher ailleurs. En cas de divergence entre le cahier et un ADR, l'ADR fait foi.
- Chaque feature est livrée en **tranche verticale**, dans cet ordre : contrat → migration → backend (domaine → use case → adapters → route + tests) → iOS (service → ViewModel → vues + tests) → backoffice si concerné.
- Une tranche = une branche / un commit, et n'est terminée que lorsqu'elle respecte la definition of done (ADR-014), y compris le test sur iPhone physique sur l'environnement de démo.
- Chaque phase se termine par une stabilisation (finitions, tests, corrections), sans nouvelle feature.

## Alternatives
- Planning hebdomadaire : donne des jalons datés, mais n'ordonne pas le travail par importance. Écarté à la demande du lead dev (D20).
- Recadrage complet du périmètre : réduit la liste, mais perd la vision des features secondaires. Écarté (D22).
- Traiter onboarding, paywall, analytics et A/B test en P1 ou plus tard : allège P0, mais ces éléments sont imposés. Écarté (D23).
- Développement couche par couche (tout le backend, puis toute l'app) : rien de démontrable avant la fin, intégration tardive. Non retenu.
- Cahier des charges lu pendant le développement : document complet, mais volumineux, mêlant toutes les phases et recouvrant les ADR. Écarté par le lead dev (D33).

## Conséquences
### Positives
- Une version démontrable existe à la fin de chaque tranche.
- Ordre de travail explicite pour le développeur et pour l'IA.
- Les problèmes d'intégration (contrat, déploiement, iPhone) apparaissent dès la première tranche.
- Contexte de l'IA court et sans contradiction : une fiche et quelques ADR.

### Négatives
- P0 reste dense.
- Des features d'Instagram visibles (stories, DM, reels) n'arrivent qu'après P0.
- Le découpage strict interdit de paralléliser une feature P1 facile tant que P0 n'est pas stable.
- Les ADR et les fiches doivent être complets : à chaque nouvelle phase, il faut reporter dans les ADR et les fiches tout ce que le cahier contient d'utile à ses tranches.

## Liens
- ADR-003 (contrat OpenAPI, première étape de chaque tranche)
- ADR-009 (environnement de démo, validation de chaque tranche)
- ADR-014 (definition of done)
