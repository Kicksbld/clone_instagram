# IA workflow — Méthode de développement avec l'IA

Comment passer du cahier des charges au code, avec Claude Code, sans perdre le contrôle. Ce document est la méthode ; le plan courant est dans [`docs/plan/`](plan/). Règle de fond : [ADR-001](adr/ADR-001-decoupage-phases-tranches-verticales.md).

## 1. Les trois niveaux de documents

| Document | Répond à | Lu quand | Où |
|---|---|---|---|
| **Cahier des charges** | Quoi construire (périmètre, contexte) | **Uniquement** pour préparer une phase : rédiger ses ADR et son plan | `docs/cahier-des-charges/` |
| **ADR** | Pourquoi et quelle règle | Pendant le développement (ceux cités par la fiche) | `docs/adr/` |
| **Plan de phase** | Quoi faire, dans quel ordre, avec quelles règles métier | Pendant le développement (la fiche de la tranche) | `docs/plan/P0.md`, `P1.md`… |

Un ADR n'est pas une tâche : il fixe une règle. Les tâches viennent des features, rangées en tranches dans le plan.

**Source unique de contexte pendant le développement : la fiche de la tranche + les ADR qu'elle cite.** Le cahier des charges n'est jamais lu pendant une tranche. C'est ce qui évite que l'IA suive deux versions d'une même règle. Conséquence : à la préparation d'une phase, tout ce que le cahier contient d'utile aux tranches doit être reporté dans les ADR (règles techniques) ou dans les fiches (règles métier, tables, endpoints). En cas de divergence, l'ADR fait foi.

**Rôles** : le lead dev donne l'intention et valide ; les ADR et les `CLAUDE.md` fixent les règles ; l'IA exécute par petites tranches vérifiées.

## 2. Préparer une phase : ADR puis tranches

À refaire au début de chaque phase (P0, puis P1…). C'est le seul moment où le cahier des charges est lu.

### 2.0 Rédiger les ADR de la phase

À partir du cahier des charges (`09` § 1 pour les décisions `Dx`, et les sections concernées), selon [`adr/Agent ADR Architecte.md`](adr/Agent%20ADR%20Architecte.md). Un ADR reprend **tout** le détail technique dont les tranches auront besoin (tables de conventions, limites, flux, noms de ports et de jobs), pas un simple renvoi au cahier. Les ADR existants que la phase fait évoluer sont complétés, ou remplacés par un nouvel ADR.

### 2.1 Classer les ADR

| Type d'ADR | Ce qu'il produit | Exemple |
|---|---|---|
| **Fondation** | Du travail fait une seule fois, qui devient les premières tranches | ADR-002 monorepo → T0 |
| **Feature** | Sa propre tranche | ADR-012 Clone Plus → T10 |
| **Règle** | Pas de tranche : une checklist dans chaque tranche concernée | ADR-006 visibilité → toutes les lectures |

Un ADR peut avoir deux rôles (ADR-005 : squelette de l'API une fois, puis règle pour chaque use case).

### 2.2 Construire les tranches

1. **Lister les features** de la phase (cahier des charges, `01` § 4).
2. **Une tranche = une action utilisateur démontrable de bout en bout sur l'iPhone** (« je publie une photo », pas « le backend des posts »). Test : peut-on la montrer sur la démo ?
3. **Une seule intention par tranche.** Si elle en mélange plusieurs, on la découpe :
   - par action (créer / lire / supprimer) ;
   - version simple d'abord (post à une photo, puis carrousel) ;
   - par dépendance (pipeline image avant les posts).

   Si elle n'apporte rien de démontrable seule (un simple champ), on la fusionne avec sa voisine.
4. **Ordonner** : dépendances d'abord, puis priorité, puis les risques le plus tôt possible (déploiement, configurations SaaS longues).
5. **Croiser ADR × tranches** : pour chaque ADR « règle », noter les tranches où il s'applique, et pour chaque ADR « fondation », la tranche qui le pose. Ce croisement fait apparaître les dépendances cachées (exemple : la politique de visibilité doit exister dès la première tranche qui lit un profil).
6. **Rendre chaque fiche autonome** : reporter dans la fiche les règles métier (limites, formats, comportements), les colonnes des tables et la forme des endpoints tirés du cahier ; tout le reste doit être dans un ADR cité. Aucune fiche ne renvoie au cahier des charges.
7. **Remonter au lead dev** les points que le cahier des charges ne tranche pas, au lieu de les inventer. Les points à vérifier au démarrage sont rangés dans la fiche de la tranche qui en a besoin.

### 2.3 Fiche de tranche

Chaque tranche du plan a sa fiche. C'est ce qu'on donne à l'IA en début de session.

```markdown
### T4a — Titre orienté utilisateur
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
```

La ligne **Hors tranche** est la plus importante : elle empêche l'IA de déborder.

Prompt pour générer un plan de phase :

> « Prépare la phase P1 selon `docs/ia-workflow.md` § 2 : propose d'abord les ADR de P1 à partir du cahier des charges (`docs/adr/README.md`, liste « À rédiger »), puis, une fois validés, génère `docs/plan/P1.md` (classement des ADR, action utilisateur, une intention par tranche, ordre par dépendances, fiches autonomes sans renvoi au cahier, matrice ADR × tranches, points à trancher). Ne code rien. »

## 3. Réaliser une tranche : la routine en 7 étapes

Une tranche = **une session Claude Code, une branche, un commit.** On prend toujours la première tranche non cochée du plan.

| # | Étape | Prompt type | Ce que le lead dev vérifie |
|---|---|---|---|
| 1 | **Démarrer** | « On attaque T8. Crée la branche `feat/engagement-like`. Lis la fiche T8 de `docs/plan/P0.md` et les ADR qu'elle cite, pas le cahier des charges. » | La bonne fiche et ses ADR sont lus |
| 2 | **Planifier** (plan mode, Shift+Tab) | « Propose le plan d'implémentation et vérifie la conformité aux ADR. » | Rien de hors tranche ; ordre contrat → base → backend → iOS ; conclusion ADR présente |
| 3 | **Contrat** | « Étape 1 : le contrat seulement. Valide et régénère. » | Le diff de `openapi.yaml` (court, crucial) |
| 4 | **Base + backend** | « Étape 2 : migration puis backend, avec les tests des cas limites de la fiche. » | Tests verts ; visibilité appelée ; `UnitOfWork` si plusieurs tables |
| 5 | **iOS** (puis backoffice) | « Étape 3 : service, ViewModel, vues et tests. » | L'écran fonctionne dans le simulateur |
| 6 | **Definition of done** | « Vérifie la definition of done d'ADR-014 ; lance lint, typecheck, test, build. » | Merge dans `main`, déploiement de la démo, **test sur iPhone** |
| 7 | **Clôturer** | « Commit en `feat(engagement): …`. Coche la tranche dans le plan. Une décision a-t-elle été prise en route ? » | Si oui : nouvel ADR (et ligne dans `09` du cahier) |

## 4. Règles pendant une session

- **Valider entre chaque étape.** Jamais « fais toute la tranche » d'un coup.
- **Hors tranche = stop.** « Ce n'est pas dans T8, on reste dans la fiche. »
- **Information manquante = stop.** Si la fiche et ses ADR ne disent pas comment faire, l'IA le signale au lieu d'aller lire le cahier des charges ou d'inventer. On complète la fiche ou l'ADR, puis on reprend.
- **Décision non prévue** : l'IA doit répondre `Décision non documentée — ADR recommandé`. Le lead dev tranche, puis on rédige l'ADR (statut `Proposé`) selon `docs/adr/Agent ADR Architecte.md`.
- **Contradiction avec un ADR** : l'IA le signale (`Contradiction avec ADR-XXX`). On corrige le code, ou on propose un nouvel ADR qui remplace l'ancien.
- **Tranche qui grossit en cours de route** (nouvelle action, bien plus de fichiers que prévu) : on la redécoupe dans le plan au lieu de forcer.
- **Nouvelle session à chaque tranche** : le contexte reste propre et les règles viennent des fichiers, pas de la mémoire de la conversation.

## 5. Fin de phase

1. Toutes les tranches cochées, démo validée sur iPhone.
2. Relecture des ADR ajoutés pendant la phase ; report des nouvelles décisions dans `09` du cahier des charges, pour qu'il reste à jour pour les phases suivantes.
3. Préparation de la phase suivante (§ 2) : ses ADR (liste « À rédiger » de `docs/adr/README.md`), puis son plan.
