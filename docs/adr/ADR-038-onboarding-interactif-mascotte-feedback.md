# ADR-038 — Onboarding interactif : hook avant l'inscription, mascotte, son et haptique

## Statut
Proposé

## Contexte
Le projet impose un onboarding de 10 à 40 écrans, animé, avec sound design et vibrations sur tout le parcours, tracké par des analytics consultables dans un dashboard, et terminé par le paywall. L'onboarding livré en P0 reproduit le parcours d'Instagram (ADR-018) avec des écrans en wireframe : composants système uniquement, sans couleur, typographie ni image personnalisées (règle de `ios/CLAUDE.md`, ADR-010). Ces deux contraintes s'opposent.

Le lead dev ne veut plus suivre Instagram pour l'onboarding. Il s'inspire des parcours « learn by doing » (Duolingo, Headspace, Forest), des quiz personnalisés (Noom) et des mascottes (Finch). Il fournit une mascotte en trois déclinaisons, sous forme d'image et de vidéo animée sur fond noir.

Contraintes :
- l'ordre et la logique de l'inscription (ADR-018), dont la reprise d'un onboarding interrompu, ne changent pas ;
- l'API ne peut rien recevoir avant la création du compte ;
- les analytics restent sans donnée personnelle et jamais bloquants, et le dashboard est consulté dans PostHog, pas dans le backoffice (ADR-013) ;
- aucune nouvelle dépendance sans ADR (ADR-010) ;
- l'API n'a pas d'endpoint pour enregistrer un jeton push (prévu par ADR-027).

## Décision
- **Hook avant l'inscription** (nouveaux comptes uniquement, depuis « Commencer ») : présentation de la mascotte, promesse en trois cartes, quiz de trois questions chacune suivie d'un insight, like d'un faux post, première photo avec filtres, célébration, puis pont vers l'inscription. Un bouton « Passer » mène directement à l'inscription. La reprise d'un onboarding (`.resume`) et la connexion sautent le hook.
- **Données du hook locales** : réponses du quiz et photo gardées en mémoire dans l'app. Les réponses personnalisent les écrans suivants et le paywall, et partent en analytics (valeurs d'énumération). La photo préremplit l'étape photo de profil, envoyée après la création du profil comme aujourd'hui. Rien n'est stocké côté serveur.
- **Inscription ADR-018 conservée et restylée** : même ordre, même ViewModel, même logique. Seule la présentation change.
- **Exception à la règle wireframe** pour l'onboarding, l'écran de bienvenue, le paywall et l'écran de permission des notifications : fond noir (`onboardingBackground`, identique au fond des vidéos de la mascotte), accents `cloneLime`, typographie système arrondie, composants dans `DesignSystem/Onboarding`. Le reste de l'app reste en wireframe.
- **Mascotte** (`DesignSystem/Mascot`) en trois poses, jamais deux sur le même écran : Guide (narration), Cœur (like et paywall), Bravo (célébrations).
  - Rendu par boucles vidéo muettes découpées dans la vidéo fournie, lues par `AVPlayerLooper`, posées sur le fond noir de l'onboarding pour que le noir de la vidéo ne se voie pas.
  - Image fixe si Reduce Motion est activé.
  - Assets produits par des scripts ffmpeg versionnés (`ios/scripts/assets/`).
- **Son et haptique** : un service `FeedbackService` (`Core/Feedback`) joue des repères nommés, chacun combinant un son court et une vibration.
  - Sons synthétisés par script ffmpeg, libres de droits.
  - Session audio `ambient` : le bouton silencieux coupe les sons.
  - Bouton mute dans l'onboarding, mémorisé sur l'appareil.
  - Frameworks système uniquement (AVFoundation, UIKit) : aucune nouvelle dépendance.
- **Paywall à la fin du parcours** (comme aujourd'hui, ADR-012) : refait dans le style de l'onboarding. L'expérience `paywall-presentation` et ses deux variantes sont conservées (ADR-013).
- **Pré-permission des notifications** après le paywall : écran expliquant l'intérêt, puis demande système. Aucun jeton n'est envoyé tant qu'ADR-027 n'est pas implémenté.
- **Analytics** (extension d'ADR-013), propriétés en énumération uniquement :
  - `onboarding_screen_viewed { screen, index }`
  - `onboarding_quiz_answered { question, answer }`
  - `onboarding_interaction_completed { kind, method }`
  - `onboarding_skipped { screen }`
  - `onboarding_sound_toggled { muted }`
  - `notification_permission_responded { granted }`
  - super-propriété `onboarding_version`

  `onboarding_step_completed` est conservé. Le dashboard (entonnoir écran par écran, abandons, réponses, paywall par variante) est construit dans PostHog et documenté dans `docs/analytics/`.

## Alternatives
- **Restyler seulement les étapes existantes, sans hook** : moins de travail, mais pas d'interaction avant l'inscription ni de parcours de 10 à 40 écrans. Non retenu.
- **Réordonner aussi l'inscription** : plus de liberté, mais remplace ADR-018 (reprise, tests, potentiellement l'API). Non retenu.
- **Stocker les réponses du quiz côté serveur** : ouvre la personnalisation du feed, mais demande contrat, migration et endpoint, sans usage immédiat. Non retenu.
- **Mascotte redessinée en vecteur, ou animée avec Lottie / Rive** : fond et taille libres, mais ressemblance approximative, ou nouvelle dépendance et assets à refaire. Non retenu.
- **Vidéos détourées avec transparence** : impossible proprement, car les contours de la mascotte sont noirs comme le fond. Reste possible si la vidéo est régénérée sur fond vert.
- **Dashboard dans le backoffice** : contraire à ADR-013 et ADR-011. Non retenu.

## Conséquences
### Positives
- L'utilisateur ressent le produit (like, photo) avant de créer son compte. Chaque écran est mesuré, ce qui rend les abandons visibles.
- L'inscription et sa reprise ne changent pas : les tests existants restent valables.
- Aucun changement d'API, de contrat ni de base.
- Son et haptique réutilisables dans le reste de l'app par le même service.

### Négatives
- L'onboarding et le paywall ne ressemblent plus à Instagram, contrairement au reste de l'app.
- La mascotte ne s'affiche correctement que sur fond sombre. Sa taille est limitée par la résolution de la vidéo source (environ 420 px par pose).
- Assets binaires versionnés (vidéos et sons, quelques centaines de Ko).
- La permission des notifications est demandée sans que les notifications push soient encore envoyées.

## Liens
- [Onboarding interactif v2](https://github.com/Kicksbld/clone_instagram/issues/76)
- ADR-010 (app iOS, dépendances, écrans)
- ADR-012 (paywall)
- ADR-013 (analytics et A/B test)
- ADR-018 (parcours d'inscription)
- ADR-027 (notifications push)
