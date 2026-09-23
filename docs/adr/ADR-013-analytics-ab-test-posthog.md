# ADR-013 — Analytics et A/B test avec PostHog, backoffice passant par l'API

## Statut
Proposé

## Contexte
Les analytics et un A/B test sont imposés en P0 : événements de l'onboarding, du paywall et des actions principales, et une première expérience sur le paywall mesurée sur la conversion vers l'achat. Le backoffice doit afficher l'entonnoir onboarding → paywall → achat, les résultats de l'A/B test et le nombre d'abonnés Plus actifs.

Contraintes : aucune donnée personnelle dans les événements, analytics jamais bloquants, le backoffice reste un client de l'API (ADR-011), et un auto-hébergement est trop lourd à mettre en place.

Décisions sources : D26, D27.

## Décision
- **PostHog Cloud** pour les événements, les feature flags et les expériences.
- **App** : SDK `posthog-ios`, utilisé uniquement via le protocole `AnalyticsService`. `identify(profileId)` dès la création du profil, avant le paywall.
- **API** : port `AnalyticsTracker` (`posthog-node`) pour les faits métier confirmés (`profile_created`, `post_created`, `subscription_activated`), envoyés après la validation de la transaction ; un échec est journalisé, jamais propagé.
- **Règles** : `distinct_id` = identifiant de profil ; événements `objet_action` en `snake_case` au passé ; aucune donnée personnelle (ni email, ni nom, ni contenu).
- **A/B test** : expérience PostHog sur un feature flag à plusieurs variantes, lue par le `PaywallViewModel`, qui choisit l'offre RevenueCat ou la présentation correspondante. Métrique principale : `purchase_completed`. Variante par défaut si PostHog est injoignable.
- **Backoffice** : jamais d'appel direct à PostHog. Il passe par `GET /v1/admin/analytics/*` ; l'API interroge l'API de requêtes PostHog (port `AnalyticsReader`, clé personnelle côté serveur) et ajoute le nombre d'abonnés actifs lu en base.
- Suppression de compte propagée à PostHog par le job de purge.

## Alternatives
- Analytics faits maison : contrôle total, mais entonnoirs et expériences à construire. Écarté (D26).
- PostHog auto-hébergé : données chez soi, mais trop lourd à mettre en place. Écarté (D26).
- RevenueCat Experiments : intégré au paywall, mais un second outil pour les événements. Écarté (D26).
- Appels directs du backoffice à PostHog, ou tableaux PostHog intégrés : moins de code, mais clé PostHog hors de l'API et contraire à ADR-011. Écarté (D27).

## Conséquences
### Positives
- Un seul outil pour les événements, les flags et les expériences.
- Faits métier fiables envoyés par le serveur, indépendamment de l'app.
- Clé personnelle PostHog confinée à l'API.

### Négatives
- Dépendance à un SaaS et à son API de requêtes (endpoints à vérifier au démarrage).
- Endpoints admin supplémentaires à maintenir dans le contrat.
- Déclaration App Privacy à remplir pour les données d'analytics.

## Liens
- ADR-005 (ports `AnalyticsTracker` et `AnalyticsReader`)
- ADR-010 (protocole `AnalyticsService`)
- ADR-011 (backoffice client de l'API)
- ADR-012 (offre RevenueCat choisie selon la variante)
