# ADR-013 — Analytics et A/B test avec PostHog, backoffice passant par l'API

## Statut
Proposé

## Contexte
Les analytics et un A/B test sont imposés en P0 : événements de l'onboarding, du paywall et des actions principales, et une première expérience sur le paywall mesurée sur la conversion vers l'achat. Le backoffice doit afficher l'entonnoir onboarding → paywall → achat, les résultats de l'A/B test et le nombre d'abonnés Plus actifs.

Contraintes : aucune donnée personnelle dans les événements, analytics jamais bloquants, le backoffice reste un client de l'API (ADR-011), et un auto-hébergement est trop lourd à mettre en place.

Décisions sources : D26, D27.

## Décision
- **PostHog Cloud** (région UE de préférence) pour les événements, les feature flags et les expériences.
- **Règles** : `distinct_id` = identifiant de profil ; événements `objet_action` en `snake_case` au passé ; aucune donnée personnelle dans les propriétés (ni email, ni nom, ni contenu). Un échec d'envoi n'est jamais bloquant.
- **Événements** :

| Source | Événements |
|---|---|
| App (`posthog-ios`) | `onboarding_step_completed { step }` à chaque étape de l'onboarding, `paywall_viewed`, `purchase_started`, `purchase_completed`, `purchase_cancelled`, actions principales (post, like, abonnement) |
| API (port `AnalyticsTracker`, `posthog-node`) | Faits métier confirmés : `profile_created`, `post_created`, `subscription_activated` |

- **App** : SDK `posthog-ios` utilisé uniquement via le protocole `AnalyticsService` (`Core/Analytics`, remplaçable par un faux dans les tests et les previews) ; noms d'événements centralisés dans `Core/Analytics` ; `identify(profileId)` dès la création du profil, avant le paywall (la variante reste la même pour l'utilisateur) ; `reset()` à la déconnexion.
- **API** : les événements serveur sont envoyés **après** la validation de la transaction ; un échec est journalisé, jamais propagé.
- **A/B test** : expérience PostHog sur un feature flag à plusieurs variantes, lue par le `PaywallViewModel`, qui choisit l'offre RevenueCat ou la présentation correspondante. PostHog enregistre l'exposition. Métrique principale : `purchase_completed`. Variante par défaut si PostHog est injoignable.
- **Backoffice** : jamais d'appel direct à PostHog. Il passe par `GET /v1/admin/analytics/overview` (entonnoir, inscriptions, abonnés Plus actifs, `?from=&to=`) et `GET /v1/admin/analytics/experiments` (variantes, expositions, conversions). L'API interroge l'API de requêtes PostHog (port `AnalyticsReader` du module `analytics`, clé personnelle côté serveur, use cases `GetAnalyticsOverview` et `GetExperimentResults`) et ajoute le nombre d'abonnés actifs lu en base. La page Analytics propose un lien « Ouvrir dans PostHog ».
- Suppression de compte propagée à PostHog (suppression de la personne) par le job `purge-account` (ADR-008).
- En test, `AnalyticsTracker` et `AnalyticsReader` sont remplacés par des adapters en mémoire : aucun appel à PostHog.

## Alternatives
- Analytics faits maison : contrôle total, mais entonnoirs et expériences à construire. Écarté (D26).
- PostHog auto-hébergé : données chez soi, mais trop lourd à mettre en place. Écarté (D26).
- RevenueCat Experiments : intégré au paywall, mais un second outil pour les événements. Écarté (D26).
- Appels directs du backoffice à PostHog, ou tableaux PostHog intégrés : moins de code, mais clé PostHog hors de l'API et contraire à ADR-011. Écarté (D27).

## Conséquences
### Positives
- Un seul outil pour les événements, les flags et les expériences.
- Faits métier fiables envoyés par le serveur, indépendamment de l'app.
- Clé personnelle PostHog confinée au serveur (API, worker pour la purge).

### Négatives
- Dépendance à un SaaS et à son API de requêtes (endpoints de l'entonnoir, des résultats d'expérience et de suppression d'une personne à vérifier au démarrage).
- Endpoints admin supplémentaires à maintenir dans le contrat.
- Déclaration App Privacy à remplir pour les données d'analytics et d'achat.

## Liens
- ADR-005 (ports `AnalyticsTracker` et `AnalyticsReader`)
- ADR-008 (job `purge-account`)
- ADR-010 (protocole `AnalyticsService`)
- ADR-011 (backoffice client de l'API)
- ADR-012 (offre RevenueCat choisie selon la variante)
