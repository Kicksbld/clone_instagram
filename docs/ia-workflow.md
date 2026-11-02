# IA workflow — Méthode de développement avec l'IA

Comment passer du cahier des charges au code, avec Claude Code, sans perdre le contrôle. Ce document est la méthode ; les plans de phase et les tranches sont des issues GitHub ([`docs/agents/issue-tracker.md`](agents/issue-tracker.md)). Règle de fond : [ADR-001](adr/ADR-001-decoupage-phases-tranches-verticales.md).

La méthode s'appuie sur les skills de Matt Pocock (`/grill-with-docs`, `/to-spec`, `/to-tickets`, `/implement`, `/tdd`, `/code-review`, `/pr`, `/retro`…), configurés pour ce dépôt dans [`docs/agents/`](agents/). Leur fonctionnement est décrit dans chaque skill ; ce document dit **quand** les appeler et ce qui est propre au projet.

## 1. Les documents

| Document | Répond à | Lu quand | Où |
|---|---|---|---|
| **Cahier des charges** | Quoi construire (périmètre, contexte) | **Uniquement** pour préparer une phase | `docs/cahier-des-charges/` |
| **ADR** | Pourquoi et quelle règle | Pendant le développement (ceux cités par la fiche) | `docs/adr/` |
| **Glossaire** | Comment on nomme les choses | Toujours, pour le vocabulaire | `GLOSSARY.md` |
| **Plan de phase** | Quoi faire, dans quel ordre | Préparation et suivi de la phase | Issue GitHub parente, label `phase` |
| **Fiche de tranche** | Quoi faire dans cette tranche, avec quelles règles métier | Pendant la tranche | Sous-issue du plan de phase |
| **Recherches** | Faits vérifiés dans les sources officielles | Préparation d'une phase, cités par les fiches | `docs/research/` |

Un ADR n'est pas une tâche : il fixe une règle. Les tâches viennent des features, rangées en tranches.

**Source unique de règles pendant le développement : la fiche de la tranche + les ADR qu'elle cite.** Le cahier des charges n'est jamais lu pendant une tranche ; le glossaire ne fournit que le vocabulaire. À la préparation d'une phase, tout ce que le cahier contient d'utile aux tranches est reporté dans les ADR (règles techniques) ou dans les fiches (règles métier, tables, endpoints). En cas de divergence, l'ADR fait foi.

**Rôles** : le lead dev donne l'intention et tranche les décisions ; l'IA cherche les faits, propose, formalise et exécute par petites tranches vérifiées.

## 2. Préparer une phase

À refaire au début de chaque phase. C'est le seul moment où le cahier des charges est lu. **Les étapes 2.1 à 2.4 se font dans une seule session**, sans vider le contexte avant la fin de `/to-tickets`, pour que l'interrogatoire, le plan et les tranches partagent le même raisonnement. Si la session approche de ses limites, `/compact` entre deux étapes.

### 2.1 Interroger : `/grill-with-docs`

Point de départ : le cahier des charges de la phase (`01` § 4, `09` § 1 et les sections concernées) et les ADR existants.

- L'IA interroge le lead dev par rondes, une recommandation par question ; le lead dev tranche, l'IA ne répond jamais à sa place.
- Les décisions importantes et durables deviennent des ADR **au format du projet** ([`adr/Agent ADR Architecte.md`](adr/Agent%20ADR%20Architecte.md), voir [`agents/domain.md`](agents/domain.md)). Un ADR reprend **tout** le détail technique dont les tranches auront besoin, sans renvoi au cahier. Les ADR existants que la phase fait évoluer sont complétés, ou remplacés.
- Les termes du domaine sont fixés au fil de l'eau dans `GLOSSARY.md`.
- **Faits à vérifier** (API externes, limites d'Instagram, comportement d'un hébergeur) : `/research` en tâche de fond, résultat dans `docs/research/`. L'interrogatoire continue sur les autres questions pendant ce temps.
- **Question qui ne se tranche pas sur papier** (une machine à états, une interface à voir) : `/handoff`, puis `/prototype` dans une autre session, puis `/handoff` du résultat. Le prototype est gardé sur une branche `prototype/<nom>`, jamais fusionnée.

### 2.2 Classer les ADR

| Type d'ADR | Ce qu'il produit | Exemple |
|---|---|---|
| **Fondation** | Du travail fait une seule fois, qui devient les premières tranches | ADR-002 monorepo → T0 |
| **Feature** | Sa propre tranche | ADR-012 Clone Plus → T10 |
| **Règle** | Pas de tranche : une checklist dans chaque tranche concernée | ADR-006 visibilité → toutes les lectures |

Un ADR peut avoir deux rôles (ADR-005 : squelette de l'API une fois, puis règle pour chaque use case).

### 2.3 Écrire le plan de phase : `/to-spec`

Synthèse de l'interrogatoire, sans nouvelle question, publiée comme issue parente `P<n> — Titre` (label `phase`). Contenu : le modèle de `/to-spec` (problème, solution, récits utilisateur, décisions, endroits testés, hors périmètre), plus la liste des ADR de la phase, leur classement (§ 2.2) et la matrice ADR × tranches.

Les **endroits testés** (les interfaces publiques où les tests observent le comportement : routes via `fastify.inject`, use cases avec adapters en mémoire, ViewModels iOS avec faux services) sont validés avec le lead dev à cette étape : `/tdd` n'écrira de tests qu'à ces endroits.

### 2.4 Découper en tranches : `/to-tickets`

1. **Une tranche = une action utilisateur démontrable de bout en bout sur l'iPhone** (« je publie une photo », pas « le backend des posts »). Test : peut-on la montrer sur la démo ?
2. **Une seule intention par tranche.** Si elle en mélange plusieurs, on la découpe :
   - par action (créer / lire / supprimer) ;
   - version simple d'abord (post à une photo, puis carrousel) ;
   - par dépendance (pipeline image avant les posts).

   Si elle n'apporte rien de démontrable seule (un simple champ), on la fusionne avec sa voisine.
3. **Dépendances** : chaque tranche déclare les tranches qui la bloquent (dépendances natives GitHub). On traite d'abord les dépendances, puis la priorité, puis les risques le plus tôt possible (déploiement, configurations SaaS longues).
4. **Croiser ADR × tranches** : pour chaque ADR « règle », les tranches où il s'applique ; pour chaque ADR « fondation », la tranche qui le pose. Ce croisement fait apparaître les dépendances cachées.
5. **Fiche autonome** : règles métier (limites, formats, comportements), colonnes des tables et forme des endpoints reportées dans la fiche ; tout le reste dans un ADR cité. Aucune fiche ne renvoie au cahier des charges.
6. **Remonter au lead dev** les points que le cahier ne tranche pas, au lieu de les inventer. Les points à vérifier sont rangés dans la fiche qui en a besoin.
7. L'IA présente le découpage (titre, bloquée par, ce qu'elle livre) ; le lead dev valide la granularité et les dépendances avant la publication.

### 2.5 Fiche de tranche

Chaque tranche est une sous-issue du plan de phase, titre `T<n> — Titre orienté utilisateur` (numérotation continue d'une phase à l'autre), label `ready-for-agent`. Son corps :

```markdown
- **Objectif** : ce que l'utilisateur peut faire à la fin.
- **ADR** : ADR à lire (seule source de règles avec la fiche).
- **Contrat** : endpoints à ajouter, avec leur rôle et leurs champs principaux.
- **Base** : tables, colonnes et index.
- **Règles** : règles métier propres à la tranche (formats, limites, comportements).
- **Backend** : module et use cases.
- **iOS** : écrans, services, ViewModels.
- **Backoffice** : si concerné.
- **À vérifier** : points à confirmer avant de coder (versions, API externes), si besoin.
- **Cas limites** : ceux d'ADR-014 qui s'appliquent, plus ceux de la tranche.
- **Hors tranche** : ce que l'IA ne doit PAS faire (et où ce sera fait).
- **Démo** : ce qu'on montre sur l'iPhone pour valider.

## Definition of done
- [ ] cases à cocher d'ADR-014
```

La ligne **Hors tranche** est la plus importante : elle empêche l'IA de déborder.

## 3. Réaliser une tranche

Une tranche = **une nouvelle session Claude Code, une branche, une PR.** On prend une tranche disponible : issue ouverte, sans tranche bloquante ouverte, dans l'ordre du plan. Les tranches se font une par une, jamais en parallèle (`/implement-spec` n'est pas utilisé) : chacune touche `openapi.yaml`, les migrations et le client Swift généré, et le lead dev la valide sur iPhone.

| # | Étape | Prompt type | Ce que le lead dev vérifie |
|---|---|---|---|
| 1 | **Démarrer** | « `/implement` #42. Crée la branche `feat/<module>-<action>`. Lis la fiche et les ADR qu'elle cite, pas le cahier des charges. » | La bonne fiche et ses ADR sont lus |
| 2 | **Planifier** (plan mode) | « Propose le plan d'implémentation et vérifie la conformité aux ADR. » | Rien de hors tranche ; ordre contrat → base → backend → iOS ; endroits testés du plan de phase ; conclusion ADR présente |
| 3 | **Contrat** | « Étape 1 : le contrat seulement. Valide et régénère. » | Le diff de `openapi.yaml` (court, crucial) |
| 4 | **Base + backend** | « Étape 2 : migration puis backend, en `/tdd` : un cas limite de la fiche, un test rouge, le code qui le fait passer, puis le suivant. » | Tests verts ; visibilité appelée ; `UnitOfWork` si plusieurs tables |
| 5 | **iOS** (puis backoffice) | « Étape 3 : service, ViewModel, vues, en `/tdd` sur les ViewModels. » | L'écran fonctionne dans le simulateur |
| 6 | **Relire** | « `/code-review` depuis `main`. » (règles du projet + conformité à la fiche) | Écarts à la fiche et aux règles corrigés |
| 7 | **Definition of done** | « Vérifie la definition of done d'ADR-014 ; lance lint, typecheck, test, build. » | Démo déployée, **test sur iPhone** |
| 8 | **Clôturer** | « Commit en `feat(<module>): …`, puis PR (`/pr`) qui ferme l'issue. Une décision a-t-elle été prise en route ? » | Si oui : nouvel ADR (et ligne dans `09` du cahier) |
| 9 | **Rétrospective** | « `/retro` sur cette session. » | Les améliorations proposées à l'environnement (contrôle automatique, règle de revue, `CLAUDE.md`) |

Autres skills pendant une tranche :

- **Bug difficile** : `/diagnosing-bugs` (boucle de reproduction d'abord, correction avec test de non-régression), puis `/retro`.
- **Étape que seul le lead dev peut faire** (clé APNs, variables Railway, configuration Supabase Cloud, App Store Connect) : `/wizard`.
- **Message de l'IA incompréhensible** : `/wait-what`.

## 4. Règles pendant une session

- **Valider entre chaque étape.** Jamais « fais toute la tranche » d'un coup.
- **Hors tranche = stop.** « Ce n'est pas dans la fiche, on reste dans la fiche. »
- **Information manquante = stop.** Si la fiche et ses ADR ne disent pas comment faire, l'IA le signale au lieu d'aller lire le cahier des charges ou d'inventer. On complète la fiche ou l'ADR, puis on reprend.
- **Décision non prévue** : l'IA répond `Décision non documentée — ADR recommandé`. Le lead dev tranche, puis on rédige l'ADR (statut `Proposé`) selon `docs/adr/Agent ADR Architecte.md`.
- **Contradiction avec un ADR** : l'IA le signale (`Contradiction avec ADR-XXX`). On corrige le code, ou on propose un nouvel ADR qui remplace l'ancien.
- **Tranche qui grossit en cours de route** : on la redécoupe en nouvelles sous-issues au lieu de forcer.
- **Nouvelle session à chaque tranche** : le contexte reste propre et les règles viennent des fichiers et de l'issue, pas de la mémoire de la conversation.

## 5. Fin de phase

1. Toutes les tranches fermées, démo validée sur iPhone ; le plan de phase est fermé.
2. Relecture des ADR ajoutés pendant la phase ; report des nouvelles décisions dans `09` du cahier des charges.
3. `/retro` sur la phase, puis `/improve-codebase-architecture` : une piste retenue devient une idée à reprendre en § 2.1.
4. Préparation de la phase suivante (§ 2).
