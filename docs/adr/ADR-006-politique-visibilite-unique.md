# ADR-006 — Politique de visibilité unique (contenu invisible → 404)

## Statut
Proposé

## Contexte
Le blocage, le compte privé, le statut du compte (suspendu, banni) et les audiences (amis proches) concernent **toutes** les lectures : profil, posts, feed, recherche, commentaires, stories, messages.

Blocage et signalement sont des exigences App Store pour le contenu généré par les utilisateurs, et la vie privée doit être respectée dans toutes les lectures. Réécrire ces filtres dans chaque requête mène à des oublis, surtout avec du code généré par l'IA.

Décision source : D32 (compte privé en P0).

## Décision
- Une **politique unique** dans `apps/api/src/shared/domain/visibility`, appelée par chaque use case de lecture :
  - `canViewProfile(viewer, owner)` : aucun blocage dans un sens ou dans l'autre, et `owner.status = active` ;
  - `canViewContent(viewer, owner)` : `canViewProfile`, et (compte public, ou `viewer` = `owner`, ou `viewer` suit `owner`) ;
  - `canViewStory(viewer, story)` : `canViewContent`, et (audience `everyone`, ou `viewer` dans les amis proches de l'auteur) ;
  - `canMessage(sender, recipient)` : `canViewProfile` (P2 : demande de message si le destinataire ne suit pas l'expéditeur) ;
  - `isMutual(a, b)` : `a` suit `b` et `b` suit `a`.
- Aucune requête ne réimplémente ces filtres à la main. Les requêtes de liste (feed, recherche, listes d'abonnés, commentaires) traduisent la même règle en SQL, testée contre la politique.
- Un contenu invisible pour l'appelant renvoie **404**, jamais 403, pour ne pas révéler son existence.
- **Compte privé non suivi** : profil visible (en-tête, compteurs, bio), contenus invisibles. En P0, suivre un compte privé est refusé ; les demandes d'abonnement arrivent en P1 (D32).
- **Blocage** : bloquer supprime les abonnements et les demandes d'abonnement **dans les deux sens** (compteurs mis à jour dans la même transaction). Ensuite, les deux comptes sont mutuellement invisibles : profil, contenus, feed, recherche, commentaires, mentions, messages. On ne peut ni se suivre ni se bloquer soi-même.
- **Compte suspendu ou banni** : son profil et ses contenus deviennent invisibles pour les autres (`owner.status = active` requis) ; lui-même ne peut plus appeler que `GET /v1/me` et `DELETE /v1/me` (ADR-005).
- Les cas limites de visibilité (utilisateur bloqué, compte privé non suivi, compte suspendu) sont testés pour chaque lecture ajoutée ; c'est un point de la definition of done (ADR-014).

## Alternatives
- Filtres écrits dans chaque requête ou use case : pas d'abstraction, mais oublis probables, surtout avec du code généré. Non retenu.
- RLS Postgres pour la visibilité : filtrage garanti en base, mais contraire à ADR-004 (RLS n'est pas un mécanisme d'autorisation ici) et difficile à tester. Non retenu.
- Répondre 403 pour un contenu invisible : message plus explicite, mais révèle l'existence d'un compte ou d'un contenu à quelqu'un de bloqué. Non retenu.
- En P0, suivre directement un compte privé : plus simple, mais contourne le compte privé avant l'arrivée des demandes d'abonnement. Écarté par le lead dev (D32).

## Conséquences
### Positives
- Une seule règle à tester et à faire évoluer (P1 : amis proches, demandes d'abonnement).
- Blocage et compte privé respectés partout par construction.

### Négatives
- Les requêtes de liste (feed, recherche) doivent traduire la même règle en SQL : il faut vérifier que le filtrage SQL et la politique du domaine restent cohérents.
- Un appel supplémentaire dans chaque use case de lecture.

## Liens
- ADR-005 (le use case autorise, refus global pour un compte suspendu)
- ADR-007 (index `blocks` et requête du feed)
- ADR-014 (cas limites obligatoires)
