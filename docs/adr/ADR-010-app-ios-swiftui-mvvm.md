# ADR-010 — App iOS : SwiftUI natif, MVVM `@Observable`, cible iOS 26, une cible organisée par feature

## Statut
Proposé

## Contexte
L'app doit reproduire au plus près l'app iOS d'Instagram, « réinterprétée iOS 27 » avec les composants système Liquid Glass. La plateforme est iOS uniquement.

Un seul développeur écrit l'app avec l'IA : l'architecture doit être légère, bien connue de l'IA et testable.

L'iPhone de test et Xcode sont en iOS 27. Liquid Glass existe depuis iOS 26.

Décisions sources : D1, D2, D3, D4 ; version minimale tranchée par le lead dev (`09` § 4).

## Décision
- **SwiftUI natif**, Swift 6 en mode de concurrence strict.
- **Cible de déploiement : iOS 26**, compilée avec le SDK iOS 27 de Xcode. Toute API propre à iOS 27 est protégée par `if #available(iOS 27, *)`.
- **UI** : structure et interactions d'Instagram avec les composants système Liquid Glass ; le verre est réservé à la navigation et aux contrôles, **jamais au contenu**.
- **MVVM avec `@Observable` / `@MainActor`** : View → ViewModel (seulement si l'écran a un état réel) → Service injecté par protocole → client OpenAPI généré. Les services convertissent les DTO en modèles de l'app.
- **Une seule cible Xcode** organisée en `App/`, `Core/`, `DesignSystem/`, `Features/<feature>/`, avec les dossiers synchronisés de Xcode. Une feature n'importe jamais une autre feature.
- Dépendances : `supabase-swift` (module `Auth` seulement), Nuke, `purchases-ios`, `posthog-ios`, `swift-openapi-generator`. Toute nouvelle dépendance est justifiée dans `09`.
- Configurations `Local` et `Demo`, chacune avec son `.xcconfig` (non versionné, modèle versionné).
- Qualité : SwiftLint, SwiftFormat, Swift Testing (+ XCUITest optionnel), lancés en local.

## Alternatives
- React Native / Expo ou Flutter : multiplateforme, mais iOS uniquement ici, fidélité moindre à l'app iOS et pas de Liquid Glass natif. Écarté (D1).
- Reproduction pixel perfect de l'UI actuelle d'Instagram : plus fidèle, mais on lutterait contre les composants système. Écarté (D2).
- TCA ou MV strict : TCA est plus structurant mais lourd ; MV strict mélange état et vue. Écarté (D3).
- Un package SPM par feature : isolation vérifiée par le compilateur, mais modularisation trop coûteuse pour un seul développeur. Écarté (D4).
- Cible iOS 27 exclusivement : accès direct aux nouveautés d'iOS 27 sans vérification de disponibilité, mais écarté par le lead dev au profit d'iOS 26, jugé plus simple.

## Conséquences
### Positives
- Composants système et Liquid Glass sans effort ; fidélité aux interactions iOS.
- ViewModels et services testables avec des faux injectés.
- La cible iOS 26 élargit les appareils compatibles, sans bloquer le développement sur un iPhone en iOS 27.

### Négatives
- L'isolation entre features n'est vérifiée que par revue, pas par le compilateur.
- Les nouveautés d'iOS 27 demandent des vérifications `#available` et un rendu de repli.
- Le code généré par `swift-openapi-generator` impose une couche de conversion dans les services.

## Liens
- ADR-003 (client Swift généré)
- ADR-009 (configurations `Local` et `Demo`)
- ADR-012 (SDK RevenueCat)
- ADR-013 (SDK PostHog, `AnalyticsService`)
