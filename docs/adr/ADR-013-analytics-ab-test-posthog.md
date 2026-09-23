# ADR-013 — Analytics et A/B test avec PostHog, backoffice sans duplication

## Statut
Proposé

## Contexte
Les analytics et un A/B test sont imposés en P0 : événements de l'onboarding, du paywall et des actions principales, et une première expérience sur le paywall mesurée sur la conversion vers l'achat. L'entonnoir onboarding → paywall → achat et les résultats de l'A/B test doivent être consultables par le lead dev.

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
- **Backoffice** : pas de duplication. Aucun endpoint `/v1/admin/analytics/*`, aucun module `analytics` côté API, aucun appel à PostHog depuis le backoffice ou le navigateur. L'entonnoir, les inscriptions, les abonnés Plus actifs et les résultats de l'A/B test se consultent directement dans l'interface PostHog. La page Analytics du backoffice se limite à un lien « Ouvrir dans PostHog ».
- Suppression de compte propagée à PostHog (suppression de la personne) par le job `purge-account` (ADR-008).
- En test, `AnalyticsTracker` est remplacé par un adapter en mémoire : aucun appel à PostHog.

## Alternatives
- Analytics faits maison : contrôle total, mais entonnoirs et expériences à construire. Écarté (D26).
- PostHog auto-hébergé : données chez soi, mais trop lourd à mettre en place. Écarté (D26).
- RevenueCat Experiments : intégré au paywall, mais un second outil pour les événements. Écarté (D26).
- Backoffice lisant les analytics via l'API (`/v1/admin/analytics/overview`, `/experiments`) : garde tout dans le backoffice, mais duplique une interface que PostHog fournit déjà, endpoints et use cases supplémentaires à maintenir pour rien. Écarté (D27).
- Appels directs du backoffice à PostHog, ou tableaux PostHog intégrés : moins de code, mais clé PostHog hors de l'API et contraire à ADR-011. Écarté (D27).

## Conséquences
### Positives
- Un seul outil pour les événements, les flags et les expériences.
- Faits métier fiables envoyés par le serveur, indépendamment de l'app.
- Clé personnelle PostHog confinée au serveur (API, worker pour la purge).
- Rien à construire ni maintenir côté backoffice pour les analytics : PostHog fournit déjà l'entonnoir et les résultats d'expérience.

### Négatives
- Dépendance à un SaaS (événements et suppression d'une personne à vérifier au démarrage).
- Le lead dev doit ouvrir PostHog séparément du backoffice pour consulter les chiffres.
- Déclaration App Privacy à remplir pour les données d'analytics et d'achat.

## Liens
- ADR-005 (port `AnalyticsTracker`)
- ADR-008 (job `purge-account`)
- ADR-010 (protocole `AnalyticsService`)
- ADR-011 (backoffice client de l'API)
- ADR-012 (offre RevenueCat choisie selon la variante)
