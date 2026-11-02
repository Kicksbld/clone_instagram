# Skills de Matt Pocock (vendorisés)

Copie des skills de [`mattpocock/skills`](https://github.com/mattpocock/skills) utilisés par [`docs/ia-workflow.md`](../../docs/ia-workflow.md), avec leurs dépendances. Versionnés dans le dépôt pour être disponibles partout (Claude Code local, sessions cloud, app desktop) et figés à une version connue. Licence MIT : `LICENSE-mattpocock-skills`.

- **Origine** : commit `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d` (2026-11-02).
- **Configuration propre au dépôt** : `docs/agents/` (issue tracker, labels, domaine). Ne pas modifier les `SKILL.md` pour l'adapter au projet ; la configuration va dans `docs/agents/` ou `CLAUDE.md`.
- **`/code-review`** : la version du dépôt remplace le skill intégré de Claude Code du même nom.
- **Mettre à jour** : recopier les dossiers depuis une nouvelle version du dépôt amont, relire le diff, mettre à jour le commit ci-dessus.

| Skill | Rôle dans le workflow |
|---|---|
| `grill-with-docs`, `to-spec`, `to-tickets` | Préparer une phase (§ 2) |
| `implement`, `tdd`, `code-review`, `pr`, `retro` | Réaliser une tranche (§ 3) |
| `research`, `prototype`, `handoff` | Pendant l'interrogatoire (§ 2.1) |
| `diagnosing-bugs`, `wizard`, `wait-what` | Pendant une tranche (§ 3) |
| `improve-codebase-architecture` | Fin de phase (§ 5) |
| `grilling`, `domain-modeling`, `codebase-design`, `triage`, `writing-for-agents`, `setup-matt-pocock-skills` | Dépendances appelées par les skills ci-dessus |
