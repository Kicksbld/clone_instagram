# ios — conventions

App SwiftUI, MVVM, organisation par feature : [ADR-010](../docs/adr/ADR-010-app-ios-swiftui-mvvm.md). Client généré : [ADR-003](../docs/adr/ADR-003-contrat-openapi-contract-first.md). Projet XcodeGen et module `APIClient` : [ADR-017](../docs/adr/ADR-017-projet-ios-xcodegen.md). Qualité : [ADR-014](../docs/adr/ADR-014-qualite-ci-definition-of-done.md).

## Projet

- `project.yml` (XcodeGen) est la source du projet ; `CloneInstagram.xcodeproj` est généré et **non versionné**, sauf `project.xcworkspace/xcshareddata/swiftpm/Package.resolved` (versions exactes de toutes les dépendances SPM), à committer quand une dépendance change. Toute modification de cibles, réglages, dépendances ou configurations passe par `project.yml`, puis `xcodegen generate`.
- Dossiers synchronisés : ajouter un fichier Swift dans `CloneInstagram/` ou `CloneInstagramTests/` ne demande aucune régénération.
- Préparation d'une machine : `ios/scripts/bootstrap.sh` (outils Homebrew, puis `sync.sh`). Après chaque `git pull` ou changement de branche : `ios/scripts/sync.sh`, projet fermé dans Xcode (avertit si la branche est en retard sur `main`, ajoute aux `.xcconfig` les clés apparues dans les modèles, liste les valeurs vides, lance `xcodegen generate`). Si Xcode propose de recharger un projet modifié sur le disque : « Close », jamais « Resave ».
- `swift-collections` (dépendance indirecte de `swift-openapi-urlsession`) est épinglé en 1.6.0 dans `project.yml` : la 1.7 exige le runtime Swift 6.4 (iOS 27) et l'app plante au lancement sur iOS 26. Ne pas le monter sans tester sur un simulateur iOS 26.
- Client généré tolérant (ADR-019) : un champ de réponse inconnu est ignoré ; une nouvelle valeur d'énumération dans une réponse reste cassante.
- Cibles :
  - `CloneInstagram` : l'app, isolation `@MainActor` par défaut (Swift 6 strict).
  - `APIClient` : uniquement le code généré par `swift-openapi-generator` à partir de `CloneInstagram/Core/API/OpenAPI/openapi.yaml`, sans isolation par défaut (le code généré ne compile pas sous `@MainActor`). Aucun fichier écrit à la main dans ce dossier.
  - `CloneInstagramTests` : Swift Testing.
- Configurations `Local` et `Demo` : schémas `CloneInstagram` (Local, par défaut) et `CloneInstagram-Demo`. Valeurs dans `CloneInstagram/Resources/Config/<Config>.xcconfig` (non versionnés, modèles `*.example.xcconfig`), exposées à l'app par `Info-<Config>.plist`. `NSAllowsLocalNetworking` n'existe que dans `Info-Local.plist`.
- Portrait uniquement (comme Instagram). L'avertissement Xcode « All interface orientations must be supported… » est assumé : `UIRequiresFullScreen` est obsolète depuis iOS 26.

## Écrans en wireframe

Jusqu'à une tranche de style à planifier (décisions de planification de [`P0.md`](../docs/plan/P0.md)) : composants système, alignements et espacements uniquement ; aucune couleur, typographie, image ou composant personnalisé. Le parcours, les libellés et la navigation reproduisent Instagram.

Exceptions validées par le lead dev (maquettes dans `ios/design/animations/`) : le logo (`DesignSystem/LogoShapes`, `AppLogo`), le splash animé « Iris » (`App/SplashView`, affiché par `RootView` au-dessus du routeur jusqu'à la fin de l'animation et du chargement) et l'animation « Éclats » du like (`DesignSystem/LikeBurst` : `LikeButton`, `DoubleTapHeart`). Couleurs de la marque : `DesignSystem/BrandColors`.

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
- **Envoyer une image** (ADR-008) : `UploadService` (`Core/Media/UploadManager`) renvoie l'identifiant d'un média `ready`, que la feature rattache ensuite (ex. `PATCH /v1/me`). Un post passe par la file persistée `PublishQueue` (`Core/Posts`), qui reprend chaque étape après une fermeture de l'app. La vue charge les données du `PhotosPicker` et les passe au ViewModel ; `ImagePreparer` retire les métadonnées. Affichage : `AvatarView` (`DesignSystem`, `LazyImage` de NukeUI) avec la variante adaptée à la taille.
- **Feuille ouverte depuis `DesignSystem`** : `PostView` ne connaît aucune feature ; il appelle une action d'environnement (`openComments`, `Core/Navigation/CommentsRoute`) que `App/RootView` fournit et traduit en `.sheet` de la feature `Comments`. Dans les tests, `Comment` est ambigu avec `Testing.Comment` : écrire `CloneInstagram.Comment`.
- **Signaler et bloquer depuis `DesignSystem` ou une feature** : actions d'environnement `moderation` (`report`, `block`) et `blockedUserIds` (`Core/Navigation/ModerationRoute`), fournies par `App/ModerationPresenter`, appliqué à l'accueil **et** à la feuille des commentaires (une feuille ne se présente pas depuis la racine quand une autre l'est déjà). Le blocage passe par `BlockStore` (`Core/Social`) : les écrans déjà chargés retirent le compte (`blockedUserIds`), le feed se recharge (`revision`), un profil ou un post ouvert se ferme.
- **Clone Plus** (ADR-012) : `Core/Billing` — `PurchaseService` (seul fichier qui importe `RevenueCat`), `SubscriptionService` (`POST /v1/me/subscription/refresh`), `AppIconService`. Seul le `plan` de l'API (`Profile.planStatus`, mis à jour par `RootViewModel.updatePlan`) débloque un avantage ; le statut du SDK ne sert qu'à l'affichage. Le paywall est fourni par `App` aux Paramètres (builder), jamais importé par une autre feature. Sources SVG des icônes : `ios/design/app-icons/` (rendu PNG 1024 px, par ex. `rsvg-convert -w 1024 -h 1024`). Nouvelle icône alternative : `AppIcon-<Nom>.appiconset` (1024 px sans transparence), cas de l'enum `AppIcon`, puis `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES` dans `project.yml`.
- **Analytics** (ADR-013) : `Core/Analytics` — `AnalyticsService` (seul `PostHogAnalyticsService` importe `PostHog`), événements et propriétés centralisés dans `AnalyticsEvent` (jamais de texte libre ni de donnée personnelle), injecté par initialiseur avec `NoopAnalyticsService()` par défaut ; en test, `FakeAnalyticsService`. Variante du paywall : `paywallVariant()` (flag `paywall-presentation`, `control` par défaut).
- **Session et jeton** : `Core/Auth` (`AuthService`, SDK `Auth` de `supabase-swift`) ; `AuthenticationMiddleware` ajoute le Bearer à chaque appel ; le routeur racine est `App/RootViewModel`.
- **Test d'un service** : vrai `Client` construit par `APIClientFactory` avec `StubTransport` (`CloneInstagramTests/Support`). **Test d'un ViewModel** : faux services injectés (`FakeAuthService`, `FakeIdentityService`).
- **Variable de configuration** : l'ajouter aux deux modèles `*.example.xcconfig`, à `Info-Local.plist` et `Info-Demo.plist`, puis la lire dans `Core` ; `sync.sh` l'ajoute aux `.xcconfig` locaux existants.
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
