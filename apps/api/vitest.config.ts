import { configDefaults, defineConfig } from 'vitest/config';

// `test/supabase` vise un Supabase réel (local ou démo) : exclu de `pnpm test`, lancé par `pnpm test:supabase`.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, 'test/supabase/**'] },
});
