# Vérifications — accessibilité iOS

Branche : `feat/ios-voiceover-accessibility`. Résultat fonctionnel visé et recette physique : [spec](spec.md).

## Vérifications techniques

- Contrat validé et clients régénérés (`pnpm contract:generate`).
- Compatibilité API : `pnpm contract:breaking` passe, aucune rupture détectée.
- `pnpm lint`, `pnpm typecheck` et `pnpm build` passent.
- `pnpm check:changed` passe intégralement : **939 tests API dans 74 fichiers**, **43 tests base**, **26 tests backoffice** et **50 tests worker**, avec lint, typage, builds et formatage. Les 24 tests Postgres posts/stories, dont ceux des descriptions alternatives, passent également.
- Base locale : migration `0026_talented_reaper` appliquée avec succès (`pnpm db:migrate`) ; **43 tests du paquet `@clone/db` passent**.
- SwiftLint et SwiftFormat : aucune erreur ; avertissements de complexité/taille existants et de taille de certains composants toujours présents.
- iOS : **615 tests passent dans 80 suites** (`ios/scripts/test.sh`), dont descriptions conservées après redémarrage de la file, compatibilité des anciennes files, navigation manuelle des stories, édition/reprise après erreur et recadrage.
- Crash IRGen de Swift 6.3.3 (Xcode 26.6) sur la conversion d'une méthode `MainActor` en setter de `Binding` (sélection multiple de `CreatePostView`, nom d'utilisateur de l'onboarding) : les deux setters utilisent désormais une closure explicite. Le workflow GitHub iOS a été retiré (ADR-014 : app vérifiée en local avec `ios/scripts/test.sh`) ; la CI garde contrat, lint, typecheck, tests et build TypeScript.
- Revue de conformité à la spec réalisée ; écarts relevés corrigés (description d’un reel remplacé, état du like, accusé « Vu », annonces des commentaires, saisie pendant l’enregistrement).

## Vérifications restant ouvertes

- **iPhone physique** : recette VoiceOver avec rideau d’écran, sur la démo. Vérifier particulièrement les actions des cartes combinées, le retour du focus depuis commentaires/partage/édition, le premier message d’une conversation vide, l’activation de VoiceOver pendant une story et la lecture des descriptions après reprise de publication.
- **Déploiement** : appliquer `0026_talented_reaper` avant de lancer la nouvelle API ; recompiler l’app avec le contrat régénéré. La migration est appliquée en local ; son déploiement sur la démo et la recette physique restent à réaliser.
