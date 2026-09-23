import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

const API_CLIENT_ONLY_IN_DATA =
  'Seuls les fichiers features/*/data/ appellent l’API (ADR-011) ; les composants ne font aucune requête.';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  comments.recommended,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
  {
    // Détection automatique incompatible avec ESLint 10 (eslint-plugin-react 7) : version explicite.
    settings: { react: { version: '19.2' } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@eslint-community/eslint-comments/require-description': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/api', '@/lib/api/*', '**/lib/api', '**/lib/api/*'],
              message: API_CLIENT_ONLY_IN_DATA,
            },
            {
              group: ['openapi-fetch'],
              message: 'Le client openapi-fetch vit dans src/lib/api (ADR-011).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/*/data/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['openapi-fetch'], message: 'Passer par src/lib/api (ADR-011).' }] },
      ],
    },
  },
  {
    // Le client lui-même, et les tests des requêtes qui construisent un client factice.
    files: ['src/lib/api/**', 'src/features/*/data/**/*.test.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
]);
