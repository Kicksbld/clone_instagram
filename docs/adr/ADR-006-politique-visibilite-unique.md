# ADR-006 — Politique de visibilité unique (contenu invisible → 404)

## Statut
Proposé

## Contexte
Le blocage, le compte privé, le statut du compte (suspendu, banni) et les audiences (amis proches) concernent **toutes** les lectures : profil, posts, feed, recherche, commentaires, stories, messages.

Blocage et signalement sont des exigences App Store pour le contenu généré par les utilisateurs, et la vie privée doit être respectée dans toutes les lectures (`01` § 6). Réécrire ces filtres dans chaque requête mène à des oublis ; c'est un risque identifié dans `09` § 2.

## Décision
- Une **politique unique** dans `apps/api/src/shared/domain/visibility`, appelée par chaque use case de lecture :
  - `canViewProfile(viewer, owner)` : aucun blocage dans un sens ou dans l'autre, et `owner.status = active` ;
  - `canViewContent(viewer, owner)` : `canViewProfile`, et (compte public, ou `viewer` = `owner`, ou `viewer` suit `owner`) ;
  - `canViewStory(viewer, story)` : `canViewContent`, et (audience `everyone`, ou `viewer` dans les amis proches) ;
  - `canMessage(sender, recipient)` : `canViewProfile` ;
  - `isMutual(a, b)` : abonnement réciproque.
- Aucune requête ne réimplémente ces filtres à la main.
- Un contenu invisible pour l'appelant renvoie **404**, jamais 403, pour ne pas révéler son existence.
- Les cas limites de `06` § 7 (utilisateur bloqué, compte privé non suivi, compte suspendu…) sont testés pour chaque lecture ajoutée ; c'est un point de la definition of done.

## Alternatives
- Filtres écrits dans chaque requête ou use case : pas d'abstraction, mais oublis probables, surtout avec du code généré. Non retenu.
- RLS Postgres pour la visibilité : filtrage garanti en base, mais contraire à ADR-004 (RLS n'est pas un mécanisme d'autorisation ici) et difficile à tester. Non retenu.
- Répondre 403 pour un contenu invisible : message plus explicite, mais révèle l'existence d'un compte ou d'un contenu à quelqu'un de bloqué. Non retenu.

## Conséquences
### Positives
- Une seule règle à tester et à faire évoluer (P1 : amis proches, demandes d'abonnement).
- Blocage et compte privé respectés partout par construction.

### Négatives
- Les requêtes de liste (feed, recherche) doivent traduire la même règle en SQL : il faut vérifier que le filtrage SQL et la politique du domaine restent cohérents.
- Un appel supplémentaire dans chaque use case de lecture.

## Liens
- ADR-005 (le use case autorise)
- ADR-007 (index `blocks` et requête du feed)
