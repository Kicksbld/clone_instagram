# ADR-024 — Vidéo des reels : transcodage HLS par ffmpeg dans le worker

## Statut
Proposé

## Contexte
La P1 ajoute les reels : vidéo verticale de 60 secondes au plus, un onglet Reels qui enchaîne les vidéos en plein écran, et l'aperçu des reels signalés dans le backoffice.

Contraintes :
- l'app filme ou importe des vidéos lourdes (jusqu'à 200 Mo) ; la lecture doit démarrer vite, sur un réseau mobile variable ;
- les fichiers sont revalidés par le worker, sans logique métier (ADR-008) ; l'API ne transporte aucun fichier ;
- le traitement vidéo occupe fortement le processeur de l'unique instance du worker ; les images ne doivent pas attendre derrière une vidéo ;
- le projet a un objectif d'apprentissage, et l'environnement local doit rester gratuit.

Décisions sources : D10, D43.

## Décision
- **HLS produit par ffmpeg** dans le worker (job `process-video`) ; `ffprobe` pour l'analyse. ffmpeg est installé sur la machine de dev et inclus dans l'image Docker du worker (ADR-009).
- **File dédiée `media-video`**, concurrence de 1, séparée de la file `media` des images : une vidéo en cours ne bloque jamais les photos. Payload `{ mediaId }`, valeur de retour `{ mediaId, ownerId }` (ADR-015, lue par ADR-022). 3 tentatives avec délai croissant (ADR-008). Délai maximal d'un traitement : 10 minutes.
- **Préparation par l'app** (`Core/Media`) : export MP4 H.264 / AAC par `AVAssetExportSession`, coupé à 60 secondes, avant l'upload (`POST /v1/media/uploads` avec `kind = video`, `purpose = post`).
- **Contrôles du worker** (les déclarations du client ne font pas foi) :

| Contrôle | Refus (`failed`, motif dans `failure_reason`) |
|---|---|
| Conteneur et flux | pas de flux vidéo, fichier illisible par `ffprobe` |
| Durée | plus de 60,5 secondes (tolérance d'arrondi de l'export) |
| Taille | plus de 200 Mo |

  Une vidéo sans piste audio est acceptée.
- **Sortie** :
  - deux rendus H.264 / AAC : **360p** et **720p** (plus petit côté de 360 et 720 px, proportions conservées, sans agrandissement si la source est plus petite) ;
  - segments MPEG-TS d'environ 4 secondes, playlist par rendu, **playlist maître** qui les référence ;
  - **miniature** WebP de 640 px, tirée à la première seconde ;
  - métadonnées supprimées (dont la position GPS), comme pour les images.
- **Stockage** : bucket public `media-public`, chemins UUID (`<mediaId>/hls/…`), avec les types MIME `application/vnd.apple.mpegurl` (playlists) et `video/mp2t` (segments). L'original est supprimé du bucket `uploads` dès que le média est `ready` (ADR-008).
- **`variants`** d'une vidéo (chemins, jamais d'URL ; l'API construit les URL) : `{ hls: "<chemin de la playlist maître>", thumbnail: "<chemin de la miniature>" }` ; durée dans `media.duration_ms`, dimensions dans `width` / `height`.
- **Purge** : supprimer une vidéo supprime tout le dossier `<mediaId>/` (playlists, segments, miniature), par les jobs de purge existants.
- **Côté app (feature `Reels`, lecteurs dans `Core/Media`)** :
  - `AVPlayer` lit le HLS nativement et choisit le rendu selon le réseau ;
  - **pool de 2 ou 3 `AVPlayer` réutilisés**, jamais un lecteur par cellule ;
  - lecture automatique du seul reel visible, préchargement du suivant, pause à la sortie de l'écran, son coupé par défaut ;
  - la miniature s'affiche (Nuke) en attendant la première image ;
  - `NSMicrophoneUsageDescription` ajouté pour filmer un reel avec le son.
- **Côté backoffice** : aperçu des reels avec `hls.js` (Chrome ne lit pas le HLS nativement).
- **Repli** : si le HLS prend trop de temps à mettre au point, le worker peut produire un MP4 progressif à la place, sans changer le contrat (`variants.hls` porte alors l'URL de lecture). Ce repli demande la validation du lead dev.
- **Tests du worker** (fichiers d'exemple) : vidéo valide → playlist maître, deux rendus, miniature ; vidéo de 61 s → `failed` ; fichier sans flux vidéo → `failed` ; vidéo plus petite que 720p → pas d'agrandissement ; job rejoué → aucun doublon.

## Alternatives
- MP4 progressif : un seul fichier, plus simple, mais un seul débit pour tous les réseaux et un démarrage plus lent. Non retenu, gardé en repli (D10).
- Service managé (Mux, Cloudflare Stream) : transcodage et diffusion sans effort, mais payant, dépendant d'un SaaS et sans apprentissage. Écarté (D10).
- Vidéos dans la file `media` des images avec une concurrence globale de 1 : pas de nouvelle file, mais une vidéo de plusieurs minutes bloque toutes les photos. Non retenu.
- Segments fMP4 au lieu de MPEG-TS : format plus récent, mais aucun besoin ici et MPEG-TS est lu partout. Non retenu.
- Un troisième rendu 1080p : meilleure qualité, mais traitement plus long et stockage plus lourd sur une instance unique. Non retenu.

## Conséquences
### Positives
- Lecture rapide et adaptée au réseau, gérée nativement par `AVPlayer`.
- Les photos restent traitées immédiatement pendant le traitement d'une vidéo.
- Gratuit en local, sans dépendance à un service externe.

### Négatives
- Traitement long et coûteux en processeur sur l'unique instance du worker ; image Docker plus lourde avec ffmpeg.
- Beaucoup de petits fichiers par vidéo, à purger par dossier.
- Le HLS d'un compte privé reste lisible par qui connaît l'URL exacte ; les chemins UUID le rendent non devinable (limite assumée).
- Une file de plus à surveiller et à écouter (`QueueEvents`, ADR-022).

## Liens
- ADR-008 (pipeline média, buckets, tentatives)
- ADR-009 (ffmpeg dans l'image du worker)
- ADR-010 (`Core/Media`, lecteurs vidéo)
- ADR-011 (aperçu `hls.js` dans le backoffice)
- ADR-015 (file `media-video`, payload et valeur de retour)
- ADR-022 (notification de fin de traitement)
