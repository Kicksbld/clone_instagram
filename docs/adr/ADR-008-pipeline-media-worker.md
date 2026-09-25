# ADR-008 — Pipeline média : upload présigné, worker BullMQ sans logique métier

## Statut
Proposé

## Contexte
Les posts P0 contiennent des images (jusqu'à 10 par carrousel), et les reels P1 des vidéos. Les fichiers doivent être revalidés, redimensionnés en variantes, débarrassés de leurs métadonnées EXIF (dont GPS), et plus tard transcodés.

Ces traitements prennent de quelques centaines de millisecondes à plusieurs minutes. S'ils tournaient dans l'API, ils bloqueraient les requêtes et feraient transiter des fichiers lourds par l'API.

L'upload depuis l'iPhone doit survivre à la mise en arrière-plan de l'app.

Décisions sources : D8, D9, D11.

## Décision
- **Upload direct vers Storage** :
  1. l'app demande une intention d'upload : `POST /v1/media/uploads` `{ kind, purpose, mimeType, sizeBytes }` → `{ mediaId, uploadUrl, expiresAt }` ; le média est créé en `pending_upload` ;
  2. elle envoie le fichier directement à l'URL présignée ;
  3. elle confirme : `POST /v1/media/{id}/complete` ; le média passe en `uploaded` et l'API enfile le job de traitement ;
  4. elle suit le statut par `GET /v1/media/{id}` (statut et variantes) jusqu'à `ready` ou `failed`. À partir de la P1, un événement WebSocket évite ce polling (ADR à rédiger, D21).

  L'API ne transporte jamais le fichier.
- **Traitement par un worker séparé** (`apps/worker`) consommant une file **BullMQ**. Tout traitement de plus de quelques centaines de millisecondes passe par un job.
- **Redis sert uniquement de file de jobs** : pas de cache applicatif, pas de pub/sub, pas de rate limit Redis.
- **Table `media`** : `id`, `owner_id`, `kind` (`image` | `video`), `purpose` (`post` | `story` | `avatar` | `message` | `instant`), `status`, `original_path`, `mime_type`, `size_bytes`, `width`, `height`, `duration_ms`, `variants` (jsonb, chemins des fichiers dans Storage, jamais d'URL : l'API construit les URL), `failure_reason`, `created_at`, `processed_at`, `attached_at`, `detached_at`.
- **Machine à états** : `pending_upload → uploaded → processing → ready | failed` (`failed → uploaded` pour la relance, P2). Transitions dans des fonctions partagées de `packages/db`, écrites en `UPDATE … SET status = '<nouveau>' WHERE id = $1 AND status = '<attendu>'` ; zéro ligne touchée = transition invalide (`409`). Seul le worker passe en `processing`, `ready` ou `failed`.
- **Limites** (valeurs initiales, ajustables) :

| Type | Entrée acceptée | Sortie (`variants`) |
|---|---|---|
| Image | JPEG / PNG, ≤ 20 Mo | WebP `thumb` 150 px, `medium` 640 px, `large` 1080 px, **EXIF supprimé** |
| Vidéo (reel, P1) | MP4 H.264 préparé par l'app, ≤ 60 s, ≤ 200 Mo | playlist HLS maître, miniature, durée (ADR à rédiger, D10) |

- **Worker sans logique métier** : il revalide le fichier réel (type détecté, dimensions ; durée via `ffprobe` pour la vidéo) — les déclarations du client ne font pas foi — génère les variantes, puis change le statut (motif dans `failure_reason` en cas d'échec). Jobs idempotents (un job rejoué ne produit pas de doublon), 3 tentatives avec délai croissant, concurrence de 1 pour la vidéo.
- **Rattachement** : un média ne peut être attaché qu'une fois, par son propriétaire, seulement s'il est `ready` et que son `purpose` correspond. **Un post n'est créé que lorsque tous ses médias sont `ready`.**
  - La table `media` porte elle-même son usage : `attached_at` (date où un contenu l'utilise : photo de profil, post…) et `detached_at` (date où il ne l'est plus : photo de profil remplacée ou retirée, contenu supprimé). Aucune requête n'a besoin de parcourir les tables qui référencent un média pour savoir s'il est utilisé.
  - Le rattachement passe par une seule fonction partagée de `packages/db`, écrite comme les transitions : `UPDATE media SET attached_at = now() WHERE id = $1 AND owner_id = $2 AND status = 'ready' AND purpose = $3 AND attached_at IS NULL`. Zéro ligne touchée : l'API relit le média pour renvoyer le bon refus : `404 media_not_found` (inexistant ou d'un autre utilisateur), `409 media_not_ready`, `409 media_already_attached`, `422 media_purpose_mismatch`. Le détachement passe aussi par une fonction partagée (`SET detached_at = now() WHERE id = $1 AND attached_at IS NOT NULL AND detached_at IS NULL`), dans la même transaction que l'écriture qui retire l'usage.
  - Un média détaché n'est jamais rattaché à nouveau.
- **EXIF et originaux** :
  - l'app retire les métadonnées (dont le GPS) en préparant l'image : la position ne quitte pas le téléphone ;
  - le worker les retire quand même des variantes, car les déclarations du client ne font pas foi ;
  - l'original est supprimé du bucket `uploads` par le worker dès que le média passe en `ready` ; en cas d'échec (`failed`), il est conservé pour la relance (P2) jusqu'à la purge.
- **Buckets** : `uploads` (privé, originaux), `media-public` (public, chemins UUID non devinables : variantes des posts, reels, stories, avatars), `media-private` (privé, URL signées de courte durée délivrées par l'API après contrôle d'accès : images de messages, instants). L'app lit les variantes directement depuis Storage.
- **Jobs** :

| File | Job | Rôle |
|---|---|---|
| `media` | `process-image` | Type réel, fichiers invalides refusés, variantes WebP sans EXIF |
| `media` | `process-video` (P1) | `ffprobe`, HLS, miniature |
| `maintenance` | `purge-orphan-media` (toutes les heures) | Fichiers et ligne des médias jamais attachés après 24 h (`attached_at IS NULL`, uploads abandonnés compris) et des médias détachés (`detached_at IS NOT NULL`, ex. photo de profil remplacée ou retirée) |
| `maintenance` | `purge-account` (à la demande) | Données et fichiers d'un compte supprimé ; client RevenueCat (ADR-012) et personne PostHog (ADR-013), appels idempotents |
| `maintenance` | `purge-content-files` | Fichiers d'un contenu supprimé par modération |

- **Contrat des jobs** : noms des files et des jobs, payloads et valeurs de retour dans `packages/jobs`, validés par le worker à la réception (ADR-015).

- **Côté app, `UploadManager`** : file d'uploads persistée (une publication survit à la fermeture de l'écran et à la mise en arrière-plan), `URLSession` en configuration background, préparation avant envoi (image : HEIC → JPEG, 2 160 px maximum), enchaînement intention → envoi → `complete` → attente du statut → création du contenu, bandeau « Publication en cours » avec progression et état d'échec avec relance.

## Alternatives
- Upload à travers l'API : un seul endpoint, mais l'API transporte des fichiers lourds et bloque ses ressources. Écarté (D9).
- Traitement dans l'API : pas de worker à déployer, mais bloquant et contraire à la règle « rien de lourd dans l'API ». Non retenu.
- Redis aussi pour le cache, le pub/sub et le rate limit : plus d'usages, mais bugs d'invalidation sans besoin mesuré. Écarté (D8).
- Purge qui détermine l'usage d'un média en parcourant les tables qui le référencent (`profiles.avatar_media_id`, `post_media`, stories, messages…) : pas de colonne en plus, mais chaque tranche qui ajoute un usage des médias doit modifier la purge, et un oubli efface des médias en ligne. Écarté par le lead dev au profit de `attached_at` / `detached_at`.
- Original conservé après traitement : relance possible d'un média prêt, mais un fichier avec EXIF (GPS) stocké sans usage. Non retenu.
- Post créé en `processing` et publié par le worker : publication plus rapide pour l'utilisateur, mais le worker porterait de la logique métier. Écarté (D11).

## Conséquences
### Positives
- API légère ; traitements isolés et relançables.
- Fichier réel revalidé : les déclarations du client ne font pas foi ; EXIF supprimé.
- Transitions de statut sûres même en cas de job rejoué.
- Règle « attaché une seule fois » garantie par la base ; la purge des médias inutilisés ne dépend pas des tables qui les référencent.
- Aucun fichier conservé avec la position GPS de l'utilisateur.

### Négatives
- Un service de plus à déployer (worker) et une dépendance Redis.
- L'app doit gérer l'attente du traitement avant de créer le post (`UploadManager`).
- Chaque use case qui attache ou retire un média doit appeler les fonctions de rattachement et de détachement ; un rattachement oublié laisse la purge effacer un média en ligne après 24 h (tests de chaque tranche concernée).
- Un média prêt ne peut pas être retraité : son original n'existe plus.
- Les médias publics, y compris ceux d'un compte privé, sont accessibles à qui connaît leur URL exacte ; les chemins UUID les rendent non devinables (limite assumée).

## Liens
- ADR-004 (Storage via URL présignées)
- ADR-007 (conventions de données)
- ADR-009 (worker sur Railway, image avec ffmpeg)
- ADR-010 (`UploadManager` dans `Core/Media`)
- ADR-015 (contrat des jobs)
