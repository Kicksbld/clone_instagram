# ADR-012 — Abonnement Clone Plus : RevenueCat, statut vérifié par l'API

## Statut
Proposé

## Contexte
Un paywall est imposé en P0. Il présente l'abonnement « Clone Plus », inspiré d'Instagram Plus : abonnement mensuel en sandbox, affiché en fin d'onboarding (refusable) et depuis les paramètres, avec restauration des achats.

Certains avantages (P1 : story 48 h, vue anonyme, recherche dans les vues) sont appliqués par l'API : l'app ne peut pas faire foi, sinon un client modifié obtiendrait les avantages sans payer.

Le rafraîchissement doit fonctionner aussi en dev local, sans URL publique.

Décisions sources : D24, D25, D28.

## Décision
- **RevenueCat** gère l'achat dans l'app (SDK `purchases-ios` + StoreKit) : offres, achat, restauration, reçus. L'identifiant client RevenueCat est l'identifiant de profil ; aucun email n'est transmis.
- **L'API fait foi** pour les droits : module `billing`, table `subscriptions` — `user_id` (PK), `entitlement` (`plus`), `status` (`active` | `expired`), `product_id`, `expires_at`, `refreshed_at`, `updated_at` — copie locale de l'état RevenueCat, écrite uniquement par le use case `RefreshSubscription`. RevenueCat reste la source de vérité des achats.
- `RefreshSubscription` lit le client via la **REST API v2 de RevenueCat** (`GET /projects/{project_id}/customers/{customer_id}/subscriptions`, vérifié en T10 : `gives_access`, fin de période en millisecondes, entitlements avec leur `lookup_key` ; clé secrète côté serveur, port `SubscriptionProvider`, adapter `fetch` sans SDK serveur). Il est déclenché par `POST /v1/me/subscription/refresh` → `{ plan, expiresAt }`, après un achat, une restauration et au lancement de l'app. Pas d'appel à RevenueCat si l'abonnement enregistré donne `plus` et que `refreshed_at` date de moins de 5 minutes ; un compte `free` est toujours relu, sinon un achat fait juste après le rafraîchissement du lancement ne serait vu qu'au bout de 5 minutes (précisé en T10). Si RevenueCat est injoignable, le dernier statut connu est conservé.
- `GET /v1/me` renvoie aussi `plan` (`free` | `plus`) et `plusExpiresAt`.
- **Pas de webhooks RevenueCat.**
- Règle unique `isPlus(user)` = `status = active` et `expires_at > now()`, dans le module `billing`. Tout avantage côté API passe par elle. Refus : `403 plus_required`. Un avantage acquis reste acquis (une story publiée à 48 h garde sa durée si l'abonnement expire ensuite).
- **Avantages** : icône d'app personnalisée en P0 (appliquée par l'app uniquement, `setAlternateIconName`, choix dans Paramètres > Clone Plus) ; en P1, détaillés dans ADR-025 :
  - **story 48 h** : `expires_at` fixé à + 48 h au lieu de + 24 h si `isPlus` à la publication (`CreateStory`) ;
  - **vue anonyme** : `POST /v1/stories/{id}/view` `{ anonymous: true }`, aucune vue enregistrée (`ViewStory`) ;
  - **recherche dans la liste des vues** : `GET /v1/stories/{id}/viewers?q=` (`ListStoryViewers`).

  Sans abonnement actif, la vue anonyme et la recherche répondent `403 plus_required` ; la story est publiée à 24 h, sans erreur. Avantages limités à ces 4 (D28) : la mise en avant d'une story (suppose un algorithme de diffusion), les listes d'audience personnalisées, le compteur de revisionnages et les polices de bio sont écartés.
- **Côté app** (`Core/Billing`, feature `Paywall`) :
  - `Purchases.logIn(profileId)` juste après la création du profil ; déconnexion RevenueCat à la déconnexion de l'app ;
  - paywall SwiftUI maison, fidèle au style Instagram, alimenté par les offres RevenueCat (prix localisés fournis par StoreKit) ; affiché en fin d'onboarding (bouton « Plus tard ») et depuis Paramètres > Clone Plus ;
  - boutons **Restaurer les achats** et **Gérer l'abonnement** (exigences App Store) ;
  - l'interface ne débloque un avantage que selon le `plan` renvoyé par l'API ; le statut du SDK ne sert qu'à l'affichage ;
  - fichier de configuration StoreKit pour tester dans le simulateur sans App Store Connect.
- **Suppression de compte** : ligne supprimée et client RevenueCat supprimé par le job `purge-account` (ADR-008) ; l'app rappelle avant la suppression que l'abonnement Apple doit être résilié par l'utilisateur.
- En test, `SubscriptionProvider` est remplacé par un adapter en mémoire : aucun appel à RevenueCat.

## Alternatives
- StoreKit 2 seul : pas de dépendance SaaS, mais offres codées en dur, et restauration et vérification des reçus à écrire à la main. Écarté (D24).
- Faire confiance au statut renvoyé par le SDK dans l'app : aucun appel serveur, mais avantages contournables. Écarté (D25).
- Webhooks RevenueCat : statut toujours à jour, mais nécessite une URL publique, donc ne fonctionne pas en dev local. Écarté (D25), possible plus tard sur la démo.

## Conséquences
### Positives
- Avantages protégés côté serveur ; offres configurables sans nouvelle version de l'app.
- Fonctionne à l'identique en local et en démo.
- Tests sans appel réel grâce à un adapter en mémoire.

### Négatives
- Statut potentiellement désynchronisé entre deux rafraîchissements (renouvellement, résiliation) ; `expires_at` coupe tout de même les avantages.
- Configuration App Store Connect et sandbox longue (produit, contrat, compte de test), à lancer au début du projet ; le fichier de configuration StoreKit permet d'avancer en attendant.
- Dépendance à un service SaaS.
- Supprimer un compte ne résilie pas l'abonnement Apple (limite assumée).

## Liens
- ADR-005 (port `SubscriptionProvider`, module `billing`)
- ADR-008 (job `purge-account`)
- ADR-010 (SDK dans l'app)
- ADR-013 (variante A/B du paywall)
- ADR-025 (avantages appliqués aux stories)
