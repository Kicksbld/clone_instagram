import { defineConfig } from 'tsdown';

// Bundle autonome : les packages internes (@clone/*) sont consommés depuis leurs sources TypeScript
// et intégrés au bundle ; les dépendances npm restent externes.
export default defineConfig({
  entry: ['src/main.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  deps: { alwaysBundle: [/^@clone\//] },
});
