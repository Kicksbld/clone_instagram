# ADR-008 — Pipeline média : upload présigné, worker BullMQ sans logique métier

## Statut
Proposé

## Contexte
Les posts P0 contiennent des images (jusqu'à 10 par carrousel), et les reels P1 des vidéos. Les fichiers doivent être revalidés, redimensionnés en variantes, débarrassés de leurs métadonnées EXIF (dont GPS), et plus tard transcodés.

Ces traitements prennent de quelques centaines de millisecondes à plusieurs minutes. S'ils tournaient dans l'API, ils bloqueraient les requêtes et feraient transiter des fichiers lourds par l'API.

L'upload depuis l'iPhone doit survivre à la mise en arrière-plan de l'app.

Décisions sources : D8, D9, D11.

## Décision
- **Upload direct vers Storage** : l'app demande une URL présignée (`POST /v1/media/uploads`), envoie le fichier directement, puis confirme (`POST /v1/media/{id}/complete`). L'API ne transporte jamais le fichier.
- **Traitement par un worker séparé** (`apps/worker`) consommant une file **BullMQ**. Tout traitement de plus de quelques centaines de millisecondes passe par un job.
- **Redis sert uniquement de file de jobs** : pas de cache applicatif, pas de pub/sub, pas de rate limit Redis.
- **Machine à états** : `pending_upload → uploaded → processing → ready | failed` (`failed → uploaded` pour la relance). Transitions dans des fonctions partagées de `packages/db`, écrites en `UPDATE … WHERE id = $1 AND status = '<attendu>'` ; zéro ligne touchée = transition invalide. Seul le worker passe en `processing`, `ready` ou `failed`.
- **Worker sans logique métier** : il revalide le fichier réel (type détecté, dimensions ; durée via `ffprobe` pour la vidéo), génère les variantes WebP 150 / 640 / 1080 px sans EXIF, puis change le statut. Jobs idempotents, 3 tentatives avec délai croissant.
- **Un post n'est créé que lorsque tous ses médias sont `ready`.** En P0, l'app interroge `GET /v1/media/{id}` pour connaître le statut.
- Buckets : `uploads` (privé, originaux), `media-public` (chemins UUID), `media-private` (URL signées courtes).
- Jobs de maintenance récurrents (`purge-orphan-media`, `purge-account`, `purge-content-files`) dans la file `maintenance`.

## Alternatives
- Upload à travers l'API : un seul endpoint, mais l'API transporte des fichiers lourds et bloque ses ressources. Écarté (D9).
- Traitement dans l'API : pas de worker à déployer, mais bloquant et contraire à la règle « rien de lourd dans l'API ». Non retenu.
- Redis aussi pour le cache, le pub/sub et le rate limit : plus d'usages, mais bugs d'invalidation sans besoin mesuré. Écarté (D8).
- Post créé en `processing` et publié par le worker : publication plus rapide pour l'utilisateur, mais le worker porterait de la logique métier. Écarté (D11).

## Conséquences
### Positives
- API légère ; traitements isolés et relançables.
- Fichier réel revalidé : les déclarations du client ne font pas foi ; EXIF supprimé.
- Transitions de statut sûres même en cas de job rejoué.

### Négatives
- Un service de plus à déployer (worker) et une dépendance Redis.
- L'app doit gérer l'attente du traitement avant de créer le post (`UploadManager`).
- Les médias publics sont accessibles à qui connaît leur URL exacte (limite assumée, `09` § 3).

## Liens
- ADR-004 (Storage via URL présignées)
- ADR-007 (conventions de données)
- ADR-009 (worker sur Railway, image avec ffmpeg)
