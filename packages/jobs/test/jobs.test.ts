import { describe, expect, it } from 'vitest';

import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES } from '../src/index.ts';

describe('contrat des jobs', () => {
  it('déclare les files media et maintenance', () => {
    expect(Object.values(QUEUE_NAMES)).toEqual(['media', 'maintenance']);
  });

  it('impose 3 tentatives avec un délai croissant', () => {
    expect(DEFAULT_JOB_OPTIONS.attempts).toBe(3);
    expect(DEFAULT_JOB_OPTIONS.backoff.type).toBe('exponential');
  });
});
