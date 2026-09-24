import { defineConfig } from 'vitest/config';

// Vérifications contre un Supabase réel (ADR-004), hors CI : `pnpm test:supabase`.
export default defineConfig({
  test: { include: ['test/supabase/**/*.test.ts'] },
});
