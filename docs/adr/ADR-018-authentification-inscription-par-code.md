# ADR-018 — Authentification : JWT ES256 vérifiés par JWKS, inscription par code email, profil créé à l'acceptation des conditions

## Statut
Proposé

## Contexte
La tranche T2 met en place l'inscription, la connexion et l'onboarding. ADR-004 fixe le principe (Supabase Auth pour la connexion, l'API vérifie elle-même le JWT, profil créé par `POST /v1/me/onboarding`), mais plusieurs points restaient ouverts :

- **Vérification du JWT** : Supabase Cloud signe les JWT en ES256, clés publiques sur `/auth/v1/.well-known/jwks.json` ; la CLI locale signe par défaut en HS256 avec un secret partagé (constat de T1). L'API doit fonctionner de la même façon dans les deux environnements (ADR-009).
- **Parcours d'inscription** : le lead dev a relevé le parcours actuel d'Instagram : email → code de confirmation → mot de passe → date de naissance → nom → username → acceptation des conditions, puis configuration du profil (photo, bio). L'app doit le reproduire (ADR-010), ce qui impose une confirmation de l'email par code, avant le mot de passe.
- **Envoi des emails** : en local, la CLI capture les emails (Mailpit). Sur Supabase Cloud, depuis le 3 juin 2026, un projet gratuit qui utilise le serveur d'envoi par défaut de Supabase ne peut plus modifier ses modèles d'email ; or les modèles par défaut ne contiennent qu'un lien, pas le code. Le serveur par défaut n'envoie en outre qu'aux adresses des membres de l'équipe du projet.
- **Date de naissance** : Instagram la demande et refuse les moins de 13 ans ; elle n'était pas prévue dans `profiles`.
- **Moment de création du profil** : les conditions sont acceptées juste après le choix du username ; un profil créé avant l'acceptation existerait pour un utilisateur qui abandonne.
- **Suggestion de username** : Instagram propose un username libre à partir du nom ; seule l'API sait quels usernames sont libres.

## Décision
- **JWT ES256 en local comme sur la démo, vérifiés par JWKS** :
  - en local, une clé de signature ES256 est générée par `supabase gen signing-key --algorithm ES256` dans `supabase/signing_keys.json` (**non versionné**), référencée par `auth.signing_keys_path` dans `supabase/config.toml` ; sur Supabase Cloud, les clés ES256 sont déjà actives (T1) ;
  - l'API vérifie le JWT dans `shared/infrastructure` avec la bibliothèque `jose` (`createRemoteJWKSet`) : clés lues sur `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` (mises en cache par `jose`), algorithme `ES256` uniquement, émetteur `SUPABASE_JWT_ISSUER`, audience `authenticated`, expiration vérifiée ; le `sub` est l'identifiant de l'utilisateur ;
  - aucune variable d'environnement nouvelle : l'URL des clés se déduit de `SUPABASE_URL` ; aucun secret JWT dans l'API ;
  - JWT absent, mal formé, mal signé, expiré, d'un autre émetteur ou d'un autre algorithme : `401` (`code` : `unauthenticated`).
- **Inscription par email avec code de confirmation**, dans l'ordre d'Instagram :
  1. l'app appelle `signInWithOTP(email:)` du SDK `Auth`, qui crée l'utilisateur et envoie un code à 6 chiffres ;
  2. l'utilisateur saisit le code : `verifyOTP(email:token:type: .email)` ouvre la session ; renvoi du code possible après 60 s (délai de Supabase), code valable 1 heure ;
  3. l'utilisateur choisit son mot de passe : `update(user:)` avec le mot de passe (6 caractères minimum, réglage `minimum_password_length`).
  - Les modèles d'email « Confirm signup » et « Magic Link » contiennent le code (`{{ .Token }}`), pas de lien ; mêmes modèles en local (`supabase/templates/`, référencés dans `config.toml`) et sur Supabase Cloud (copiés dans le tableau de bord). Confirmation de l'email activée (`enable_confirmations = true`) dans les deux environnements.
  - **Email seulement** : pas d'inscription par numéro de téléphone en P0 (les SMS demandent un fournisseur payant).
- **Sign in with Apple** : jeton Apple échangé par `signInWithIdToken` (ADR-004) ; le parcours saute les étapes email, code et mot de passe ; le nom fourni par Apple préremplit l'étape Nom.
- **Connexion** (« J'ai déjà un compte ») : email + mot de passe, ou Sign in with Apple.
- **Envoi des emails sur la démo : SMTP d'iCloud Mail** du lead dev, configuré dans Supabase Cloud (Authentication → Emails → SMTP Settings) : serveur `smtp.mail.me.com`, port 587, identifiant = adresse iCloud complète, mot de passe pour app généré sur appleid.apple.com, expéditeur = cette adresse iCloud. Le mot de passe n'existe que dans le tableau de bord Supabase, jamais dans le dépôt. Ce SMTP rétablit la modification des modèles et l'envoi vers n'importe quelle adresse. En local, les emails sont lus dans Mailpit (port 54324).
- **Date de naissance** : colonne `profiles.birth_date` (`date`), obligatoire, envoyée par `POST /v1/me/onboarding` ; moins de 13 ans à la date du jour (UTC) → `422 age_requirement_not_met`. Elle n'est renvoyée qu'à son propriétaire (`GET /v1/me`), jamais aux autres utilisateurs.
- **Profil créé à l'acceptation des conditions** : `POST /v1/me/onboarding` `{ username, fullName, birthDate }` est appelé quand l'utilisateur touche « J'accepte », pas à la validation du username. L'acceptation n'est pas enregistrée à part : l'existence du profil vaut acceptation. Un second appel renvoie `409 profile_already_exists`.
- **Reprise d'un onboarding interrompu** : session ouverte sans profil (`GET /v1/me` → `404 profile_not_found`) → l'onboarding reprend à l'étape mot de passe pour un compte email (on ne sait pas si le mot de passe a été choisi), à l'étape date de naissance pour un compte Apple.
- **Suggestions de username calculées par l'API** : `GET /v1/usernames/{username}/availability` renvoie `{ username, available, suggestions }` ; quand le username est pris, `suggestions` contient jusqu'à 3 usernames libres dérivés du candidat. L'app construit le premier candidat à partir du nom (minuscules, accents et caractères hors `[a-z0-9._]` retirés, 30 caractères au plus), vérifie sa disponibilité et, s'il est pris, propose la première suggestion.
- **Limites des champs du profil** : username 1 à 30 caractères `[a-z0-9._]` (ADR-007), nom de 1 à 30 caractères, bio de 150 caractères au plus ; vérifiées par le contrat, le domaine et des contraintes `CHECK`.

## Alternatives
- Secret HS256 partagé en local et JWKS ES256 sur la démo : aucune clé à générer en local, mais deux chemins de vérification dans l'API et un secret de plus dans la configuration. Écarté par le lead dev au profit de clés asymétriques partout.
- Inscription par `signUp(email, password)` puis code de confirmation : un seul appel, mais le mot de passe est demandé avant la confirmation, contrairement au parcours d'Instagram. Non retenu.
- Lien de confirmation au lieu d'un code : pas de saisie, mais il faut un lien universel vers l'app et le parcours diffère d'Instagram. Non retenu.
- Inscription par téléphone (SMS) : fidèle à Instagram, mais nouveau fournisseur payant à configurer dans la CLI et le Cloud. Écarté par le lead dev.
- SMTP par défaut de Supabase sur la démo : aucun compte à configurer, mais modèles non modifiables sur un projet gratuit récent (email sans code) et envoi limité aux membres de l'équipe. Impossible ici.
- Gmail avec un mot de passe d'application : équivalent à iCloud, mais demande un compte Gmail avec double authentification. Non retenu.
- Service d'envoi (Resend, Brevo…) : adapté à une vraie app, mais nouveau SaaS et, pour Resend, nom de domaine vérifié. Écarté par le lead dev.
- Lien de confirmation sur la démo au lieu du code : modèles par défaut utilisables, mais lien universel à mettre en place et parcours différent d'Instagram. Non retenu.
- Date de naissance affichée sans être stockée, ou étape supprimée : plus simple, mais pas de contrôle d'âge. Écarté par le lead dev.
- Profil créé à la validation du username (fiche initiale de T2) : username réservé plus tôt, mais un profil existerait sans acceptation des conditions. Écarté par le lead dev.
- Suggestions de username calculées par l'app seule : aucun champ en plus dans le contrat, mais l'app ne peut pas savoir si la suggestion est libre sans multiplier les appels. Non retenu.

## Conséquences
### Positives
- Un seul chemin de vérification des JWT, identique en local et sur la démo, sans secret partagé dans l'API.
- Parcours d'inscription fidèle à celui d'Instagram, avec une adresse email confirmée.
- Aucun profil sans acceptation des conditions ; contrôle d'âge côté API.
- Les suggestions de username sont toujours libres au moment où elles sont proposées.

### Négatives
- Chaque machine de dev doit générer sa clé de signature avant `supabase start` ; la clé n'est pas versionnée.
- Les modèles d'email doivent être tenus identiques entre la CLI et Supabase Cloud (copie manuelle dans le tableau de bord).
- Sur la démo, les codes partent de l'adresse iCloud personnelle du lead dev, avec la limite d'envoi quotidienne d'iCloud Mail ; le mot de passe pour app est à régénérer s'il est révoqué.
- Un utilisateur Auth peut exister sans profil (abandon avant « J'accepte ») ; il reprend l'onboarding à la connexion suivante.
- La date de naissance est une donnée personnelle de plus, à purger avec le compte (T13) et à ne jamais envoyer à PostHog (ADR-013).
- Nouvelle dépendance de l'API : `jose`.

## Liens
- ADR-003 (contrat, codes d'erreur)
- ADR-004 (Supabase Auth, profil créé par l'API)
- ADR-005 (vérification de l'authentification dans `shared/infrastructure`)
- ADR-007 (règles du username, contraintes `CHECK`)
- ADR-009 (même configuration en local et sur la démo)
- ADR-010 (reproduction du parcours d'Instagram)
- ADR-013 (aucune donnée personnelle dans les analytics)
