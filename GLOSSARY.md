# Clone Instagram

Vocabulaire du produit : un clone d'Instagram (app iOS, API, backoffice). Un seul contexte pour tout le monorepo.

## Comptes

**Compte** :
Une personne inscrite, identifiée par son profil. Son statut est actif, suspendu, banni ou supprimé.
_À éviter_ : utilisateur (dans les règles métier), user account
Code : `profile`

**Compte privé** :
Compte dont les contenus ne sont visibles que de ses abonnés ; son profil (en-tête, compteurs, bio) reste visible.
_À éviter_ : compte protégé, compte fermé

**Compte suspendu** / **Compte banni** :
Compte sanctionné par un admin : invisible des autres, il ne peut plus que consulter son compte et le supprimer.
_À éviter_ : compte désactivé

**Admin** :
Personne autorisée à utiliser le backoffice ; elle n'a pas besoin de compte dans l'app.
_À éviter_ : modérateur, super-utilisateur

## Relations

**Abonnement** :
Lien par lequel un compte suit un autre compte et voit ses contenus dans son feed.
_À éviter_ : follow (en français), amitié
Code : `follow`

**Abonné** :
Compte qui suit un autre compte. Le compte suivi est un **suivi**.
_À éviter_ : follower (en français), fan

**Demande d'abonnement** :
Demande en attente pour suivre un compte privé ; elle ne donne aucun accès tant qu'elle n'est pas acceptée.
_À éviter_ : invitation, requête de suivi
Code : `follow request`

**Abonnés mutuels** :
Deux comptes qui se suivent l'un l'autre ; chacun est l'**ami** de l'autre.
_À éviter_ : contacts, amis proches (liste distincte)

**Ami** :
Abonné mutuel. Seul sens du mot « ami » dans le produit, à ne pas confondre avec les amis proches.
_À éviter_ : contact, abonné (seul)

**Amis proches** :
Liste privée de comptes choisis par un compte, qui seuls voient ses contenus réservés aux amis proches.
_À éviter_ : meilleurs amis, favoris
Code : `close friends`

**Blocage** :
Action qui rend deux comptes mutuellement invisibles et supprime leurs abonnements dans les deux sens.
_À éviter_ : masquer, restreindre (hors périmètre)
Code : `block`

**Visibilité** :
Règle unique qui dit si un compte peut voir un profil, un contenu, une story ou écrire à quelqu'un. Un contenu invisible est traité comme inexistant.
_À éviter_ : permissions, droits d'accès

## Contenus

**Post** :
Publication permanente d'un compte : une photo ou un carrousel de photos, ou un reel, avec une légende.
_À éviter_ : publication (dans le code), article

**Carrousel** :
Post de 2 à 10 photos, toutes au ratio de la première.
_À éviter_ : album, galerie

**Reel** :
Post vidéo vertical de 60 secondes au plus.
_À éviter_ : vidéo (seul), clip

**Légende** :
Texte d'un post.
_À éviter_ : description, caption (en français)
Code : `caption`

**Média** :
Fichier envoyé par un compte (photo ou vidéo), traité par le serveur avant d'être utilisable. Il n'est rattaché qu'à un seul contenu.
_À éviter_ : pièce jointe, asset

**Story** :
Photo publiée pour une durée limitée (24 h, 48 h pour un abonné Plus), avec une audience.
_À éviter_ : statut, histoire

**Story active** :
Story ni expirée ni supprimée, visible de son audience.

**Story archivée** :
Story expirée, que seul son auteur voit encore dans son archive.
_À éviter_ : story supprimée, story expirée (pour l'archive)

**Audience** :
Qui peut voir une story ou une note : tout le monde (ses abonnés, ou tous si le compte est public), amis proches, abonnés mutuels.
_À éviter_ : portée, visibilité (réservé à la règle de visibilité)

**Vue** :
Le fait qu'un compte ait regardé une story ; une seule par compte et par story.
_À éviter_ : lecture, impression

**Vue anonyme** :
Avantage Plus : regarder une story sans laisser de vue.

**Story à la une** :
Sélection permanente de stories d'un compte, affichée sur son profil.
_À éviter_ : highlight (en français), favoris
Code : `highlight`

**Note** :
Texte de 60 caractères au plus, visible 24 h en haut de la messagerie des abonnés mutuels ou des amis proches.
_À éviter_ : statut, humeur

**Republication** :
Partage d'un post d'un autre compte vers ses propres abonnés, sans créer de nouveau post.
_À éviter_ : repartage, retweet
Code : `repost`

## Interactions

**J'aime** :
Marque d'appréciation d'un compte sur un post ou un commentaire, une seule par compte.
_À éviter_ : réaction, cœur
Code : `like`

**Commentaire** :
Texte publié sous un post. Une **réponse** est un commentaire à un commentaire, sur un seul niveau.
_À éviter_ : sous-commentaire, fil

**Mention** :
Désignation d'un compte dans une légende, un commentaire (`@username`) ou une story, qui le prévient.
_À éviter_ : tag, identification (réservé à l'identification sur une photo, P2)

**Enregistrement** :
Post mis de côté par un compte dans sa liste privée.
_À éviter_ : favori, signet
Code : `save`

**Signalement** :
Demande faite par un compte pour qu'un admin examine un compte, un post ou un commentaire.
_À éviter_ : plainte, report (en français)

## Messagerie

**Conversation** :
Échange privé entre exactement deux comptes ; il n'en existe qu'une par paire.
_À éviter_ : discussion, chat, fil

**Message** :
Élément d'une conversation : texte, photo, partage de post, réponse à une story ou à une note.
_À éviter_ : DM (dans les règles métier)

**Vu** :
Indication, pour l'expéditeur, que l'autre membre a lu la conversation jusqu'à ce message.
_À éviter_ : lu, accusé de lecture

**Demande de message** :
Conversation ouverte par un compte que le destinataire ne suit pas, rangée à part jusqu'à son acceptation (P2).
_À éviter_ : message en attente, spam

**Contenu indisponible** :
Contenu partagé dans un message qui a été supprimé, a expiré ou n'est plus visible du lecteur.

## Activité

**Activité** :
Liste des notifications d'un compte, dans l'app.
_À éviter_ : notifications (pour l'écran), centre de notifications

**Notification** :
Avis adressé à un compte quand un autre agit sur lui ou sur ses contenus ; elle disparaît si l'action est annulée.
_À éviter_ : alerte, événement

**Push** :
Notification envoyée par Apple sur l'iPhone, même app fermée (P2).
_À éviter_ : notification (seul), alerte

## Monétisation

**Clone Plus** :
Abonnement mensuel qui donne des avantages : icône d'app, story de 48 h, vue anonyme, recherche dans la liste des vues.
_À éviter_ : premium, pro, Instagram Plus
Code : `plan = plus`

**Avantage acquis** :
Avantage Plus déjà appliqué à un contenu (story de 48 h), conservé même si l'abonnement expire ensuite.

## Fils

**Feed** :
Fil d'accueil chronologique des posts et reels des comptes suivis et de soi-même.
_À éviter_ : timeline, fil d'actualité

**Onglet Reels** :
Fil plein écran des reels, avec deux sous-onglets : « Reels » (comptes publics et suivis, chronologique) et l'onglet Amis.
_À éviter_ : explorer (page distincte, P2)

**Onglet Amis** :
Sous-onglet des Reels qui montre les reels ayant reçu une interaction d'ami, chacun une seule fois.
_À éviter_ : fil des amis, onglet social

**Interaction d'ami** :
Création, J'aime, commentaire (ou republication, P2) d'un reel par un ami, montrée dans l'onglet Amis.
_À éviter_ : activité (réservé à la liste des notifications), engagement

**Bandeau** :
Rangée des comptes ayant une story active, en haut du feed.
_À éviter_ : tray (en français), carrousel de stories
Code : `tray`
