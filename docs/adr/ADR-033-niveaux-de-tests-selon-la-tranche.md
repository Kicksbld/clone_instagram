# ADR-033 — Niveaux de tests de l'API selon la tranche

## Statut
Accepté

## Contexte
ADR-014 prévoit quatre niveaux de tests pour l'API : domaine, use cases avec adapters en mémoire, adapters sur Postgres réel, routes par `fastify.inject`. Jusqu'ici, chaque règle d'une tranche était testée aux trois derniers niveaux.

Pour une tranche simple (ajouter, retirer, lister, sur une seule table), les tests de use case et les tests de route vérifient les mêmes cas : en T23 (amis proches), refus de soi-même, compte bloqué ou inexistant, double ajout étaient testés deux fois. Chaque nouvelle liste demandait aussi d'écrire un adapter en mémoire qui reprend la requête SQL (tri, curseur, visibilité), en plus de l'adapter Drizzle.

Contraintes : les cas limites obligatoires d'ADR-014 restent testés ; la traduction SQL de la politique de visibilité reste testée sur Postgres réel (ADR-006) ; les mises à jour optimistes iOS restent testées (ADR-020).

## Décision
- **Toujours** :
  - **routes** (`fastify.inject`, adapters en mémoire) : contrat, codes d'erreur, cas limites de la fiche, scénario de démo ;
  - **adapters Drizzle sur Postgres réel** : requêtes, contraintes, pagination par curseur, visibilité traduite en SQL.
- **Tests de use case** (adapters en mémoire, sans HTTP) **seulement** quand le use case contient une règle que la route ne montre pas directement :
  - écriture sur plusieurs tables dans un `UnitOfWork` (ex. blocage : abonnements, demandes, amis proches, compteurs) ;
  - compteurs ;
  - machine à états ou transition de statut ;
  - ordre ou conditions d'effets de bord (notifications, jobs, analytics après la transaction).
- **Domaine** et **iOS** : inchangés (ADR-014, ADR-020).
- Un cas limite n'est testé qu'à un seul niveau : celui de la route s'il y a une route, sinon celui du use case.
- Le plan de phase indique, pour chaque tranche, si des tests de use case sont attendus.

## Alternatives
- Garder les trois niveaux pour toutes les tranches : couverture maximale, mais cas testés deux fois et coût de chaque tranche simple élevé.
- Garder seulement les tests de use case et retirer les tests de route : tests plus rapides, mais le contrat (validation, codes HTTP, Problem Details) n'est plus vérifié.
- Retirer les tests sur Postgres réel : plus de base nécessaire, mais la visibilité traduite en SQL et la pagination ne sont plus vérifiées (contraire à ADR-006).

## Conséquences
### Positives
- Moins de tests en double et moins d'adapters en mémoire à écrire pour les tranches simples.
- Chaque cas limite a un seul endroit de test, plus facile à retrouver.

### Négatives
- Une erreur dans un use case simple n'est vue qu'à travers la route : le message d'échec du test est moins précis.
- Il faut juger, tranche par tranche, si un use case « contient une règle » ; le plan de phase le fixe pour éviter de le décider pendant la tranche.

## Liens
- ADR-005 (use cases, `UnitOfWork`)
- ADR-006 (visibilité traduite en SQL, testée contre la politique)
- ADR-014 (niveaux de tests, cas limites obligatoires) : complété par cet ADR
- ADR-020 (tests des mises à jour optimistes iOS)
