# P1 : faits externes vérifiés

Recherche du 16/10/2026, pour préparer les ADR et les tranches de P1. Chaque point donne une réponse courte, le détail, les sources avec leur date et un niveau de confiance. Ce sont des faits sur les outils, pas des décisions.

---

## 1. Supabase Storage : taille maximale d'un fichier

**Réponse courte** : sur l'offre gratuite de Supabase Cloud, aucun fichier ne peut dépasser **50 Mo**. Cette limite globale ne peut pas être relevée sans passer à l'offre Pro (jusqu'à 500 Go). Elle s'applique aussi aux uploads par URL signée. **Des vidéos de 200 Mo sont donc impossibles sur la démo hébergée en offre gratuite.**

**Détail**

- La limite globale (« Global file size limit ») se règle dans Dashboard > Storage > Settings. Plafond par offre : Free 50 MB, Pro et Team 500 GB, Enterprise sur mesure.
- Le `file_size_limit` d'un bucket ne peut pas dépasser la limite globale. Il sert seulement à fixer une limite plus basse sur un bucket.
- Les URL signées d'upload sont soumises à la même limite. Dans le code du serveur Storage, la route `PUT /object/upload/sign/:bucketName/*`, utilisée par `uploadToSignedUrl`, appelle `uploadFromRequest`. Celle-ci lit `file_size_limit` et `allowed_mime_types` du bucket, puis `getStandardMaxFileSizeLimit` retient le plus petit entre la limite du bucket et celle du projet. L'upload par URL signée n'est donc pas un moyen de contourner la limite. Le type MIME autorisé par le bucket est vérifié lui aussi.
- Pour les uploads simples, Supabase recommande de ne pas dépasser 6 Mo et de passer au-delà par l'upload reprenable TUS. Le serveur accepte aussi un jeton d'URL signée dans l'en-tête `x-signature` de TUS (couvert par les tests de `supabase/storage`). La limite de taille reste la même.
- **CLI locale** : `supabase/config.toml` du dépôt contient `[storage] file_size_limit = "50MiB"` (limite globale) et `[storage.buckets.uploads] file_size_limit = "20MiB"` avec `allowed_mime_types = ["image/jpeg", "image/png"]`. En local, aucune offre ne plafonne la valeur : on peut écrire `"200MiB"`. Le local accepterait alors des fichiers que la démo refuse. Il faut aussi ajouter les types MIME vidéo au bucket `uploads`, en local et sur Cloud (`supabase seed buckets --linked`).
- Point non vérifié : la doc écrit « 50 MB » et la CLI « 50MiB ». Je n'ai pas vérifié si le plafond Free est de 50 000 000 ou de 52 428 800 octets. Garder une marge.

**Sources**

- Doc Supabase « Limits » (Storage > Uploads > File limits) : https://supabase.com/docs/guides/storage/uploads/file-limits (source `apps/docs/content/guides/storage/uploads/file-limits.mdx`, dernier commit le 23/01/2026)
- Doc Supabase « Standard uploads » : https://supabase.com/docs/guides/storage/uploads/standard-uploads (consultée le 16/10/2026)
- Code du serveur Storage, `src/http/routes/object/uploadSignedObject.ts`, `src/storage/object.ts` (`uploadFromRequest`) et `src/storage/uploader.ts` (`getStandardMaxFileSizeLimit`) : https://github.com/supabase/storage (`main` au 16/10/2026)
- `supabase/config.toml` du dépôt

**Confiance** : élevée (doc officielle et code source concordent).

---

## 2. Railway et WebSocket

**Réponse courte** : le proxy de Railway accepte les WebSocket sur HTTP/1.1. Railway documente qu'ils **ne sont soumis à aucune limite de durée ni d'inactivité** et peuvent rester ouverts indéfiniment, même inactifs. Un redéploiement coupe toutefois toutes les connexions de l'ancienne instance.

**Détail**

- Spécifications de l'edge : WebSocket sur HTTP/1.1, mais pas sur HTTP/2. Une connexion HTTP/1.1 inactive est fermée après 60 s entre deux requêtes, ce qui ne s'applique ni à HTTP/2 ni aux WebSocket. Une requête HTTP peut durer jusqu'à 15 min si des données circulent et est fermée après 5 min sans données. Le corps d'une requête doit être envoyé en 5 min. « Websocket connections are exempt from these duration and inactivity limits, and can stay open indefinitely, even while idle. »
- Limites : 10 000 connexions simultanées et environ 11 000 requêtes/s par domaine. La doc précise que ces informations peuvent changer à tout moment.
- Des utilisateurs signalent pourtant sur le forum Railway des coupures (code 1006) à intervalles variables. Ces cas ne sont pas confirmés par la doc. Un ping applicatif et une reconnexion automatique côté client restent nécessaires.
- **Redéploiement** : par défaut, Railway garde un seul déploiement par service. Une fois le nouveau actif, l'ancien est arrêté. L'ancien reçoit `SIGTERM`, puis `SIGKILL` après `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` (0 par défaut). `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS` (0 par défaut) prolonge sa vie après l'activation du nouveau. Aucune connexion WebSocket n'est transférée : chaque client est coupé et doit se reconnecter, au plus tard à la fin du draining.

**Sources**

- Doc Railway « Specs & Limits » : https://docs.railway.com/networking/public-networking/specs-and-limits (source `railwayapp/docs`, dernier commit le 21/07/2026)
- Doc Railway « Deployment Teardown » : https://docs.railway.com/deployments/deployment-teardown (consultée le 16/10/2026)
- Doc Railway, variables (`RAILWAY_DEPLOYMENT_OVERLAP_SECONDS` et `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`, 0 par défaut) : https://docs.railway.com/variables/reference (consultée le 16/10/2026)
- Forum Railway, coupures signalées : https://station.railway.com/questions/web-socket-connections-dropping-1006-at-c4b32957 (consulté le 16/10/2026)

**Confiance** : élevée pour les limites et le teardown documentés. Moyenne pour la stabilité réelle des connexions longues.

---

## 3. BullMQ `QueueEvents`

**Réponse courte** : `QueueEvents` émet `failed` **uniquement quand le job passe définitivement en échec** : tentatives épuisées, `UnrecoverableError` ou backoff qui renvoie -1. Les tentatives qui seront rejouées n'émettent pas `failed`. À l'inverse, l'événement local `failed` du `Worker` est émis à chaque tentative ratée. `completed` porte `returnvalue`, déjà désérialisé en objet par `QueueEvents`.

**Détail** (code de bullmq 6.3.8, la version du dépôt)

- `Job.moveToFailed` appelle `shouldRetryJob`, qui retourne vrai si `attemptsMade + 1 < attempts`, que l'erreur n'est pas une `UnrecoverableError` et que le backoff ne vaut pas -1. Le job part alors dans `retryJob` ou `moveToDelayed`, qui publient `waiting` ou `delayed` dans le flux d'événements, sans `failed`. Sinon, le script Lua `moveToFinished` ajoute `failed` au flux, puis `retries-exhausted` (`{ jobId, attemptsMade }`, `attemptsMade` en chaîne) si `attemptsMade >= attempts`.
- `Worker.handleFailed` émet `this.emit('failed', job, err, 'active')` après chaque `moveToFailed`, que le job soit rejoué ou non.
- Payload de `failed` : `{ jobId: string, failedReason: string, prev?: string }`, avec `prev` égal à `"active"`. Le second argument est l'identifiant de l'événement dans le flux Redis.
- Payload de `completed` : `{ jobId: string, returnvalue: ReturnType, prev?: string }`. Le worker stocke `JSON.stringify(returnvalue)` dans Redis, et `QueueEvents` le relit avec `JSON.parse` avant d'émettre. On reçoit donc la valeur, pas une chaîne JSON (une chaîne seulement si le job a renvoyé une chaîne).
- `QueueEvents` lit un flux Redis (`XREAD`) : un événement n'est pas perdu pendant une déconnexion, dans la limite de la taille maximale du flux (`maxEvents`).
- **Versions** : `^6.3.8` dans `apps/api/package.json` et `apps/worker/package.json`, `bullmq@6.3.8` dans `pnpm-lock.yaml`. La dernière version sur npm est 6.3.15 (14/10/2026).

**Sources**

- Code de `bullmq@6.3.8` dans `node_modules` : `dist/esm/classes/job.js` (`shouldRetryJob`, `moveToFailed`), `classes/worker.js` (`handleFailed`), `classes/queue-events.js` et `.d.ts`, `commands/moveToFinished-14.lua`, `commands/retryJob-11.lua`
- Guide BullMQ « Events » : https://docs.bullmq.io/guide/events (consulté le 16/10/2026)
- Registre npm, `npm view bullmq time`, interrogé le 16/10/2026

**Confiance** : élevée (lu dans le code exécuté par le dépôt).

---

## 4. swift-openapi-generator et schémas non référencés

**Réponse courte** : **oui**. Sans `filter`, le générateur crée un type Swift (`Components.Schemas.X`, `Codable`) pour **chaque** entrée de `components/schemas`, même si aucune opération ne la référence. Des événements WebSocket décrits dans `openapi.yaml` seront donc générés et décodables avec `JSONDecoder`.

**Détail**

- `translateComponents` appelle `translateSchemas(components.schemas, …)`, qui parcourt tout le dictionnaire, sans élagage selon l'usage.
- Seule l'option `filter` du fichier `openapi-generator-config.yaml` réduit la génération (clés `operations`, `tags`, `paths`, `schemas`). Les éléments retenus gardent la fermeture transitive de leurs dépendances. Le dépôt n'utilise pas de `filter` : seulement `generate: [types, client]`, `accessModifier: public` et `namingStrategy: idiomatic`. Il n'y a rien à ajouter. Si un `filter` est ajouté un jour, il faudra y lister les schémas d'événements dans `schemas`.
- Les types restent dans le module `APIClient`, publics grâce à `accessModifier: public`.
- **Versions** : `exactVersion: 1.13.1` dans `ios/project.yml`, confirmé par `Package.resolved`. La dernière version est 1.14.1 (13/10/2026).

**Sources**

- Doc « Configuring the generator », section « Document filtering » : https://github.com/apple/swift-openapi-generator/blob/1.13.1/Sources/swift-openapi-generator/Documentation.docc/Articles/Configuring-the-generator.md (tag 1.13.1)
- Code au tag 1.13.1 : `Sources/_OpenAPIGeneratorCore/Translator/TypesTranslator/translateComponents.swift`, `translateSchemas.swift` et `Hooks/DocumentFilter.swift`
- Releases GitHub : https://github.com/apple/swift-openapi-generator/releases (1.14.1 du 13/10/2026)
- `ios/project.yml`, `ios/CloneInstagram.xcodeproj/.../Package.resolved`, `openapi-generator-config.yaml` du dépôt

**Confiance** : élevée (code source).

---

## 5. AVAssetExportSession : poids d'une vidéo de 60 s

**Réponse courte** : avec `AVAssetExportPreset1280x720`, **60 s font environ 55 Mo**, donc au-dessus de 50 Mo. `AVAssetExportPreset1920x1080` donne 78 à 114 Mo, et `AVAssetExportPresetMediumQuality` environ 5 Mo, mais en 568×320. Pour tenir sous 50 Mo en 720p ou 1080p, il faut fixer le débit avec `AVAssetWriter` ou borner la sortie avec `fileLengthLimit`.

**Détail**

- Apple ne publie pas les débits de ses presets. Les valeurs ci-dessous viennent de **ma propre mesure** : source synthétique de 60 s en 1080p à 30 i/s, avec du mouvement et du grain (un cas défavorable), sans piste audio, exportée sous macOS 27 / Xcode du poste. Les encodeurs d'iOS peuvent différer légèrement.

| Preset | Sortie | Débit vidéo mesuré | Taille pour 60 s |
|---|---|---|---|
| `AVAssetExportPreset1280x720` | 1280×720 H.264 | environ 7,3 Mb/s (stable selon le contenu) | **environ 55 Mo** |
| `AVAssetExportPreset1920x1080` | 1920×1080 H.264 | 10,4 à 15,2 Mb/s selon le contenu | 78 à 114 Mo |
| `AVAssetExportPresetHEVC1920x1080` | 1920×1080 HEVC | 8,7 à 12,4 Mb/s | 65 à 93 Mo |
| `AVAssetExportPresetMediumQuality` | 568×320 H.264 | environ 0,7 Mb/s | environ 5,3 Mo |

- Ces mesures concordent avec des retours tiers. Un développeur relève environ 706 kb/s et du 568×320 avec `MediumQuality`. Un autre note qu'un clip 1080p de 25 s passe de 34 à 32,5 Mo seulement avec le preset 720p.
- Il faut ajouter l'audio AAC, environ 128 kb/s, soit à peu près 1 Mo par minute.
- **Débit fixé avec `AVAssetWriter`** (`AVVideoAverageBitRateKey`), calcul (débit vidéo + 0,128 Mb/s) × 60 / 8 : 720p à 3,5 Mb/s ≈ 27 Mo, 1080p à 5 Mb/s ≈ 38 Mo, 1080p à 6 Mb/s ≈ 46 Mo. Les presets d'export ne permettent pas de choisir le débit.
- **`fileLengthLimit`** (`AVAssetExportSession`, iOS 4+) : taille que la sortie « ne devrait pas dépasser ». L'en-tête du SDK prévient que la sortie peut la dépasser un peu selon le contenu et qu'il faut vérifier la taille réelle. `estimateOutputFileLengthWithCompletionHandler` (`estimatedOutputFileLengthInBytes` en Swift, iOS 13+) estime la taille avant l'export.

**Sources**

- En-tête du SDK iOS, `AVFoundation.framework/Headers/AVAssetExportSession.h` (Xcode installé sur le poste, lu le 16/10/2026) : `fileLengthLimit`, `estimateOutputFileLengthWithCompletionHandler`, `estimateMaximumDurationWithCompletionHandler`
- Mesure locale du 16/10/2026 (scripts Swift jetables, non versionnés)
- Retour tiers sur `MediumQuality` à environ 706 kb/s : https://topic.alibabacloud.com/a/swift-video-recording-settings-video-compression-quality-resolution-examples_1_39_20026440.html (non daté)
- Retour tiers sur 720p et 1080p : https://www.jianshu.com/p/4f69c22c6dce (non daté)

**Confiance** : moyenne. L'ordre de grandeur est fiable, mais ce n'est pas un chiffre officiel et la mesure a été faite sur macOS, pas sur un iPhone. À confirmer avec une vraie vidéo filmée sur iPhone.

---

## 6. Instagram : mentions

**Réponse courte** : **20 mentions `@` au maximum dans une légende**, d'après la doc officielle de l'API de publication de Meta. Pour les commentaires, aucune limite officielle n'est publiée. La notification « vous a mentionné dans sa story » n'a pas de durée de vie officielle documentée. Selon des sources tierces, l'aperçu de la story disparaît avec la story, au bout de 24 h.

**Détail**

- **Légende** : la référence Meta `POST /<IG_ID>/media`, paramètre `caption`, indique « Maximum 2 200 caractères, 30 hashtags et 20 tags `@` » (version française de la page). Elle précise aussi que les comptes mentionnés reçoivent une notification à la publication. Cette limite vaut pour l'API. Romper a constaté que l'app laisse saisir plus de 20 `@` dans une légende : à vérifier si on veut copier l'app plutôt que l'API.
- **Commentaire** : les sources tierces se contredisent (5, 10 ou « pas de limite stricte »). Aucune source Meta n'a été trouvée. C'est au lead dev de fixer la règle.
- **Mention dans une story** : la page d'aide Instagram confirme que le nom d'utilisateur est visible dans la story et cliquable. Le texte complet de la page n'a pas pu être extrait (rendu en JavaScript). Selon des sources tierces, la personne mentionnée reçoit un message privé avec un aperçu de la story (« Ajouter à votre story ») et une ligne dans l'activité. L'aperçu disparaît quand la story expire, au bout de 24 h. Rien d'officiel ne précise combien de temps la ligne reste dans l'activité.

**Sources**

- Meta for Developers, IG User Media, paramètre `caption` : https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media (consultée le 16/10/2026)
- Aide Instagram « What happens when someone mentions you in their Instagram story » : https://help.instagram.com/1035095153255339/ (consultée le 16/10/2026, seule la description a été lue)
- Romper, test des tags et des mentions : https://www.romper.com/p/how-many-people-can-i-tag-on-instagram-in-one-post-it-depends-on-how-you-do-it-10151229 (non daté)
- Socialrails, limites de commentaires : https://socialrails.com/blog/instagram-comment-limits-complete-guide (2026)
- Storrito, mentions dans les stories : https://storrito.com/resources/mentions-instagram-story/ (non daté)

**Confiance** : élevée pour les 20 mentions par légende (via l'API). Faible pour les commentaires et pour la durée de la notification de story.
