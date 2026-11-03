import { defineConfig } from 'vitest/config';

// Les purges parcourent la base entière : elles ne doivent pas effacer les fixtures d'un autre fichier.
export default defineConfig({ test: { fileParallelism: false } });
