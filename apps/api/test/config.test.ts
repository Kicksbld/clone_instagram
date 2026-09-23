import { describe, expect, it } from 'vitest';

import { InvalidConfigError, loadConfig } from '../src/shared/infrastructure/config.ts';

describe('configuration', () => {
  it('applique les valeurs par défaut', () => {
    expect(loadConfig({})).toEqual({ API_PORT: 3000, LOG_LEVEL: 'info' });
  });

  it('traite une variable vide comme absente', () => {
    expect(loadConfig({ API_PORT: '', LOG_LEVEL: '' })).toEqual({
      API_PORT: 3000,
      LOG_LEVEL: 'info',
    });
  });

  it('lit et convertit les variables', () => {
    expect(loadConfig({ API_PORT: '8080', LOG_LEVEL: 'debug' })).toEqual({
      API_PORT: 8080,
      LOG_LEVEL: 'debug',
    });
  });

  it.each([
    ['port non numérique', { API_PORT: 'abc' }],
    ['port hors plage', { API_PORT: '70000' }],
    ['niveau de log inconnu', { LOG_LEVEL: 'verbose' }],
  ])('refuse de démarrer : %s', (_label, env) => {
    expect(() => loadConfig(env)).toThrow(InvalidConfigError);
  });

  it('n’affiche jamais la valeur fautive', () => {
    let message = '';
    try {
      loadConfig({ API_PORT: 'valeur-secrete' });
    } catch (error) {
      if (error instanceof Error) message = error.message;
    }

    expect(message).toContain('API_PORT');
    expect(message).not.toContain('valeur-secrete');
  });
});
