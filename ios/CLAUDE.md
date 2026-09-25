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

## Écrans en wireframe

Jusqu'à une tranche de style à planifier (décisions de planification de [`P0.md`](../docs/plan/P0.md)) : composants système, alignements et espacements uniquement ; aucune couleur, typographie, image ou composant personnalisé. Le parcours, les libellés et la navigation reproduisent Instagram.

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
- **Service de référence** : `Core/Identity/IdentityService.swift` — protocole, implémentation sur le client généré, conversion des DTO en modèles de l'app, erreurs typées selon le `code` des Problem Details.
- **Feature de référence** : `Features/Onboarding` — un ViewModel `@Observable` pour tout le parcours, une vue par étape, navigation par `NavigationStack(path:)`, erreurs affichées avec possibilité de réessayer.
- **Envoyer une image** (ADR-008) : `UploadService` (`Core/Media/UploadManager`) renvoie l'identifiant d'un média `ready`, que la feature rattache ensuite (ex. `PATCH /v1/me`). La vue charge les données du `PhotosPicker` et les passe au ViewModel ; `ImagePreparer` retire les métadonnées. Affichage : `AvatarView` (`DesignSystem`, `LazyImage` de NukeUI) avec la variante adaptée à la taille.
- **Session et jeton** : `Core/Auth` (`AuthService`, SDK `Auth` de `supabase-swift`) ; `AuthenticationMiddleware` ajoute le Bearer à chaque appel ; le routeur racine est `App/RootViewModel`.
- **Test d'un service** : vrai `Client` construit par `APIClientFactory` avec `StubTransport` (`CloneInstagramTests/Support`). **Test d'un ViewModel** : faux services injectés (`FakeAuthService`, `FakeIdentityService`).
- **Variable de configuration** : l'ajouter aux deux modèles `*.example.xcconfig`, à `Info-Local.plist` et `Info-Demo.plist`, puis la lire dans `Core`.
- **Entitlements** : déclarés dans `project.yml` (`entitlements.properties`) ; le fichier `.entitlements` est généré par `xcodegen generate`.
- **Commandes** :

```bash
xcodegen generate                                   # depuis ios/
swiftlint lint && swiftformat --lint .              # aussi lancés à chaque build
xcodebuild test -project CloneInstagram.xcodeproj -scheme CloneInstagram \
  -destination 'platform=iOS Simulator,name=iPhone 17' -skipPackagePluginValidation
```

## Interdits

- Modifier le `.xcodeproj` à la main ou le versionner (hors `Package.resolved`) ; modifier la copie de `openapi.yaml` ou le code généré.
- Une feature qui importe une autre feature (ce qui est partagé descend dans `Core` ou `DesignSystem`).
- Appel réseau ou logique métier dans une vue ; ViewModel qui connaît le client HTTP ; type généré exposé aux vues.
- `AsyncImage` (→ Nuke) ; Liquid Glass sur le contenu (photos, reels).
- Force unwrap, `try!`, `as!` ; `swiftlint:disable` sans commentaire justificatif.
- Secret ou URL de démo dans un fichier versionné (→ `.xcconfig` non versionné) ; `NSAllowsLocalNetworking` en `Demo`.
- Nouvelle dépendance sans décision validée (ADR).
