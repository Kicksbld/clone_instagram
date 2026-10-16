# ADR-025 — Contenus éphémères : stories archivées, jamais supprimées ; stories à la une et notes

## Statut
Proposé

## Contexte
La P1 ajoute les stories photo : audience « tout le monde » ou « amis proches », expiration après 24 h, viewer plein écran, liste des vues, archivage automatique. Trois avantages Clone Plus s'y appliquent : story visible 48 h, vue anonyme, recherche dans la liste des vues. La P2 ajoute les stories à la une (à partir des stories archivées) et les notes (texte court de 24 h).

Contraintes :
- une story expirée doit rester disponible pour son auteur (archive) et pour les stories à la une, comme sur Instagram ;
- les avantages Plus sont appliqués par l'API, jamais par l'app (ADR-012) ;
- l'audience « amis proches » et le blocage s'appliquent à toutes les lectures (ADR-006) ;
- pas de tâche planifiée inutile : le worker n'a pas de logique métier (ADR-008).

Décisions sources : D14, D28, D47.

## Décision
### Stories (P1)
- **Module `ephemeral`**, table `stories` : `id`, `author_id`, `media_id`, `audience` (`everyone` | `close_friends`), `view_count`, `created_at` (`timestamptz(3)`), `expires_at`, `deleted_at`. Index `stories (author_id, expires_at)`.
- **Stories archivées, jamais supprimées automatiquement** : une story est **active** tant que `expires_at > now()` et `deleted_at IS NULL`. Ensuite, elle est **archivée** : visible de son seul auteur (`GET /v1/me/stories/archive`), sans aucun job d'expiration. L'expiration est un simple filtre sur `expires_at`.
- **Durée** fixée à la publication : `expires_at = created_at + 24 h`, ou **+ 48 h si l'auteur est Plus** (`isPlus`, ADR-012) au moment de la publication. Un avantage acquis reste acquis : la story garde ses 48 h si l'abonnement expire ensuite.
- **Publication** : `POST /v1/stories` `{ mediaId, audience, mentionedUserIds? }`. Photo uniquement (`kind = image`, `purpose = story`, `ready`, rattachée par la fonction partagée d'ADR-008). Limite : 20 / heure (ADR-005). Une story n'a ni légende, ni texte libre, ni sticker (hors périmètre).
- **Mentions dans une story** : un champ dédié, puisqu'une story n'a pas de texte où écrire `@username`.
  - `mentionedUserIds` : 0 à 20 comptes (limite d'Instagram), sans doublon, pas soi-même ; chaque compte doit être visible de l'auteur (`canViewProfile`), sinon `422 invalid_mention` ; les mentions sont fixées à la publication et ne se modifient pas ;
  - enregistrées dans la table `mentions` du module `engagement` (`story_id` renseigné, ADR-007), dans la même transaction que la story, par un port transverse ou une écriture partagée avec les mentions des posts et des commentaires (choix laissé à la tranche des mentions, sans import d'un module par un autre, ADR-005) ;
  - notification `mention` (ADR-026) seulement aux comptes mentionnés qui peuvent voir la story (`canViewStory`) : un compte mentionné hors des amis proches d'une story `close_friends` n'est pas prévenu ;
  - à la lecture, la story renvoie `mentions` : aperçus des comptes mentionnés encore visibles du lecteur (comptes bloqués ou non actifs retirés) ;
  - côté app : choix des comptes à la création (recherche d'utilisateurs existante) ; dans le viewer, les mentions s'affichent en étiquettes `@username` sur la photo, qui ouvrent le profil.
- **Visibilité** : `canViewStory(viewer, story)` (ADR-006) = `canViewContent` de l'auteur, et audience `everyone` ou `viewer` dans les amis proches de l'auteur. L'auteur voit toujours ses stories. Une story invisible renvoie `404`.
- **Endpoints** :

| Méthode | Chemin | Rôle |
|---|---|---|
| POST | `/v1/stories` | Publier |
| GET | `/v1/stories/tray` | Bandeau : auteurs (soi-même et comptes suivis) ayant au moins une story active visible, avec l'état vu / non vu et un indicateur « amis proches » |
| GET | `/v1/users/{id}/stories` | Stories actives visibles d'un auteur, de la plus ancienne à la plus récente |
| POST | `/v1/stories/{id}/view` | Enregistrer une vue `{ anonymous?: boolean }` |
| GET | `/v1/stories/{id}/viewers` | Liste des vues (auteur seulement), filtre `?q=` |
| DELETE | `/v1/stories/{id}` | Supprimer sa story (suppression logique, média détaché puis purgé) |
| GET | `/v1/me/stories/archive` | Mes stories archivées, de la plus récente à la plus ancienne |

- **Ordre du bandeau** : sa propre story en premier, puis les auteurs ayant une story non vue, puis les autres ; à l'intérieur de chaque groupe, de la story la plus récente à la plus ancienne. Un auteur est « vu » quand toutes ses stories actives visibles ont été vues par le lecteur.
- **Vues** : table `story_views` (`story_id`, `viewer_id`, `viewed_at`), clé primaire `(story_id, viewer_id)`.
  - Une vue par personne, enregistrée à l'affichage ; idempotente ; `view_count` n'augmente que si la ligne est créée, dans la même transaction.
  - L'auteur qui regarde sa propre story n'est pas compté.
  - **Vue anonyme (Plus)** : `{ anonymous: true }` réservé aux abonnés Plus, sinon `403 plus_required`. Aucune ligne n'est écrite, la vue n'est pas comptée. La politique de visibilité s'applique normalement.
- **Liste des vues** : réservée à l'auteur (`404` pour les autres), active ou archivée, de la vue la plus récente à la plus ancienne, pagination par curseur `(viewed_at, viewer_id)`. Les comptes bloqués (dans un sens ou dans l'autre) et non actifs n'y figurent pas. **Recherche (Plus)** : `?q=` filtre par username ou nom ; réservé aux auteurs Plus, sinon `403 plus_required`.
- **Réponse à une story** : crée un message privé `story_reply` dans la conversation avec l'auteur (ADR-023), seulement si la story est active et visible, et pas la sienne. Le module `messaging` lit la story par un port de lecture qui lui est propre, implémenté sur la table `stories`.
- **Amis proches** : table `close_friends` (`owner_id`, `friend_id`, `created_at`, module `social`), gérée dans Paramètres. Retirer quelqu'un des amis proches lui retire immédiatement l'accès aux stories `close_friends` déjà publiées. Aucune notification.
- **Côté app** (feature `Stories`) : création par la caméra ou la photothèque, viewer plein écran (présentation plein écran, ADR-010) avec progression, appui pour passer, glissement vers le bas pour fermer ; la vue est envoyée à l'affichage de chaque story ; la liste des vues s'ouvre depuis sa propre story.

### Stories à la une (P2)
- Tables `highlights` (`id`, `owner_id`, `title` ≤ 15 caractères, `cover_media_id`, `created_at`, `updated_at`) et `highlight_items` (`highlight_id`, `story_id`, `position`), module `ephemeral`.
- Seules les stories de l'auteur, actives ou archivées et non supprimées, peuvent y figurer ; une story peut être dans plusieurs stories à la une.
- **Visibilité** : elle ne dépend plus de l'expiration. Elle suit celle du profil (`canViewContent` de l'auteur) **et** conserve l'audience de la story : une story `close_friends` reste réservée aux amis proches, comme sur Instagram.
- Supprimer une story la retire des stories à la une ; une story à la une vide est supprimée.
- Les vues d'une story affichée dans une story à la une ne sont pas enregistrées.

### Notes (P2)
- Table `notes` : `id`, `author_id`, `body` (1 à 60 caractères), `audience` (`mutuals` | `close_friends`), `created_at`, `expires_at` (= `created_at` + 24 h).
- **Une seule note active par auteur** : en publier une nouvelle (`PUT /v1/me/note`) remplace l'ancienne dans la même transaction ; `DELETE /v1/me/note` la retire.
- **Visibilité** : audience `mutuals` → abonnés mutuels (`isMutual`, ADR-006) ; `close_friends` → amis proches de l'auteur. `canViewProfile` s'applique toujours. `GET /v1/notes` renvoie les notes actives visibles, affichées en haut de la messagerie.
- Répondre à une note crée un message `note_reply` (ADR-023).
- Les notes expirées restent en base (filtre `expires_at`), sans archive consultable.

### Commun
- Aucun job ne supprime une story ou une note expirée. Les fichiers d'une story ne sont purgés qu'à sa suppression par l'auteur ou par modération, ou à la suppression du compte (ADR-008).
- **Cas limites** (ADR-014) : mention d'un compte bloqué ou de soi-même (`422`), compte mentionné qui ne peut pas voir la story (pas de notification), story `close_friends` vue par un abonné qui n'est pas ami proche, story expirée (`404` pour les autres, visible dans l'archive), vue anonyme sans abonnement, recherche dans les vues sans abonnement, abonnement expiré après une story de 48 h, liste des vues demandée par un autre que l'auteur, auteur bloqué après une vue.

## Alternatives
- Suppression des stories après 24 h par un job : base plus légère, mais pas d'archive ni de stories à la une possibles, contrairement à Instagram. Écarté (D14).
- Durée recalculée à chaque lecture selon l'abonnement actuel : toujours alignée sur l'abonnement, mais une story publiée en Plus disparaîtrait plus tôt à l'expiration de l'abonnement. Non retenu (ADR-012 : un avantage acquis reste acquis).
- Vue anonyme enregistrée avec un indicateur caché : statistiques complètes, mais donnée gardée contre la promesse de l'avantage. Non retenu.
- Stories à la une visibles de tous les abonnés quelle que soit l'audience d'origine : plus simple, mais une story réservée aux amis proches deviendrait visible de tous. Non retenu.
- Mentions écrites en `@username` dans un texte de la story : comme les posts, mais le texte sur les stories est hors périmètre. Non retenu par le lead dev au profit d'un champ dédié.
- Pas de mention dans les stories : plus simple, mais contraire au périmètre P1. Non retenu par le lead dev.
- Autres avantages d'Instagram Plus (mise en avant d'une story, listes d'audience personnalisées, compteur de revisionnages, polices de bio) : écartés, ils supposent un algorithme de diffusion ou sortent du périmètre (D28).

## Conséquences
### Positives
- Archive et stories à la une sans traitement planifié : l'expiration est un simple filtre.
- Avantages Plus appliqués côté serveur par la règle unique `isPlus`.
- Audience respectée partout, y compris dans les stories à la une.

### Négatives
- La table `stories` grandit sans limite ; toutes les lectures doivent filtrer `expires_at` et `deleted_at`.
- Les fichiers des stories expirées restent dans Storage tant que la story n'est pas supprimée.
- Le bandeau combine abonnements, audience, blocages et vues : requête à valider par `EXPLAIN ANALYZE` sur le seed.

## Liens
- ADR-005 (limite de publication, module `ephemeral`)
- ADR-006 (`canViewStory`, `isMutual`)
- ADR-007 (index `stories`, curseurs)
- ADR-008 (rattachement et purge des médias)
- ADR-012 (`isPlus`, `403 plus_required`)
- ADR-014 (cas limites)
- ADR-023 (réponses à une story et à une note)
