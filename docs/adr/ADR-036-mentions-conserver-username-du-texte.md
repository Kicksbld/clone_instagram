# ADR-036 — Mentions : conserver le username écrit dans le texte

## Statut
Proposé

## Contexte
T34 (#45) transforme un `@username` connu et visible en lien vers le profil. Un username inconnu reste du texte simple. Un compte peut déjà modifier son username. La mention conserve son identifiant de compte, mais comparer uniquement le texte au username actuel ferait disparaître son lien après un renommage. Si le nouveau username figurait déjà dans le texte sans être résolu, cette comparaison rendrait aussi cliquable une occurrence initialement inconnue.

## Décision
- Conserver `text_username` dans chaque mention de texte, en plus de `mentioned_user_id` : le username résolu à la création, normalisé en minuscules, sans arobase.
- Exposer `TextMention` dans `Post.mentions` et `Comment.mentions` : `id`, `username` actuel, `textUsername` écrit à la création et aperçu de la photo de profil.
- L'app retrouve les occurrences avec `textUsername`, puis ouvre le profil par le username actuel. Plusieurs occurrences du même username pointent vers la même mention, sans notification supplémentaire.
- La visibilité reste réévaluée à chaque lecture (ADR-006). Les usernames inconnus à la création ne deviennent pas des mentions après coup.

## Alternatives
- Comparer au username actuel seulement : aucune donnée supplémentaire, mais les liens disparaissent ou changent d'occurrence après un renommage.
- Conserver les positions de toutes les occurrences : association explicite, mais plusieurs positions à stocker pour un même compte et une convention d'indices commune à JavaScript et Swift. Le username résolu suffit pour les textes immuables de T34.

## Conséquences
### Positives
- Le compte mentionné reste associé aux occurrences résolues à la publication.
- Les occurrences initialement inconnues restent du texte simple.

### Négatives
- Une donnée supplémentaire par mention et un champ supplémentaire dans le contrat.
- T35 devra recalculer cette association lors d'une modification de légende, comme prévu par ADR-025.

## Liens
- [T34 — Mentions dans une légende ou un commentaire](https://github.com/Kicksbld/clone_instagram/issues/45)
- ADR-006 (visibilité)
- ADR-025 (extraction et recalcul des mentions)
- ADR-026 (notifications)
