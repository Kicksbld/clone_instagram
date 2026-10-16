# ADR-020 — Mises à jour optimistes : modèle commun à toute l'app iOS

## Statut
Accepté

## Contexte
ADR-010 limite les mises à jour optimistes au like, à l'enregistrement et au follow. Dans l'app, beaucoup d'actions attendent encore la réponse de l'API avant de changer l'écran : l'interrupteur « Compte privé » est grisé pendant l'appel, le bouton Suivre est désactivé, un compte bloqué ne disparaît qu'une fois le blocage confirmé, un post supprimé reste affiché avec un spinner.

Chaque écran a aussi sa propre variante : seul `LikeSynchronizer` gère les taps rapides (le dernier choix gagne) et partage l'état entre écrans. Ailleurs, un second tap pendant un appel est ignoré, et un follow fait depuis une liste ne se voit pas sur le profil ouvert derrière.

Contraintes : l'API reste la source de vérité (ADR-004), les erreurs sont compréhensibles avec possibilité de réessayer (ADR-010), et les écrans restent en wireframe, composants système uniquement.

## Décision
- **Actions optimistes** (l'écran change tout de suite, l'API confirme ensuite) : like, enregistrement (P1), suivre et ne plus suivre, compte privé ou public, bloquer et débloquer, supprimer un post, publier et supprimer un commentaire, photo de profil (image locale affichée pendant l'envoi).
- **Actions qui attendent l'API** (spinner, bouton désactivé) : signalement, modification du nom, du username et de la bio (validés par le serveur), achat et restauration, connexion et inscription, suppression du compte.
- **Modèle commun** dans `Core/Optimistic`, repris de l'algorithme de `LikeSynchronizer`, par clé (identifiant du post, du compte…) :
  - un dernier état confirmé par l'API et un état voulu ;
  - l'état voulu est affiché immédiatement ;
  - un seul appel en cours par clé ; un tap pendant l'appel ne change que l'état voulu, renvoyé à la fin de l'appel s'il diffère de l'état confirmé (le dernier choix gagne) ;
  - la réponse de l'API devient l'état confirmé ; un échec ramène à l'état confirmé ; un `404` retire le contenu de l'écran ;
  - une lecture de l'API (chargement, rafraîchissement) ne remplace pas l'état d'une clé dont un appel est en cours.
- **Partage entre écrans** : l'état vit dans un store de `Core` par type d'action (`LikeSynchronizer`, `FollowStore`, `BlockStore`…), une instance pour l'app, injectée dans les ViewModels et vidée à la déconnexion. Les écrans affichent leurs données à travers ce store, comme `LikeSynchronizer.displayed(_:)`.
- **Boutons** : jamais désactivés ni remplacés par un spinner pendant un appel optimiste.
- **Échec** : retour à l'état confirmé et alerte système avec un message compréhensible.
- **Tests** (Swift Testing, faux services) pour chaque action optimiste : changement immédiat, taps rapides, échec et retour arrière, `404`, lecture de l'API pendant un appel.

## Alternatives
- Amender ADR-010 : plus court, mais ADR-010 grossit et l'historique de la décision se perd. Non retenu par le lead dev.
- Laisser chaque écran gérer sa variante : pas de refactorisation, mais comportements différents d'un écran à l'autre et taps rapides mal gérés. Non retenu.
- Blocage non optimiste : l'action n'est montrée qu'une fois enregistrée, mais l'attente est visible. Non retenu par le lead dev.
- Signalement optimiste (« Merci » immédiat, envoi en arrière-plan) : plus fluide, mais un signalement perdu en silence si la feuille est fermée. Non retenu par le lead dev.
- Retour arrière silencieux en cas d'échec : plus fluide, mais l'utilisateur ne comprend pas pourquoi son action est annulée. Non retenu par le lead dev.

## Conséquences
### Positives
- L'app réagit immédiatement à chaque action courante, comme Instagram.
- Un seul comportement, testé une fois, pour les taps rapides, les échecs et le partage entre écrans.
- Un état changé sur un écran se voit sur tous les autres.

### Négatives
- Refactorisation de `LikeSynchronizer` et des ViewModels concernés, avec un risque de régression sur les likes.
- En cas d'échec, l'écran montre brièvement un état faux (par exemple un compte qui paraît bloqué), corrigé par le retour arrière et l'alerte.
- Un store de plus dans `Core` par type d'action partagée.

## Liens
- ADR-004 (l'API est la source de vérité)
- ADR-010 (MVVM, services injectés, erreurs)
- ADR-014 (tests des mises à jour optimistes et du retour arrière)
