# 09 — Décisions, risques et points à vérifier

## 1. Journal des décisions

| # | Décision | Alternatives écartées | Raison |
|---|---|---|---|
| D1 | App iOS native en SwiftUI | React Native / Expo, Flutter | iOS uniquement, objectif de fidélité à l'app iOS, Liquid Glass |
| D2 | UI « Instagram réinterprété iOS 27 » | Reproduction pixel perfect de l'UI actuelle | Structure et interactions d'Instagram avec les composants système, sans lutter contre Liquid Glass |
| D3 | MVVM avec `@Observable`, ViewModel seulement si utile | TCA, MV strict | Pattern bien connu de l'IA, léger |
| D4 | Une cible Xcode organisée par dossiers de feature | Packages SPM par feature | Un seul développeur : modularisation SPM trop coûteuse |
| D5 | Supabase comme infrastructure derrière l'API | Clients connectés directement à Supabase (PostgREST, RLS, Realtime) | Logique métier en un seul endroit, architecture hexagonale respectée |
| D6 | Fastify + TypeScript + Drizzle | NestJS, Prisma, autre langage | Langage maîtrisé, légèreté, proximité du SQL |
| D7 | Architecture hexagonale par module, injection manuelle | Couches techniques globales, conteneur DI | Périmètre clair pour l'IA, dépendances explicites |
| D8 | Redis uniquement pour la file de jobs | Cache applicatif, pub/sub, rate limit Redis | Une instance locale ; le cache crée des bugs d'invalidation sans besoin mesuré |
| D9 | Médias : upload présigné direct vers Storage, traitement par worker | Upload à travers l'API | L'API ne transporte pas de fichiers lourds |
| D10 | Vidéo en HLS via ffmpeg | MP4 progressif, service managé (Mux, Cloudflare Stream) | Objectif d'apprentissage ; gratuit en local |
| D11 | Post créé seulement quand ses médias sont `ready` | Post en `processing` publié par le worker | Worker sans logique métier |
| D12 | Posts et reels dans une seule table `posts` | Deux tables | Engagement commun, pas de duplication |
| D13 | Une table de like par cible | Table `likes` polymorphe | Intégrité référentielle garantie par la base |
| D14 | Stories archivées, jamais supprimées automatiquement | Suppression après 24 h | Nécessaire aux stories à la une, comportement d'Instagram |
| D15 | Feed chronologique, pagination par curseur | Recommandation, `OFFSET`, fan-out à l'écriture | Périmètre, exactitude de la pagination |
| D16 | Messages : envoi REST, réception WebSocket | Tout en WebSocket, Supabase Realtime | Contrat et idempotence pour l'écriture, rattrapage simple |
| D17 | Backoffice Next.js organisé par feature, client de l'API | MVC, accès direct à la base | Pas de modèle côté backoffice, logique dans le backend |
| D18 | Contrat OpenAPI unique, clients générés | Types écrits à la main de chaque côté | Empêche les dérives entre produits |
| D19 | ~~Tout en local~~ Remplacée par D29 | Déploiement cloud | Suffisant pour l'exercice |
| D20 | Priorités P0 → P3 au lieu d'un planning en semaines | Planning hebdomadaire | Demande du lead dev ; ordre de réalisation clair |
| D21 | Notification de fin de traitement média par QueueEvents plutôt que polling | Polling seul ; pub/sub Redis dédié | Pas de brique supplémentaire ; Redis reste limité à la file de jobs (D8) |
| D22 | P0 est l'objectif, priorités conservées | Recadrage complet du périmètre | Demande du lead dev ; P1 à P3 viennent ensuite, dans l'ordre |
| D23 | Onboarding, paywall, analytics et A/B test imposés, intégrés en P0 | Les traiter en P1 ou plus tard | Exigence du projet |
| D24 | Paywall avec RevenueCat, abonnement « Clone Plus » inspiré d'Instagram Plus | StoreKit 2 seul | Imposé ; offres configurables sans nouvelle version de l'app, restauration et reçus gérés |
| D25 | Statut d'abonnement lu par l'API via la REST API RevenueCat, copié dans `subscriptions` | Faire confiance au SDK de l'app ; webhooks RevenueCat | Les avantages sont appliqués côté serveur ; le rafraîchissement à la demande marche aussi en dev local, sans URL publique (webhooks possibles plus tard sur la démo) |
| D26 | Analytics et A/B test avec PostHog Cloud | Analytics fait maison ; PostHog auto-hébergé ; RevenueCat Experiments | Choix du lead dev ; un seul outil pour événements, flags et expériences. L'auto-hébergement est trop lourd à mettre en place |
| D27 | Le backoffice ne duplique pas les analytics : simple lien « Ouvrir dans PostHog », aucun endpoint `/v1/admin/analytics/*` | Lire les analytics via l'API (entonnoir et expériences dupliqués côté backoffice) ; appels directs du backoffice à PostHog ; tableaux PostHog intégrés | Choix du lead dev ; l'interface PostHog couvre déjà l'entonnoir et les résultats d'expérience, pas besoin de la reconstruire ; moins d'endpoints à maintenir |
| D28 | Avantages Plus limités à 4 (icône, story 48 h, vue anonyme, recherche dans les vues) | Reprendre tous les avantages d'Instagram Plus | Seuls ceux compatibles avec le périmètre ; la mise en avant d'une story suppose un algorithme de diffusion (hors périmètre) |
| D29 | Dev en local, démo hébergée : Supabase Cloud, Railway (API, worker, Redis), Vercel (backoffice) | Tout en local (D19) ; Render ou Fly.io | Démo fiable devant n'importe quel réseau (un wifi d'école peut bloquer la communication entre appareils), HTTPS sans exception iOS, plus de problème d'IP locale ; Railway accepte les processus longs et une image avec ffmpeg |
| D30 | App iOS ciblant iOS 26 (compilée avec le SDK iOS 27) | iOS 27 exclusivement | Choix du lead dev, plus simple ; Liquid Glass disponible depuis iOS 26, les API propres à iOS 27 passent par `#available` (ADR-010) |
| D31 | Migrations Drizzle appliquées sur Supabase Cloud par une étape de pré-déploiement Railway du service `api` | Commande manuelle | Choix du lead dev ; schéma toujours aligné sur la version déployée, pas d'oubli (ADR-009) |
| D32 | En P0, suivre un compte privé est refusé ; les demandes d'abonnement arrivent en P1 | Créer directement l'abonnement | Choix du lead dev ; pas de contournement du compte privé avant les demandes d'abonnement (P1) |
| D33 | Pendant le développement d'une tranche, la fiche du plan et les ADR sont la seule source de contexte ; le cahier des charges sert à rédiger les ADR et les plans de phase | Cahier des charges lu pendant le développement | Choix du lead dev ; une seule source évite que l'IA suive deux versions d'une même règle (ADR-001) |
| D34 | Compte suspendu ou banni : toutes ses requêtes refusées (`403 account_suspended`) sauf `GET /v1/me` et `DELETE /v1/me`, par un contrôle unique dans la vérification d'authentification | Refuser seulement les écritures, use case par use case | Choix du lead dev ; un compte sanctionné ne voit plus les contenus des autres, un seul point de contrôle impossible à oublier, suppression du compte toujours possible (ADR-005) |
| D35 | Contrat des jobs API ↔ worker dans un package partagé `packages/jobs` (schémas Zod des payloads, validés par le worker) | Contrat dans `packages/db` ; jobs décrits dans `openapi.yaml` ; types écrits de chaque côté ; types TypeScript sans validation | Choix du lead dev ; une dérive de payload casse la compilation au lieu d'un job en échec, et un job enfilé par une ancienne version pendant un déploiement est vérifié (ADR-015) |
| D36 | Packages internes consommés depuis leurs sources TypeScript (`tsdown` pour l'API et le worker, `transpilePackages` pour le backoffice) ; Node 24, pnpm 10 et TypeScript 6.0 épinglés | Packages compilés ; TypeScript 7 ; pnpm 12 | Choix du lead dev ; aucune étape de build entre packages, bundle autonome pour Docker ; TypeScript 7 incompatible avec `typescript-eslint`, pnpm 12 avec le corepack de Node 24 (ADR-016) |
| D37 | Projet iOS généré par XcodeGen (`ios/project.yml`, `.xcodeproj` non versionné sauf `Package.resolved`) ; client OpenAPI généré dans une cible `APIClient` séparée, sans isolation `@MainActor` par défaut ; SwiftLint et SwiftFormat installés par Homebrew | Projet créé dans Xcode avec `.pbxproj` versionné ; `.pbxproj` écrit à la main ; Tuist ; isolation `@MainActor` par défaut désactivée sur l'app ; SwiftLint et SwiftFormat en plugins SPM | Choix du lead dev ; projet décrit dans un fichier texte modifiable par l'IA ; sous Xcode 27, le code de `swift-openapi-generator` ne compile pas sous `@MainActor` par défaut, d'où une exception technique à la cible unique de D4 (ADR-017) |
| D38 | JWT ES256 vérifiés par JWKS en local et sur la démo ; inscription email par code (email → code → mot de passe), email seulement, SMTP iCloud Mail sur la démo (modèles d'email non modifiables avec le SMTP par défaut d'un projet gratuit) ; date de naissance stockée (13 ans minimum) ; profil créé au « J'accepte » ; suggestions de username calculées par l'API | Secret HS256 en local ; `signUp` avec mot de passe puis code ; lien de confirmation ; SMS ; SMTP par défaut de Supabase, Gmail ou service d'envoi ; date de naissance non stockée ; profil créé à la validation du username ; suggestions calculées par l'app | Choix du lead dev ; un seul chemin de vérification sans secret partagé, parcours fidèle à celui d'Instagram, aucun profil sans acceptation des conditions, suggestions toujours libres (ADR-018) |

## 2. Risques

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Périmètre trop large (P0 déjà dense) | Très élevée | Élevé | Phases strictes ; une phase n'est commencée que si la précédente est stable ; chaque feature P0 a une version simplifiée |
| Pipeline vidéo HLS plus long que prévu | Élevée | Moyen | Reels en P1 après les stories et DM ; repli possible sur MP4 progressif sans changer le contrat (le champ `variants` porte l'URL de lecture) |
| Médias inaccessibles depuis l'iPhone en dev (URL en `localhost`) | Moyenne | Faible | Tester sur iPhone via la démo ; en dev, configurer l'IP du Mac ou utiliser le simulateur |
| Problèmes de déploiement découverts tard | Moyenne | Élevé | Squelette déployé dès le début, déploiement automatique de `main` |
| Écarts entre Supabase CLI et Supabase Cloud (config, buckets, URL) | Moyenne | Moyen | Même configuration appliquée aux deux ; chaque tranche testée sur la démo |
| Projet Supabase gratuit mis en pause après inactivité | Moyenne | Élevé | Vérifier et réveiller le projet avant la démo |
| Dérive de l'architecture par l'IA | Élevée | Moyen | `CLAUDE.md`, dependency-cruiser, revue de chaque tranche |
| Oubli des filtres de blocage / compte privé | Moyenne | Élevé | Politique de visibilité unique + tests de cas limites obligatoires |
| Exposition de la base via l'API de données Supabase | Moyenne | Élevé | RLS sans policy ou exposition désactivée, vérifié par un test avec la clé publique |
| Performance du scroll avec Liquid Glass | Moyenne | Moyen | Verre réservé à la navigation, profilage Instruments |
| Nouveautés d'iOS 27 mal connues | Moyenne | Faible | Lecture de la documentation Apple avant l'UI |
| Perte d'un événement `media.ready` / `media.failed` si le WebSocket est fermé | Élevée | Faible | Repli REST : `GET /v1/media/{id}` au retour au premier plan et après un délai sans événement |
| Configuration App Store Connect / sandbox longue (produit, contrat, compte de test) | Moyenne | Élevé | À lancer au début du projet ; fichier de configuration StoreKit pour avancer sans attendre |
| Statut d'abonnement désynchronisé (renouvellement, résiliation) faute de webhooks | Moyenne | Faible | Rafraîchissement au lancement de l'app ; `expires_at` coupe les avantages même sans rafraîchissement |
| RevenueCat ou PostHog injoignable | Faible | Moyen | Analytics jamais bloquants ; dernier statut d'abonnement connu conservé ; variante A/B par défaut |

## 3. Limites assumées

- Les médias publics (y compris ceux d'un compte privé) sont accessibles à quiconque connaît leur URL exacte ; les chemins UUID les rendent non devinables.
- Un instant « vu une seule fois » ne peut pas empêcher une capture d'écran.
- Le rate limiting en mémoire est remis à zéro à chaque redémarrage de l'API.
- Pas de montée en charge : une seule instance d'API, de worker et de Redis.
- L'environnement de démo n'est pas une production : une seule instance, offres gratuites ou d'entrée de gamme, pas de supervision.
- Supprimer un compte ne résilie pas l'abonnement Apple : l'utilisateur doit le résilier lui-même, l'app le lui indique.

## 4. Points à vérifier au démarrage

- [x] Version minimale : iOS 26 (D30).
- [ ] Nouveautés d'iOS 27 et du Xcode correspondant (Liquid Glass, réglage d'isolation `@MainActor` par défaut, dossiers synchronisés).
- [ ] Dernière version stable de Next.js et nom du fichier de middleware.
- [ ] Supabase (CLI et Cloud) : configuration des URL publiques de Storage, désactivation de l'exposition du schéma `public`, vérification des JWT (clés de signature), fournisseur Apple.
- [ ] Railway : connexion à Supabase Cloud (connexion directe ou pooler selon le support IPv6), WebSocket derrière le proxy Railway, taille de l'image du worker avec ffmpeg, coût de l'offre.
- [x] Application des migrations Drizzle sur Supabase Cloud au déploiement : étape de pré-déploiement Railway (D31).
- [ ] Onglets de l'app : alignement sur l'app Instagram actuelle analysée.
- [ ] Comportement exact des instants : durée d'affichage après ouverture.
- [ ] Limite de collaborateurs par post.
- [ ] Parcours d'onboarding et paywall d'Instagram actuels : écrans et libellés à reproduire.
- [ ] RevenueCat : endpoints exacts de la REST API v2 (lecture et suppression d'un client), configuration de l'entitlement `plus` et des offres.
- [ ] PostHog : région du projet cloud (UE de préférence), expériences sur iOS, API de requêtes pour l'entonnoir et les résultats d'expérience, suppression d'une personne.
- [ ] Déclaration App Privacy de l'app pour les données d'analytics et d'achat.
