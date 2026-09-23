import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// Les scripts tournent depuis packages/db : le .env du monorepo est deux niveaux au-dessus.
if (existsSync('../../.env')) process.loadEnvFile('../../.env');

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL manquante (voir .env.example)');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: { url: databaseUrl },
});
