// Règles d'architecture hexagonale (ADR-005) et contrat des jobs (ADR-015).
// Exécuté par `pnpm lint` ; toute violation fait échouer la CI.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-sans-import-externe',
      comment:
        'Le domaine n’importe que du domaine : ni application, ni infrastructure, ni package.',
      severity: 'error',
      from: { path: '(^|/)domain/' },
      to: { pathNot: '(^|/)domain/' },
    },
    {
      name: 'application-sans-infrastructure',
      comment: 'La couche application ne dépend que du domaine et de ses propres ports.',
      severity: 'error',
      from: { path: '(^|/)application/' },
      to: { path: '(^|/)infrastructure/' },
    },
    {
      name: 'jobs-uniquement-en-infrastructure',
      comment:
        'Seul l’adapter BullMQ (infrastructure) importe packages/jobs ; le port JobQueue reste neutre.',
      severity: 'error',
      from: { pathNot: '(^|/)infrastructure/' },
      to: { path: '(^|/)packages/jobs/|^@clone/jobs' },
    },
    {
      name: 'pas-de-cycle',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'import-introuvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)test/fixtures/' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
