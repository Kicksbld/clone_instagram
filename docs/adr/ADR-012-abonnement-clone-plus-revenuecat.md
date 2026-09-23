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
- **L'API fait foi** pour les droits : module `billing`, table `subscriptions` (copie locale de l'état RevenueCat), écrite uniquement par le use case `RefreshSubscription`.
- `RefreshSubscription` lit le client via la **REST API v2 de RevenueCat** (clé secrète côté API, port `SubscriptionProvider`). Il est déclenché par `POST /v1/me/subscription/refresh` après un achat, une restauration et au lancement de l'app ; pas de rappel si la dernière vérification date de moins de 5 minutes.
- **Pas de webhooks RevenueCat.**
- Règle unique `isPlus(user)` = `status = active` et `expires_at > now()`. Refus : `403 plus_required`.
- Avantage P0 : icône d'app personnalisée (appliquée par l'app uniquement).
- Suppression de compte : ligne supprimée et client RevenueCat supprimé par le job de purge ; l'app rappelle que l'abonnement Apple doit être résilié par l'utilisateur.

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
- Configuration App Store Connect et sandbox longue, à lancer au début du projet ; un fichier de configuration StoreKit permet d'avancer en attendant.
- Dépendance à un service SaaS ; le dernier statut connu est conservé s'il est injoignable.

## Liens
- ADR-005 (port `SubscriptionProvider`, module `billing`)
- ADR-010 (SDK dans l'app)
- ADR-013 (variante A/B du paywall)
