# ADR-010 — App iOS : SwiftUI natif, MVVM `@Observable`, cible iOS 26, une cible organisée par feature

## Statut
Proposé

## Contexte
L'app doit reproduire au plus près l'app iOS d'Instagram, « réinterprétée iOS 27 » avec les composants système Liquid Glass. La plateforme est iOS uniquement.

Un seul développeur écrit l'app avec l'IA : l'architecture doit être légère, bien connue de l'IA et testable.

L'iPhone de test et Xcode sont en iOS 27. Liquid Glass existe depuis iOS 26.

Décisions sources : D1, D2, D3, D4, D30.

## Décision
- **SwiftUI natif**, Swift 6 en mode de concurrence strict (isolation `@MainActor` par défaut si le réglage des nouveaux projets Xcode le propose, à vérifier).
- **Cible de déploiement : iOS 26**, compilée avec le SDK iOS 27 de Xcode. Toute API propre à iOS 27 est protégée par `if #available(iOS 27, *)`.
- **UI** : structure et interactions d'Instagram avec les composants système Liquid Glass (tab bar, toolbars, sheets). Le verre est réservé à la navigation et aux contrôles (`.glassEffect()` seulement pour les contrôles personnalisés), **jamais au contenu** (photos, reels). Scroll du feed profilé avec Instruments dès qu'il existe.
- **MVVM avec `@Observable` / `@MainActor`** : View → ViewModel → Service injecté par protocole → client OpenAPI généré.

| Couche | Responsabilité | Interdit |
|---|---|---|
| View | Affichage, gestes, navigation déclenchée par l'utilisateur | Appels réseau, logique métier |
| ViewModel | État de l'écran, actions, chargement et erreurs | Importer SwiftUI pour autre chose que des types de base ; connaître le client HTTP |
| Service | Accès aux données, conversion DTO → modèles de l'app | Connaître les vues |
| Core | Client API, auth, upload, images, design system | Dépendre des features |

- Un ViewModel **seulement pour les écrans qui ont un état ou une logique réels** (feed, publication, profil, onboarding, paywall) ; une vue statique n'en a pas.
- Services **injectés par protocole** (environnement SwiftUI ou initialiseur), remplaçables par des faux dans les tests et les previews. Les modèles de l'app ne sont pas les types générés.
- **Mises à jour optimistes** pour like, save, follow : l'état change immédiatement et revient en arrière si l'API échoue.
- **Erreurs** : message compréhensible, jamais de crash, possibilité de réessayer.
- **Une seule cible Xcode**, dossiers synchronisés de Xcode (l'ajout de fichiers ne modifie pas le `.pbxproj`) :

```
ios/CloneInstagram/
├── App/            # point d'entrée, injection des dépendances, routeur racine
├── Core/
│   ├── API/        # client généré, configuration, middleware d'authentification
│   ├── Auth/       # session, Sign in with Apple
│   ├── Realtime/   # WebSocket (P1)
│   ├── Media/      # UploadManager (ADR-008), images, lecteurs vidéo
│   ├── Navigation/ # Router, deep links
│   ├── Billing/    # SubscriptionService (ADR-012)
│   ├── Analytics/  # AnalyticsService, noms d'événements (ADR-013)
│   └── Models/     # modèles de l'app
├── DesignSystem/   # couleurs, typographie, composants réutilisables
├── Features/       # Onboarding, Paywall, Feed, Post, Profile, Search, Settings… (vues, ViewModels, services propres)
└── Resources/      # assets, modèles .xcconfig
```

  Une feature n'importe jamais une autre feature ; ce qui est partagé descend dans `Core` ou `DesignSystem`.
- **Navigation** : `TabView` avec les onglets d'Instagram (proposition : Accueil, Reels, Messages, Recherche, Profil, création (+) dans la barre du haut de l'accueil ; à aligner sur l'app actuelle). Une `NavigationStack` par onglet, pilotée par un `Router` (`NavigationPath`). Création et viewers : présentations plein écran.
- **Images** : Nuke (cache mémoire et disque, prefetching, décodage hors du thread principal), **jamais `AsyncImage`**. Toujours la variante adaptée à la taille d'affichage (`thumb` pour les grilles, `large` pour le feed ; ADR-008). Feed en `LazyVStack` ou `List` avec préchargement des images suivantes.
- **Dépendances** : `supabase-swift` (module `Auth` seulement), `AuthenticationServices`, Nuke, `purchases-ios`, `posthog-ios`, `swift-openapi-generator`. Capture : `PhotosPicker` pour les posts. Toute nouvelle dépendance est une décision à faire valider (`Décision non documentée — ADR recommandé`).
- **Configurations** `Local` (API et Supabase sur l'IP du Mac) et `Demo` (API Railway et Supabase Cloud, HTTPS), chacune avec son `.xcconfig` (non versionné, modèle versionné) : URL de l'API, URL Supabase, clé publique Supabase, clé publique RevenueCat, clé projet et hôte PostHog. `NSAllowsLocalNetworking` et `NSLocalNetworkUsageDescription` uniquement en `Local`.
- **Info.plist et capabilities** : `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` (`NSMicrophoneUsageDescription` avec les reels) ; Sign in with Apple ; In-App Purchase (ADR-012) ; Push Notifications en P2.
- Le client OpenAPI est régénéré au build par le plugin `swift-openapi-generator`, à partir d'une copie de `packages/contract/openapi.yaml` (ADR-003).
- **Accessibilité** : Dynamic Type, libellés VoiceOver sur les boutons icônes (like, commentaire, partage, enregistrer), contrastes vérifiés sur les surfaces Liquid Glass.
- Qualité : SwiftLint, SwiftFormat, Swift Testing (+ XCUITest optionnel), lancés en local (ADR-014).

## Alternatives
- React Native / Expo ou Flutter : multiplateforme, mais iOS uniquement ici, fidélité moindre à l'app iOS et pas de Liquid Glass natif. Écarté (D1).
- Reproduction pixel perfect de l'UI actuelle d'Instagram : plus fidèle, mais on lutterait contre les composants système. Écarté (D2).
- TCA ou MV strict : TCA est plus structurant mais lourd ; MV strict mélange état et vue. Écarté (D3).
- Un package SPM par feature : isolation vérifiée par le compilateur, mais modularisation trop coûteuse pour un seul développeur. Écarté (D4).
- Cible iOS 27 exclusivement : accès direct aux nouveautés d'iOS 27 sans vérification de disponibilité, mais écarté par le lead dev au profit d'iOS 26, jugé plus simple (D30).
- `AsyncImage` : aucune dépendance, mais pas de cache disque maîtrisé ni de prefetching. Non retenu.

## Conséquences
### Positives
- Composants système et Liquid Glass sans effort ; fidélité aux interactions iOS.
- ViewModels et services testables avec des faux injectés.
- La cible iOS 26 élargit les appareils compatibles, sans bloquer le développement sur un iPhone en iOS 27.

### Négatives
- L'isolation entre features n'est vérifiée que par revue, pas par le compilateur.
- Les nouveautés d'iOS 27 (Liquid Glass notamment) demandent une lecture de la documentation Apple, des vérifications `#available` et un rendu de repli.
- Le code généré par `swift-openapi-generator` impose une couche de conversion dans les services.

## Liens
- ADR-003 (client Swift généré)
- ADR-008 (`UploadManager`, variantes d'images)
- ADR-009 (configurations `Local` et `Demo`)
- ADR-012 (SDK RevenueCat)
- ADR-013 (SDK PostHog, `AnalyticsService`)
- ADR-014 (tests iOS)
