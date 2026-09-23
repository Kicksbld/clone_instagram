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
| D19 | Tout en local | Déploiement cloud | Suffisant pour l'exercice |
| D20 | Priorités P0 → P3 au lieu d'un planning en semaines | Planning hebdomadaire | Demande du lead dev ; ordre de réalisation clair |
| D21 | Notification de fin de traitement média par QueueEvents plutôt que polling | Polling seul ; pub/sub Redis dédié | Pas de brique supplémentaire ; Redis reste limité à la file de jobs (D8) |

## 2. Risques

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Périmètre trop large pour le délai | Élevée | Élevé | Phases strictes ; une phase n'est commencée que si la précédente est stable ; P2 et P3 sont sacrifiables |
| Pipeline vidéo HLS plus long que prévu | Élevée | Moyen | Reels en P1 après les stories et DM ; repli possible sur MP4 progressif sans changer le contrat (le champ `variants` porte l'URL de lecture) |
| Médias inaccessibles depuis l'iPhone (URL en `localhost`) | Moyenne | Élevé | Vérifier dès la phase P0 la configuration des URL de Supabase Storage et de l'API |
| Dérive de l'architecture par l'IA | Élevée | Moyen | `CLAUDE.md`, dependency-cruiser, revue de chaque tranche |
| Oubli des filtres de blocage / compte privé | Moyenne | Élevé | Politique de visibilité unique + tests de cas limites obligatoires |
| Exposition de la base via l'API de données Supabase | Moyenne | Élevé | RLS sans policy ou exposition désactivée, vérifié par un test avec la clé publique |
| Performance du scroll avec Liquid Glass | Moyenne | Moyen | Verre réservé à la navigation, profilage Instruments |
| Nouveautés d'iOS 27 mal connues | Moyenne | Faible | Lecture de la documentation Apple avant l'UI |
| Perte d'un événement `media.ready` / `media.failed` si le WebSocket est fermé | Élevée | Faible | Repli REST : `GET /v1/media/{id}` au retour au premier plan et après un délai sans événement |

## 3. Limites assumées

- Les médias publics (y compris ceux d'un compte privé) sont accessibles à quiconque connaît leur URL exacte ; les chemins UUID les rendent non devinables.
- Un instant « vu une seule fois » ne peut pas empêcher une capture d'écran.
- Le rate limiting en mémoire est remis à zéro à chaque redémarrage de l'API.
- Pas de montée en charge : une seule instance d'API, de worker et de Redis.

## 4. Points à vérifier au démarrage

- [ ] Version minimale : iOS 27 exclusivement, ou iOS 26 (première version avec Liquid Glass) ? Dépend de la version installée sur l'iPhone de test.
- [ ] Nouveautés d'iOS 27 et du Xcode correspondant (Liquid Glass, réglage d'isolation `@MainActor` par défaut, dossiers synchronisés).
- [ ] Dernière version stable de Next.js et nom du fichier de middleware.
- [ ] Supabase local : configuration des URL publiques de Storage, désactivation de l'exposition du schéma `public`, vérification des JWT (clés de signature), fournisseur Apple.
- [ ] Onglets de l'app : alignement sur l'app Instagram actuelle analysée.
- [ ] Comportement exact des instants : durée d'affichage après ouverture.
- [ ] Limite de collaborateurs par post.
