# Documentation du domaine

Comment les skills d'ingénierie lisent et écrivent la documentation du domaine de ce dépôt.

## Organisation : un seul contexte

Malgré le monorepo, le produit n'a qu'un langage métier : un seul `GLOSSARY.md` à la racine et un seul dossier `docs/adr/`.

```
/
├── GLOSSARY.md
└── docs/adr/
    ├── README.md                      ← index des ADR et de leur statut
    ├── Agent ADR Architecte.md        ← template et fonctionnement des ADR
    └── ADR-001-decoupage-phases-tranches-verticales.md …
```

## Avant d'explorer, lire

- **`GLOSSARY.md`** : le vocabulaire du domaine.
- **`docs/adr/`** : les ADR qui touchent la zone de travail (index dans `docs/adr/README.md`).

Si un fichier n'existe pas encore, continuer sans le signaler.

## ADR : le format du projet remplace celui des skills

Les skills `domain-modeling`, `grill-with-docs` et `improve-codebase-architecture` proposent des ADR courts, numérotés `0001-…`. **Ce dépôt ne les utilise pas.** Pour créer, compléter ou vérifier un ADR :

- Lire **en entier** [`docs/adr/Agent ADR Architecte.md`](../adr/Agent%20ADR%20Architecte.md) et respecter exactement son template (Statut, Contexte, Décision, Alternatives, Conséquences positives et négatives, Liens) et son fonctionnement.
- Nom : `docs/adr/ADR-XXX-titre-en-kebab-case.md`, numéro = plus haut numéro existant + 1, sur trois chiffres, jamais réutilisé.
- Statut toujours `Proposé` à la création ; seul le lead dev accepte ou remplace un ADR.
- Un ADR contient tout le détail technique dont les tranches ont besoin (tables, limites, flux, noms de ports et de jobs), sans renvoi au cahier des charges (ADR-001).
- Après création : ligne dans `docs/adr/README.md`, et nouvelle décision `Dxx` dans `docs/cahier-des-charges/09-decisions-risques.md` § 1.
- Un ADR existant encore `Proposé` est complété directement ; un ADR `Accepté` n'est modifié qu'avec l'accord du lead dev, sinon un nouvel ADR le remplace.
- Les trois critères de `domain-modeling` pour proposer un ADR (difficile à revenir en arrière, surprenant sans contexte, vrai compromis) restent la bonne question à se poser.

## Glossaire

- Format : celui de `domain-modeling` (`GLOSSARY-FORMAT.md`) : terme en gras, définition d'une ou deux phrases, `_Avoid_` traduit par `_À éviter_`.
- En français. Quand le code utilise un autre mot (anglais), l'indiquer après la définition : `Code : follow request`.
- Aucun détail d'implémentation : le glossaire n'est ni une spec ni un ADR.

## Utiliser le vocabulaire du glossaire

Dans une issue, un nom de test, une proposition de refactorisation : utiliser le terme du glossaire, jamais un synonyme qu'il écarte. Un concept absent du glossaire est soit un mot inventé (à reconsidérer), soit un manque (à noter pour `domain-modeling`).

## Signaler les contradictions avec un ADR

Conclure comme le demande `CLAUDE.md` : `Conforme aux ADR existants`, `Contradiction avec ADR-XXX` ou `Décision non documentée — ADR recommandé`.
