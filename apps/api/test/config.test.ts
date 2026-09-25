import { describe, expect, it } from 'vitest';

import { InvalidConfigError, loadConfig } from '../src/shared/infrastructure/config.ts';

const required = {
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_JWT_ISSUER: 'http://127.0.0.1:54321/auth/v1',
  REDIS_URL: 'redis://127.0.0.1:6379',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
  PUBLIC_MEDIA_BASE_URL: 'http://192.168.1.20:54321',
};

describe('configuration', () => {
  it('applique les valeurs par défaut', () => {
    expect(loadConfig(required)).toEqual({ ...required, API_PORT: 3000, LOG_LEVEL: 'info' });
  });

  it('traite une variable vide comme absente', () => {
    expect(loadConfig({ ...required, API_PORT: '', LOG_LEVEL: '' })).toMatchObject({
      API_PORT: 3000,
      LOG_LEVEL: 'info',
    });
  });

  it('lit et convertit les variables', () => {
    expect(loadConfig({ ...required, API_PORT: '8080', LOG_LEVEL: 'debug' })).toMatchObject({
      API_PORT: 8080,
      LOG_LEVEL: 'debug',
    });
  });

  it.each([
    ['port non numérique', { API_PORT: 'abc' }],
    ['port hors plage', { API_PORT: '70000' }],
    ['niveau de log inconnu', { LOG_LEVEL: 'verbose' }],
    ['DATABASE_URL absente', { DATABASE_URL: '' }],
    ['DATABASE_URL qui n’est pas une URL Postgres', { DATABASE_URL: 'redis://localhost:6379' }],
    ['SUPABASE_URL absente', { SUPABASE_URL: '' }],
    ['SUPABASE_JWT_ISSUER absent', { SUPABASE_JWT_ISSUER: '' }],
    ['REDIS_URL absente', { REDIS_URL: '' }],
    ['REDIS_URL qui n’est pas une URL Redis', { REDIS_URL: 'http://localhost:6379' }],
    ['SUPABASE_SERVICE_ROLE_KEY absente', { SUPABASE_SERVICE_ROLE_KEY: '' }],
    ['PUBLIC_MEDIA_BASE_URL absente', { PUBLIC_MEDIA_BASE_URL: '' }],
  ])('refuse de démarrer : %s', (_label, env) => {
    expect(() => loadConfig({ ...required, ...env })).toThrow(InvalidConfigError);
  });

  it('n’affiche jamais la valeur fautive', () => {
    let message = '';
    try {
      loadConfig({ ...required, DATABASE_URL: 'mysql://user:motdepasse@db' });
    } catch (error) {
      if (error instanceof Error) message = error.message;
    }

    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('motdepasse');
  });
});
