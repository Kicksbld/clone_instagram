# 01 — Contexte et périmètre

## 1. Contexte

Projet réalisé dans le cadre d'un cours. Objectif pédagogique double :

1. **Reproduire au plus proche l'app iOS d'Instagram**, avec son backend et un backoffice.
2. **Apprendre à bien développer avec l'IA** (« vibe coding » maîtrisé) : conventions explicites, contrat d'API, garde-fous automatiques.

## 2. Contraintes


| Contrainte             | Valeur                            | Conséquence                                                                       |
| ---------------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| Équipe                 | 1 développeur + IA                | Architecture simple et homogène, peu de dépendances                               |
| Délai                  | 8 jours                           | Périmètre découpé en phases de priorité ; chaque feature a une version simplifiée ; P0 est l'objectif, P1 à P3 ne sont faits que s'il reste du temps |
| Plateforme             | iOS uniquement                    | SwiftUI natif, pas de cross-platform                                              |
| Exécution              | Dev en local, démo hébergée       | Supabase Cloud, Railway (API, worker, Redis), Vercel (backoffice) ; démo sur iPhone physique, en HTTPS, depuis n'importe quel réseau |
| Compte Apple Developer | Payant                            | Sign in with Apple et notifications push possibles                                |
| UI                     | Instagram « réinterprété iOS 27 » | Structure et interactions d'Instagram, composants système Liquid Glass            |
| Fonctionnalités imposées | Onboarding, paywall (RevenueCat), analytics, A/B test | Intégrées en P0 ; RevenueCat et PostHog Cloud sont des services SaaS |




## 3. Méthode de livraison

- Développement par **tranches verticales** : chaque feature est livrée de bout en bout (contrat → backend → app → backoffice si concerné) avant de passer à la suivante.
- Les phases se suivent dans l'ordre de priorité. **Une phase n'est commencée que lorsque la précédente est fonctionnelle et testée.**
- La dernière partie du temps disponible est réservée à la stabilisation (finitions, tests, corrections), pas à de nouvelles features.



## 4. Périmètre par priorité



### P0 — Socle (indispensable)

**Fondations**

- Monorepo, contrat OpenAPI, squelettes des 3 produits, CI, environnement local.
- **Environnement de démo déployé dès le début** (squelette sur Supabase Cloud, Railway et Vercel), puis mis à jour à chaque tranche.
- Pipeline média pour les **images** (upload présigné, traitement, variantes).

**Compte et profil**

- Inscription / connexion : email + mot de passe, **Sign in with Apple**.
- **Onboarding (obligatoire)** : parcours reproduit sur celui d'Instagram, un écran par étape (identifiant, mot de passe, nom, username vérifié en direct, photo de profil passable, bio passable), suivi du paywall. Parcours exact à aligner sur l'app Instagram actuelle analysée.
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

**Monétisation, analytics et A/B test (obligatoires)**

- **Paywall « Clone Plus »** via RevenueCat, inspiré d'Instagram Plus : abonnement mensuel en environnement sandbox, affiché en fin d'onboarding (refusable) et accessible depuis les paramètres, avec restauration des achats. Avantages repris d'Instagram Plus (voir 03 § 4.13) : icône d'app personnalisée (P0), puis stories 48 h, vue anonyme d'une story et recherche dans la liste des vues (P1, avec les stories).
- Statut d'abonnement vérifié **côté serveur** : l'API interroge RevenueCat, l'app ne fait pas foi.
- **Analytics** via PostHog : événements de l'onboarding, du paywall et des actions principales (post, like, abonnement).
- **A/B test** via les expériences PostHog : première expérience sur le paywall (variante d'offre ou de présentation), mesurée sur la conversion vers l'achat.

**Backoffice**

- Connexion admin.
- File de modération : consulter un signalement, supprimer le contenu ou classer le signalement.
- Gestion des utilisateurs : recherche, fiche (dont statut d'abonnement), suspension, bannissement, suppression.
- **Page Analytics** : entonnoir onboarding → paywall → achat, résultats de l'A/B test, nombre d'abonnés Plus actifs.



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
- Mise en production réelle : montée en charge multi-instance, CDN, supervision. L'environnement de démo reste une instance unique.



## 6. Exigences non fonctionnelles


| Domaine       | Exigence                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Sécurité      | Aucune donnée accessible sans passer par l'API ; secrets jamais versionnés ; métadonnées EXIF (dont GPS) supprimées des images |
| Vie privée    | Blocage et compte privé respectés dans **toutes** les lectures ; suppression de compte réelle (données et fichiers)            |
| Analytics     | Utilisateur identifié par son identifiant de profil uniquement (ni email, ni nom, ni contenu dans les événements) ; suppression de compte propagée à PostHog et RevenueCat |
| Performance   | Scroll du feed fluide sur iPhone récent ; images servies à la taille d'affichage ; pagination par curseur                      |
| Fiabilité     | Upload qui survit à la mise en arrière-plan de l'app ; reprise des messages manqués après reconnexion                          |
| Qualité       | Lint, typage et tests verts avant chaque intégration (voir 08)                                                                 |
| Accessibilité | Dynamic Type et libellés VoiceOver sur les écrans P0                                                                           |


