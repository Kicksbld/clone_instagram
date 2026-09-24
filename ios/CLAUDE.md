# ios — conventions

App SwiftUI, MVVM, organisation par feature : [ADR-010](../docs/adr/ADR-010-app-ios-swiftui-mvvm.md). Client généré : [ADR-003](../docs/adr/ADR-003-contrat-openapi-contract-first.md). Projet XcodeGen et module `APIClient` : [ADR-017](../docs/adr/ADR-017-projet-ios-xcodegen.md). Qualité : [ADR-014](../docs/adr/ADR-014-qualite-ci-definition-of-done.md).

## Projet

- `project.yml` (XcodeGen) est la source du projet ; `CloneInstagram.xcodeproj` est généré et **non versionné**, sauf `project.xcworkspace/xcshareddata/swiftpm/Package.resolved` (versions exactes de toutes les dépendances SPM), à committer quand une dépendance change. Toute modification de cibles, réglages, dépendances ou configurations passe par `project.yml`, puis `xcodegen generate`.
- Dossiers synchronisés : ajouter un fichier Swift dans `CloneInstagram/` ou `CloneInstagramTests/` ne demande aucune régénération.
- Préparation d'une machine : `ios/scripts/bootstrap.sh` (outils Homebrew, `.xcconfig` locaux, génération).
- Cibles :
  - `CloneInstagram` : l'app, isolation `@MainActor` par défaut (Swift 6 strict).
  - `APIClient` : uniquement le code généré par `swift-openapi-generator` à partir de `CloneInstagram/Core/API/OpenAPI/openapi.yaml`, sans isolation par défaut (le code généré ne compile pas sous `@MainActor`). Aucun fichier écrit à la main dans ce dossier.
  - `CloneInstagramTests` : Swift Testing.
- Configurations `Local` et `Demo` : schémas `CloneInstagram` (Local, par défaut) et `CloneInstagram-Demo`. Valeurs dans `CloneInstagram/Resources/Config/<Config>.xcconfig` (non versionnés, modèles `*.example.xcconfig`), exposées à l'app par `Info-<Config>.plist`. `NSAllowsLocalNetworking` n'existe que dans `Info-Local.plist`.
- Portrait uniquement (comme Instagram). L'avertissement Xcode « All interface orientations must be supported… » est assumé : `UIRequiresFullScreen` est obsolète depuis iOS 26.

## Où mettre quoi

| Fichier | Emplacement |
|---|---|
| Point d'entrée, assemblage des dépendances, routeur racine | `CloneInstagram/App/` |
| Configuration et fabrique du client API, middlewares | `CloneInstagram/Core/API/` |
| Modèles partagés de l'app (jamais les types générés) | `CloneInstagram/Core/Models/` |
| Couleurs, typographie, composants réutilisables | `CloneInstagram/DesignSystem/` |
| Vue, ViewModel, service et modèles propres à une feature | `CloneInstagram/Features/<Feature>/` |
| Assets, `.xcconfig`, Info.plist | `CloneInstagram/Resources/` |
| Tests (même arborescence que l'app), faux partagés | `CloneInstagramTests/`, `CloneInstagramTests/Support/` |

## Recettes

- **Nouvel endpoint** : il est d'abord dans `packages/contract/openapi.yaml` ; `pnpm contract:generate` met à jour la copie `Core/API/OpenAPI/openapi.yaml` (ne jamais la modifier à la main) ; le client est régénéré au build.
- **Feature de référence** : `Features/Health` — service protocolaire qui appelle le client généré et convertit le DTO en modèle de l'app, erreurs typées, ViewModel `@Observable` avec états `idle` / `loading` / `loaded` / `failed` et « Réessayer ».
- **Test d'un service** : vrai `Client` construit par `APIClientFactory` avec `StubTransport` (`CloneInstagramTests/Support`). **Test d'un ViewModel** : faux service injecté.
- **Variable de configuration** : l'ajouter aux deux modèles `*.example.xcconfig`, à `Info-Local.plist` et `Info-Demo.plist`, puis la lire dans `Core`.
- **Commandes** :

```bash
xcodegen generate                                   # depuis ios/
swiftlint lint && swiftformat --lint .              # aussi lancés à chaque build
xcodebuild test -project CloneInstagram.xcodeproj -scheme CloneInstagram \
  -destination 'platform=iOS Simulator,name=iPhone 17' -skipPackagePluginValidation
```

## En attente

- **Team ID Apple** : compte développeur payant en cours de validation. En attendant, `DEVELOPMENT_TEAM` du `Local.xcconfig` local contient l'équipe personnelle gratuite (installation sur iPhone valable 7 jours). Le Team ID payant est indispensable avant Sign in with Apple (T2) et l'achat intégré (T10).

## Interdits

- Modifier le `.xcodeproj` à la main ou le versionner (hors `Package.resolved`) ; modifier la copie de `openapi.yaml` ou le code généré.
- Une feature qui importe une autre feature (ce qui est partagé descend dans `Core` ou `DesignSystem`).
- Appel réseau ou logique métier dans une vue ; ViewModel qui connaît le client HTTP ; type généré exposé aux vues.
- `AsyncImage` (→ Nuke) ; Liquid Glass sur le contenu (photos, reels).
- Force unwrap, `try!`, `as!` ; `swiftlint:disable` sans commentaire justificatif.
- Secret ou URL de démo dans un fichier versionné (→ `.xcconfig` non versionné) ; `NSAllowsLocalNetworking` en `Demo`.
- Nouvelle dépendance sans décision validée (ADR).
