# Accessibilité iOS — navigation sans vision

Périmètre et décisions confirmés par le lead dev le 5 novembre 2026 après entretien `/grilling`.

## Problème et résultat attendu

Une personne aveugle doit pouvoir parcourir toute l’app iOS avec VoiceOver et réaliser les parcours de bout en bout, comprendre les erreurs et revenir en arrière. La présence de libellés ne suffit pas à valider ce résultat.

## Décisions

- Tous les écrans utilisateurs actuels sont inclus : connexion et onboarding, accueil, recherche, profils et abonnements, publication, commentaires, stories et archives, reels, messages et partage, activité, paramètres, modération et paywall.
- Chaque contrôle possède un nom et expose son état ; les illustrations décoratives sont masquées. Chaque carte constitue une lecture cohérente avec ses actions accessibles.
- Les descriptions alternatives sont rédigées par l’auteur, facultatives, limitées à 1 000 points de code, propres à chaque média et distinctes de la légende. Une description absente est annoncée comme telle. Aucun contenu visuel n’est inventé. Les photos de carrousel, stories et reels sont inclus ; la description vidéo est textuelle. Les descriptions des posts, reels et stories sont modifiables après publication, y compris dans les archives de stories.
- Tout geste métier possède une alternative : aimer, passer une photo ou un reel, naviguer dans les stories, mettre en pause, fermer, supprimer/signaler, déplacer et zoomer un recadrage. Une option conserve l’image entière.
- Sous VoiceOver, les stories n’avancent jamais toutes seules. Les commandes précédente/suivante et pause/reprise restent disponibles.
- Les résultats d’actions, erreurs et changements pertinents sont annoncés ; les nouveaux messages ne sont annoncés que dans la conversation ouverte. Les mises à jour ordinaires ne déplacent pas le focus. Les ouvertures/fermetures doivent permettre de reprendre la navigation au bon endroit.
- Pas de dépendance supplémentaire, ni de changement des autorisations ou des règles de visibilité. Contrat additif et compatibilité des anciennes publications/files persistées.

## Lots de réalisation

| Lot | Résultat vérifiable | Dépendance |
| --- | --- | --- |
| A — Données et publication | Descriptions par média, conservation à la reprise, restitution API et modification auteur | — |
| B — Lecture et gestes | Cartes cohérentes, actions VoiceOver, navigation médias et recadrage sans geste imposé | A |
| C — Retours et navigation | Annonces ciblées, états lisibles, fermeture des feuilles et focus utilisable | B |
| D — Recette | Tests de non-régression et scénarios écran masqué avec résultats consignés | A, B, C |

Ce découpage est local ; aucune issue GitHub n’est créée par ce document.

## Architecture et vérifications

ADR concernés : 003 contrat, 004 accès aux données, 005 hexagonal, 006 visibilité, 007 migrations, 008 médias et reprise, 010 MVVM iOS, 014 qualité, 017 génération client, 019 compatibilité, 020 synchronisation, 025 stories, 033 niveaux de tests, 037 édition et 038 onboarding.

Tests : routes avec adapters mémoire pour validation/autorisation et restitution ; adapters Drizzle sur Postgres pour persistance ; ViewModels/stores avec faux services pour descriptions, reprise et horloge. Les contrôles d’interface se vérifient en recette réelle, sans tests qui recopient les modificateurs SwiftUI.

## Recette d’acceptation sur iPhone

Activer VoiceOver puis le rideau d’écran. Sans regarder et sans aide extérieure :

1. Créer un compte, parcourir l’onboarding, se connecter, récupérer une erreur et accéder à l’accueil.
2. Lire les cartes du feed, ouvrir/refermer un profil puis retrouver sa position, suivre et rechercher un compte.
3. Lire un carrousel décrit et un ancien sans description ; changer de photo, aimer/retirer le like, commenter/répondre, supprimer, signaler et partager.
4. Choisir plusieurs photos, déplacer/zoomer le cadrage, conserver l’image entière, décrire chaque média, publier puis modifier les descriptions. Provoquer un échec réseau, relancer et vérifier la conservation des descriptions.
5. Publier une story décrite, l’explorer plus de cinq secondes sans changement automatique, changer de story, utiliser pause/reprise, répondre et fermer. Refaire avec une archive.
6. Publier/lire un reel décrit, contrôler lecture et son puis précédent/suivant, ouvrir les interactions d’amis et revenir.
7. Ouvrir une conversation, envoyer un texte et une photo, partager un contenu, recevoir un message et distinguer réception, envoi et erreur. Revenir à la liste.
8. Consulter l’activité et les demandes, modifier son profil et ses paramètres, parcourir blocage/modération, paywall et restauration, se déconnecter. Vérifier les confirmations avant toute action destructive.

Pour chaque étape : ordre de lecture logique, nom/rôle/état précis, aucune action inaccessible, aucune boucle de focus, annonces utiles sans répétitions, saisie conservée après erreur et retour au contexte d’origine. Vérifier aussi l’activation/désactivation de VoiceOver pendant une story.

**État de validation physique : à réaliser par le lead dev.** Aucun résultat sur iPhone n’est présumé par les tests automatisés.
