import { describe, expect, it } from 'vitest';

import { InvalidConfigError, loadConfig } from '../src/config.ts';

const required = {
  REDIS_URL: 'redis://localhost:6379',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
};

describe('configuration du worker', () => {
  it('lit les variables et applique les valeurs par défaut', () => {
    expect(loadConfig(required)).toEqual({ ...required, LOG_LEVEL: 'info' });
  });

  it.each([
    ['REDIS_URL manquante', { REDIS_URL: undefined }],
    ['REDIS_URL vide', { REDIS_URL: '' }],
    ['REDIS_URL qui n’est pas une URL Redis', { REDIS_URL: 'http://localhost:6379' }],
    ['DATABASE_URL absente', { DATABASE_URL: '' }],
    ['DATABASE_URL qui n’est pas une URL Postgres', { DATABASE_URL: 'redis://localhost:6379' }],
    ['SUPABASE_URL absente', { SUPABASE_URL: '' }],
    ['SUPABASE_SERVICE_ROLE_KEY absente', { SUPABASE_SERVICE_ROLE_KEY: '' }],
  ])('refuse de démarrer : %s', (_label, env) => {
    expect(() => loadConfig({ ...required, ...env })).toThrow(InvalidConfigError);
  });

  it('n’affiche jamais la valeur fautive', () => {
    let message = '';
    try {
      loadConfig({ ...required, REDIS_URL: 'http://user:motdepasse@localhost' });
    } catch (error) {
      if (error instanceof Error) message = error.message;
    }

    expect(message).toContain('REDIS_URL');
    expect(message).not.toContain('motdepasse');
  });
});
