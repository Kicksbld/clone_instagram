import { validate, version } from 'uuid';
import { describe, expect, it } from 'vitest';

import { newId } from '../src/ids.ts';

describe('newId', () => {
  it('génère un UUID v7', () => {
    const id = newId();
    expect(validate(id)).toBe(true);
    expect(version(id)).toBe(7);
  });

  it('génère des identifiants triés dans le temps', () => {
    const ids = Array.from({ length: 100 }, () => newId());
    expect([...ids].sort()).toEqual(ids);
  });
});
