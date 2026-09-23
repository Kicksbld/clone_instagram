# ADR-012 — Abonnement Clone Plus : RevenueCat, statut vérifié par l'API

## Statut
Proposé

## Contexte
Un paywall est imposé en P0. Il présente l'abonnement « Clone Plus », inspiré d'Instagram Plus : abonnement mensuel en sandbox, affiché en fin d'onboarding (refusable) et depuis les paramètres, avec restauration des achats.

Certains avantages (P1 : story 48 h, vue anonyme, recherche dans les vues) sont appliqués par l'API : l'app ne peut pas faire foi, sinon un client modifié obtiendrait les avantages sans payer.

Le rafraîchissement doit fonctionner aussi en dev local, sans URL publique.

Décisions sources : D24, D25.

## Décision
- **RevenueCat** gère l'achat dans l'app (SDK `purchases-ios` + StoreKit) : offres, achat, restauration, reçus. L'identifiant client RevenueCat est l'identifiant de profil ; aucun email n'est transmis.
- **L'API fait foi** pour les droits : module `billing`, table `subscriptions` — `user_id` (PK), `entitlement` (`plus`), `status` (`active` | `expired`), `product_id`, `expires_at`, `refreshed_at`, `updated_at` — copie locale de l'état RevenueCat, écrite uniquement par le use case `RefreshSubscription`. RevenueCat reste la source de vérité des achats.
- `RefreshSubscription` lit le client via la **REST API v2 de RevenueCat** (`GET /projects/{project_id}/customers/{customer_id}`, endpoint exact à vérifier au démarrage ; clé secrète côté serveur, port `SubscriptionProvider`, adapter `fetch` sans SDK serveur). Il est déclenché par `POST /v1/me/subscription/refresh` → `{ plan, expiresAt }`, après un achat, une restauration et au lancement de l'app. Pas d'appel à RevenueCat si `refreshed_at` date de moins de 5 minutes. Si RevenueCat est injoignable, le dernier statut connu est conservé.
- `GET /v1/me` renvoie aussi `plan` (`free` | `plus`) et `plusExpiresAt`.
- **Pas de webhooks RevenueCat.**
- Règle unique `isPlus(user)` = `status = active` et `expires_at > now()`, dans le module `billing`. Tout avantage côté API passe par elle. Refus : `403 plus_required`. Un avantage acquis reste acquis (une story publiée à 48 h garde sa durée si l'abonnement expire ensuite).
- **Avantages** : icône d'app personnalisée en P0 (appliquée par l'app uniquement, `setAlternateIconName`, choix dans Paramètres > Clone Plus) ; story 48 h, vue anonyme et recherche dans les vues en P1 (ADR à rédiger, D28).
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
