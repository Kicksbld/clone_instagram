import { existsSync } from 'node:fs';

import type { NextConfig } from 'next';

// En local, un seul `.env` à la racine du monorepo (ADR-009) ; Next ne lit que celui de son dossier.
// Sur Vercel, les variables viennent du projet et ce fichier n'existe pas.
const rootEnvFile = new URL('../../.env', import.meta.url);
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

const nextConfig: NextConfig = {
  // Packages internes consommés depuis leurs sources TypeScript.
  transpilePackages: ['@clone/contract'],
};

export default nextConfig;
