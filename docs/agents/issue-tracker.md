# Issue tracker : GitHub

Les plans de phase et les tranches de ce dépôt sont des issues GitHub (`Kicksbld/clone_instagram`). Toutes les opérations passent par le CLI `gh`.

## Ce que représentent les issues

| Objet | Issue GitHub | Produit par |
|---|---|---|
| **Plan de phase** (la « spec ») | Une issue parente, titre `P1 — Fonctionnalités majeures`, label `phase` | `/to-spec` |
| **Tranche** (le « ticket ») | Une sous-issue du plan de phase, titre `T18 — Titre orienté utilisateur` (numérotation continue depuis P0), label `ready-for-agent` | `/to-tickets` |
| **Dépendance entre tranches** | Dépendance native GitHub (`blocked_by`) | `/to-tickets` |
| **Tranche terminée** | Issue fermée par la PR de la tranche (`Closes #<n>`), après la definition of done (ADR-014) | `/pr` |

`docs/plan/P0.md` reste l'archive de la phase P0, faite avant ce mode de suivi.

## Formats imposés

Les skills écrivent dans les formats du projet, pas dans leurs modèles par défaut :

- **Corps d'une issue de tranche** : la fiche de tranche de [`docs/ia-workflow.md`](../ia-workflow.md) § 2.3 (Objectif, ADR, Contrat, Base, Règles, Backend, iOS, Backoffice, À vérifier, Cas limites, Hors tranche, Démo), suivie de la definition of done d'ADR-014 en cases à cocher. Une fiche est autonome : jamais de renvoi au cahier des charges (ADR-001).
- **Corps du plan de phase** : le modèle de `/to-spec` (problème, solution, récits utilisateur, décisions, endroits testés, hors périmètre), complété par la liste des ADR de la phase, leur classement (fondation, feature, règle) et la matrice ADR × tranches (ia-workflow § 2.1 et § 2.2).
- Pas de chemin de fichier ni d'extrait de code dans les issues, sauf extrait issu d'un prototype qui fixe une décision.
- Langue : français, comme le reste de la documentation.

## Conventions

- **Créer une issue** : `gh issue create --title "..." --body "..."` (heredoc pour un corps sur plusieurs lignes).
- **Lire une issue** : `gh issue view <number> --json number,title,body,labels,comments`.
- **Lister** : `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`, avec `--label` et `--state`.
- **Sous-issue** : `gh issue create --parent <parent> ...`, ou `gh issue edit <parent> --add-sub-issue <child>` après coup.
- **Dépendance** : `gh api --method POST repos/Kicksbld/clone_instagram/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, où `<blocker-db-id>` est l'identifiant numérique de base (`gh api repos/Kicksbld/clone_instagram/issues/<n> --jq .id`), pas le `#numéro`. Une tranche est disponible quand toutes ses tranches bloquantes sont fermées.
- **Commenter** : `gh issue comment <number> --body "..."`.
- **Labels** : `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- **Fermer** : par la PR de la tranche (`Closes #<n>` dans sa description), sinon `gh issue close <number> --comment "..."`.

## Pull requests comme demandes

**PRs as a request surface: no.** Un seul développeur : les PR sont celles des tranches, pas des demandes externes.

## Quand un skill dit « publier dans l'issue tracker »

Créer une issue GitHub, dans les formats ci-dessus.

## Quand un skill dit « récupérer le ticket »

Le lire comme dans **Lire une issue**.

## Wayfinding (`/wayfinder`)

- **Carte** : une issue labellisée `wayfinder:map` ; ses tickets sont des sous-issues, labellisées `wayfinder:<type>` (`research`, `prototype`, `grilling`, `task`).
- **Blocage** : dépendances natives, comme pour les tranches.
- **Frontière** : sous-issues ouvertes de la carte, sans bloquant ouvert ni assigné.
- **Prise d'un ticket** : `gh issue edit <n> --add-assignee @me`, en premier.
- **Résolution** : commentaire de réponse, fermeture, puis lien ajouté aux « Decisions so far » de la carte.
