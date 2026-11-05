# Dashboard PostHog de l'onboarding v2 (ADR-038)

Le dashboard se construit dans PostHog, jamais dans le backoffice (ADR-013). Ce document liste les événements envoyés par l'app, les insights à créer, et un prompt prêt à coller dans une session Claude Code **locale** équipée de Claude in Chrome. Une session cloud ne voit pas ton navigateur.

À faire **après** avoir installé l'app v2 et fait au moins deux parcours complets : un insight ne propose que des événements déjà reçus par PostHog.

## Événements

Toutes les propriétés sont des valeurs d'énumération, sans donnée personnelle. Chaque événement porte la super-propriété `onboarding_version = "v2"`.

| Événement | Propriétés | Quand |
|---|---|---|
| `onboarding_screen_viewed` | `screen`, `index` (1 à 25) | Chaque écran du parcours affiché, de `welcome` à `notification_permission` |
| `onboarding_step_completed` | `step` | Étape d'inscription franchie (existant, T11) |
| `onboarding_quiz_answered` | `question` (`interests`, `posting_style`, `rhythm`), `answer` | Une fois par valeur choisie, au premier passage à l'écran suivant |
| `onboarding_interaction_completed` | `kind` (`like`, `photo`), `method` (`double_tap`, `button`, `camera`, `library`) | Like du faux post ; photo publiée dans le faux feed |
| `onboarding_skipped` | `screen` | « Passer » dans le hook |
| `onboarding_sound_toggled` | `muted` (`true` / `false`) | Bouton haut-parleur du hook |
| `paywall_viewed`, `purchase_started`, `purchase_completed`, `purchase_cancelled` | `variant`, `source` | Paywall (existant, T11) ; `source = onboarding` en fin de parcours |
| `notification_permission_responded` | `granted` | Réponse à la demande système après la pré-permission |

Ordre des écrans (`screen`, `index`) :
1. `welcome`
2. `intro`
3. `promise`
4. `quiz_interests`
5. `insight_interests`
6. `quiz_style`
7. `insight_style`
8. `quiz_rhythm`
9. `like_post`
10. `first_photo`
11. `celebration`
12. `bridge`
13. `create_account`
14. `email`
15. `confirmation_code`
16. `password`
17. `birth_date`
18. `full_name`
19. `username`
20. `terms`
21. `profile_photo`
22. `bio`
23. `completed`
24. `paywall` (mesuré par `paywall_viewed`)
25. `notification_permission`

Le parcours Apple saute 14 à 16.

## Insights du dashboard « Onboarding v2 »

1. **Entonnoir écran par écran** : Funnel sur `onboarding_screen_viewed`, une étape par écran, filtrée sur `screen` = 1 à 23. Puis `paywall_viewed` (`source = onboarding`), `purchase_completed`. Fenêtre de conversion : 1 jour. Filtre global : `onboarding_version = v2`.
2. **Abandons par écran** : Trends de `onboarding_screen_viewed`, ventilé par `screen`, en utilisateurs uniques, affiché en barres. Trié par `index`, le plus grand écart entre deux barres voisines est l'écran où les gens partent.
3. **Temps passé par écran** : dans l'entonnoir n° 1, vue « Time to convert », ou Funnel en mode « Time to convert » entre deux écrans consécutifs (par ex. `quiz_interests` → `insight_interests`).
4. **Taux de skip** : Trends de `onboarding_skipped` ventilé par `screen`, plus une formule `skipped / screen_viewed(intro)`.
5. **Réponses du quiz** : trois insights Trends sur `onboarding_quiz_answered`, filtré par `question`, ventilé par `answer`, en camembert ou en barres.
6. **Interactions learn by doing** : Trends de `onboarding_interaction_completed`, ventilé par `kind` puis par `method`. Ratio à afficher : photos publiées / vues de `first_photo`.
7. **Paywall par variante** : Funnel `paywall_viewed` → `purchase_started` → `purchase_completed`, filtré `source = onboarding`, ventilé par `variant`.
8. **Expérience `paywall-presentation`** : épingler les résultats de l'expérience existante (métrique `purchase_completed`).
9. **Notifications** : Trends de `notification_permission_responded` ventilé par `granted`, plus le ratio sur les vues de `notification_permission`.
10. **Son coupé** : Trends de `onboarding_sound_toggled` ventilé par `muted`.

## Prompt pour une session locale avec navigateur

À coller dans Claude Code lancé sur le Mac, avec l'extension Claude in Chrome connectée et le projet PostHog ouvert dans le navigateur :

```text
Dans PostHog (projet de l'app Clone, déjà ouvert dans le navigateur), configure le dashboard de l'onboarding v2
décrit dans docs/analytics/posthog-onboarding-dashboard.md de ce dépôt (lis-le d'abord en entier).

1. Commence par un inventaire, sans rien modifier : dashboards, insights, feature flag `paywall-presentation`,
   expérience « Paywall presentation », réglage « Discard client IP data ». Liste ce qui existe déjà et ce qui
   manque ou diffère du document (le README § 4 « Analytics et A/B test » décrit la configuration de T11).
2. Montre-moi cet inventaire et attends ma validation avant toute création ou modification.
3. Ensuite : crée le dashboard « Onboarding v2 » avec les 10 insights du document. Réutilise et épingle les
   insights existants au lieu de les dupliquer. Ne modifie jamais l'expérience en cours ni le feature flag.
4. Si un événement n'apparaît pas dans les listes de PostHog, ne l'invente pas : signale-le (il faut d'abord
   faire un parcours dans l'app v2).
5. À la fin, donne-moi le lien du dashboard et la liste de ce qui a été créé, réutilisé ou laissé de côté.
```
