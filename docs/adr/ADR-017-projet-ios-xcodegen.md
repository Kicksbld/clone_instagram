# ADR-017 — Projet iOS généré par XcodeGen, client OpenAPI dans un module séparé

## Statut
Accepté

## Contexte
La tranche T0b crée le projet Xcode de l'app (ADR-010). Ni la fiche ni les ADR ne disaient comment le produire : dans l'interface d'Xcode, en écrivant le `.pbxproj` à la main (fichier fragile, que l'IA modifie mal) ou avec un générateur de projet.

Au démarrage de T0b (septembre 2026, Xcode 27, Swift 6.4), deux constats :
- Xcode 27 applique plus strictement l'isolation `@MainActor` par défaut (`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`), retenue par ADR-010 pour la cible de l'app.
- Le code produit par `swift-openapi-generator` 1.13 (ADR-003) ne compile pas sous cette isolation : `Client`, `converter` et les conformances `Decodable` deviennent isolés sur le main actor et sont appelés depuis des contextes non isolés. Le générateur n'a pas d'option pour marquer son code `nonisolated`.

ADR-014 impose SwiftLint et SwiftFormat sans dire comment les installer ni les lancer.

Décision source : D37.

## Décision
- **Projet généré par XcodeGen** depuis `ios/project.yml`. Le `.xcodeproj` est un produit de génération : il n'est **pas versionné** ; `xcodegen generate` le recrée. Seule exception : `project.xcworkspace/xcshareddata/swiftpm/Package.resolved` est versionné, pour figer aussi les dépendances SPM transitives ; XcodeGen le conserve lors d'une régénération. Les sources sont déclarées en dossiers synchronisés (`syncedFolder`), comme le demande ADR-010.
- **Client généré dans une cible séparée `APIClient`** (framework statique) :
  - elle contient uniquement la copie de `openapi.yaml` et `openapi-generator-config.yaml`, dans `ios/CloneInstagram/Core/API/OpenAPI/`, et le plugin `swift-openapi-generator` ;
  - isolation par défaut désactivée (`nonisolated`) et code généré en accès `public` ;
  - la cible de l'app garde l'isolation `@MainActor` par défaut et importe `APIClient`.
  - Cette cible technique est une exception à « une seule cible Xcode » d'ADR-010 ; l'organisation par feature dans une cible unique reste la règle pour le code écrit à la main.
- **Copie du contrat** : `pnpm contract:generate` recopie `packages/contract/openapi.yaml` dans `ios/CloneInstagram/Core/API/OpenAPI/`. La copie est versionnée (Xcode compile sans pnpm) et la CI vérifie qu'elle est à jour.
- **Outils** : XcodeGen, SwiftLint et SwiftFormat installés par Homebrew (`ios/Brewfile`, `brew bundle`). Une phase de build de la cible de l'app lance `swiftlint` (une erreur fait échouer le build) et `swiftformat --lint` (avertissements).
- **Préparation d'une machine** : `ios/scripts/bootstrap.sh` installe les outils, crée les `.xcconfig` locaux à partir des modèles et génère le projet.

## Alternatives
- Projet créé dans l'interface d'Xcode et `.pbxproj` versionné : aucun outil en plus, mais une création manuelle hors de portée de l'IA, puis un fichier de projet que l'IA modifie mal. Non retenu.
- `.pbxproj` écrit à la main : aucun outil en plus, mais un fichier fragile. Non retenu.
- Tuist : autre générateur de projet, écarté par le lead dev au profit de XcodeGen. Non retenu.
- Isolation par défaut désactivée sur la cible de l'app (une seule cible, `@MainActor` explicite sur les ViewModels et les vues) : plus simple, mais on renonce au réglage par défaut d'Xcode et le compilateur protège moins. Non retenu.
- SwiftLint et SwiftFormat en plugins de package SPM : versions épinglées dans le projet, mais les plugins demandent une validation dans Xcode et `-skipPackagePluginValidation` en ligne de commande, et le plugin SwiftFormat ne se lance pas au build. Non retenu.

## Conséquences
### Positives
- Le projet Xcode est décrit dans un fichier texte lisible, relu en revue et modifiable par l'IA ; pas de conflit de `.pbxproj`.
- L'app profite de l'isolation `@MainActor` par défaut d'Xcode 27 sans être bloquée par le code généré.
- Le code généré est confiné dans un module : les vues et les ViewModels ne le voient qu'à travers les services.
- Lint et format vérifiés à chaque build dans Xcode.

### Négatives
- Il faut lancer `xcodegen generate` après un clonage ou une modification de `project.yml` ; Homebrew devient un prérequis.
- Versions de XcodeGen, SwiftLint et SwiftFormat non épinglées (dernière version Homebrew).
- `Package.resolved` est versionné dans un dossier par ailleurs ignoré (`.gitignore` à négations) : un changement de dépendance dans `project.yml` doit être suivi du commit du `Package.resolved` mis à jour.
- `xcodebuild` en ligne de commande demande `-skipPackagePluginValidation` (plugin `swift-openapi-generator`) ; Xcode demande une validation du plugin la première fois.
- Deuxième cible à maintenir (`APIClient`), en exception à ADR-010.

## Liens
- ADR-003 (client Swift généré depuis une copie du contrat)
- ADR-010 (app iOS, cible unique, isolation `@MainActor`, dossiers synchronisés)
- ADR-014 (SwiftLint, SwiftFormat, tests iOS en local)
- ADR-016 (chaîne d'outils du monorepo)
