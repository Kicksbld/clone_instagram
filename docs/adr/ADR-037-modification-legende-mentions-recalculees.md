# ADR-037 — Modification d'une légende : mentions recalculées par username écrit

## Statut
Proposé

## Contexte
T35 (#46) permet à l'auteur de modifier la légende d'un post ou d'un reel (`PATCH /v1/posts/{id}`). ADR-025 impose de recalculer les mentions dans la même transaction : les nouvelles sont créées et notifiées, les retirées sont supprimées avec leur notification. ADR-036 conserve `text_username`, le username écrit à la création, pour qu'un compte renommé reste associé à son occurrence dans le texte, et annonce que T35 devra recalculer cette association.

Résoudre à nouveau tous les `@username` de la légende modifiée ne suffit pas : après un renommage, l'ancien username écrit ne correspond plus à aucun compte, et la mention disparaîtrait à la première retouche de la légende, avec sa notification. À l'inverse, un compte renommé que l'auteur réécrit sous son nouveau username est toujours la même personne mentionnée.

## Décision
À la modification d'une légende, dans la transaction de `UpdatePostCaption`, par `writeTextMentions` (`shared/application`) :
- **Mention conservée** : une mention existante dont le `text_username` figure encore dans la nouvelle légende reste telle quelle, sans nouvelle résolution ni nouvelle notification. Sa visibilité reste réévaluée à chaque lecture (ADR-006).
- **Mention réécrite** : un compte déjà mentionné, retrouvé sous un autre username écrit (après un renommage), garde sa mention avec le nouveau `text_username`, sans retrait ni nouvelle notification.
- **Nouvelle mention** : un username écrit qui ne correspond à aucune mention existante est résolu avec les mêmes règles qu'à la création (`canViewProfile`, notification seulement si `canViewContent`, ADR-025, ADR-026).
- **Mention retirée** : les autres mentions existantes sont supprimées, avec leur notification `mention` (`NotificationWriter.retract`).
- **Côté app** : la modification attend la réponse de l'API (texte validé par le serveur, ADR-020) ; la légende et les mentions renvoyées sont partagées par `PostEditStore` (`Core/Posts`) entre le feed, le détail et les Reels ; une lecture de l'API les remplace.

## Alternatives
- Résoudre de nouveau tous les usernames de la légende modifiée : plus simple, mais une mention d'un compte renommé disparaît à la première retouche, contrairement à ADR-036. Non retenu.
- Ne recalculer les mentions que si la liste des usernames écrits change : moins d'écritures, mais une légende réécrite avec le nouveau username d'un compte renommé créerait une seconde notification pour la même personne. Non retenu.

## Conséquences
### Positives
- Une retouche de légende ne fait ni disparaître ni renotifier une mention qui n'a pas changé.
- Même fonction et mêmes règles pour la création d'un post, d'un commentaire et la modification d'une légende.

### Négatives
- Une mention conservée n'est pas revérifiée par `canViewProfile` au moment de la modification : un compte devenu invisible pour l'auteur garde sa mention, masquée seulement à la lecture.
- Une logique de comparaison de plus dans `writeTextMentions`.

## Liens
- [T35 — Je modifie la légende de mon post](https://github.com/Kicksbld/clone_instagram/issues/46)
- ADR-006 (visibilité à la lecture)
- ADR-020 (actions qui attendent l'API)
- ADR-025 (mentions recalculées à la modification)
- ADR-026 (notification `mention` et son retrait)
- ADR-036 (`text_username`)
