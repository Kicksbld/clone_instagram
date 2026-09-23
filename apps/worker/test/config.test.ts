import { describe, expect, it } from 'vitest';

import { InvalidConfigError, loadConfig } from '../src/config.ts';

describe('configuration du worker', () => {
  it('lit REDIS_URL', () => {
    expect(loadConfig({ REDIS_URL: 'redis://localhost:6379' })).toEqual({
      REDIS_URL: 'redis://localhost:6379',
      LOG_LEVEL: 'info',
    });
  });

  it.each([
    ['REDIS_URL manquante', {}],
    ['REDIS_URL vide', { REDIS_URL: '' }],
    ['REDIS_URL qui n’est pas une URL Redis', { REDIS_URL: 'http://localhost:6379' }],
  ])('refuse de démarrer : %s', (_label, env) => {
    expect(() => loadConfig(env)).toThrow(InvalidConfigError);
  });

  it('n’affiche jamais la valeur fautive', () => {
    let message = '';
    try {
      loadConfig({ REDIS_URL: 'http://user:motdepasse@localhost' });
    } catch (error) {
      if (error instanceof Error) message = error.message;
    }

    expect(message).toContain('REDIS_URL');
    expect(message).not.toContain('motdepasse');
  });
});
