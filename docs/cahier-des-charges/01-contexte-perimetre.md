# 01 — Contexte et périmètre

## 1. Contexte

Projet réalisé dans le cadre d'un cours. Objectif pédagogique double :

1. **Reproduire au plus proche l'app iOS d'Instagram**, avec son backend et un backoffice.
2. **Apprendre à bien développer avec l'IA** (« vibe coding » maîtrisé) : conventions explicites, contrat d'API, garde-fous automatiques.

## 2. Contraintes


| Contrainte             | Valeur                            | Conséquence                                                                       |
| ---------------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| Équipe                 | 1 développeur + IA                | Architecture simple et homogène, peu de dépendances                               |
| Délai                  | Moins de 4 semaines               | Périmètre découpé en phases de priorité ; chaque feature a une version simplifiée |
| Plateforme             | iOS uniquement                    | SwiftUI natif, pas de cross-platform                                              |
| Exécution              | Local uniquement                  | Pas de déploiement cloud ; démo sur iPhone physique via le réseau local           |
| Compte Apple Developer | Payant                            | Sign in with Apple et notifications push possibles                                |
| UI                     | Instagram « réinterprété iOS 27 » | Structure et interactions d'Instagram, composants système Liquid Glass            |




## 3. Méthode de livraison

- Développement par **tranches verticales** : chaque feature est livrée de bout en bout (contrat → backend → app → backoffice si concerné) avant de passer à la suivante.
- Les phases se suivent dans l'ordre de priorité. **Une phase n'est commencée que lorsque la précédente est fonctionnelle et testée.**
- La dernière partie du temps disponible est réservée à la stabilisation (finitions, tests, corrections), pas à de nouvelles features.



## 4. Périmètre par priorité



### P0 — Socle (indispensable)

**Fondations**

- Monorepo, contrat OpenAPI, squelettes des 3 produits, CI, environnement local.
- Pipeline média pour les **images** (upload présigné, traitement, variantes).

**Compte et profil**

- Inscription / connexion : email + mot de passe, **Sign in with Apple**.
- Onboarding : choix du username, nom, avatar, bio.
- Profil : en-tête (avatar, compteurs, bio), grille des posts.
- Paramètres de base : compte privé / public, liste des comptes bloqués.
- **Suppression du compte depuis l'app** (exigence App Store).
- Statut de compte (actif / suspendu / banni), appliqué par l'API.

**Social**

- Abonnement / désabonnement.
- Recherche d'utilisateurs par username / nom.
- **Blocage** et **signalement** (exigences App Store pour le contenu généré par les utilisateurs).

**Publication et engagement**

- Post photo, simple ou **carrousel** (jusqu'à 10 médias), avec légende.
- Feed d'accueil chronologique (comptes suivis + soi-même), pagination par curseur.
- Like / unlike d'un post.
- Commentaires avec **réponses sur un niveau**, suppression de ses propres commentaires.

**Backoffice**

- Connexion admin.
- File de modération : consulter un signalement, supprimer le contenu ou classer le signalement.
- Gestion des utilisateurs : recherche, fiche, suspension, bannissement, suppression.



### P1 — Fonctionnalités majeures

- **Demandes d'abonnement** pour les comptes privés (accepter / refuser).
- **Amis proches** (liste gérée dans les paramètres).
- **Stories** photo : audience « tout le monde » ou « amis proches », expiration 24 h, viewer plein écran, **liste des vues**, archivage automatique.
- **Messages privés** : conversations en tête-à-tête, texte et image, partage de post, réponse à une story, temps réel.
- **Reels** : vidéo verticale ≤ 60 s, pipeline HLS, onglet Reels (reels publics récents, chronologique).
- **Enregistrer** un post (liste unique, sans collections).
- **Mentions** `@username` dans légendes, commentaires et stories.
- **Activité** : notifications in-app (likes, commentaires, abonnements, mentions…), regroupées à l'affichage.
- Likes de commentaires.
- Backoffice : consultation et suppression directe de contenus, **journal d'audit**, tableau de bord avec compteurs simples.



### P2 — Fonctionnalités secondaires

- **Stories à la une** (highlights) à partir des stories archivées.
- **Notes** : texte ≤ 60 caractères, 24 h, audience abonnés mutuels ou amis proches.
- **Republication** d'un post / reel (onglet dédié sur le profil, présence dans le feed).
- **Collaboration** : coauteurs invités sur un post, visible sur les profils de chacun après acceptation.
- Identification d'utilisateurs sur une photo.
- **Demandes de message** (DM venant de comptes non suivis).
- Collections d'enregistrements.
- Page Explorer (grille des posts publics récents).
- **Notifications push** (APNs, environnement sandbox).
- Backoffice : statistiques plus riches, suivi et relance des jobs médias en échec.



### P3 — Bonus

- **Instantanés (Instants)** : voir la spécification dans [03-entites-metier.md](03-entites-metier.md#49-instants-p3).



## 5. Hors périmètre

Ces fonctionnalités d'Instagram seront développées si la deadline n'est pas encore atteinte :

- Algorithme de recommandation (tous les fils sont chronologiques).
- Filtres photo, effets AR, stickers, musique, texte sur les stories.
- Stories vidéo (les stories sont photo uniquement).
- Live, appels audio / vidéo, messages vocaux.
- Conversations de groupe, réactions aux messages (sauf réaction emoji aux instants en P3).
- Shopping, publicités, comptes professionnels, statistiques créateur.
- « Restreindre » et « Masquer » (seul le blocage est implémenté).
- Déploiement en production, montée en charge multi-instance, CDN.



## 6. Exigences non fonctionnelles


| Domaine       | Exigence                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Sécurité      | Aucune donnée accessible sans passer par l'API ; secrets jamais versionnés ; métadonnées EXIF (dont GPS) supprimées des images |
| Vie privée    | Blocage et compte privé respectés dans **toutes** les lectures ; suppression de compte réelle (données et fichiers)            |
| Performance   | Scroll du feed fluide sur iPhone récent ; images servies à la taille d'affichage ; pagination par curseur                      |
| Fiabilité     | Upload qui survit à la mise en arrière-plan de l'app ; reprise des messages manqués après reconnexion                          |
| Qualité       | Lint, typage et tests verts avant chaque intégration (voir 08)                                                                 |
| Accessibilité | Dynamic Type et libellés VoiceOver sur les écrans P0                                                                           |


