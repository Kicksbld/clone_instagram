import { UnrecoverableError, type Job } from 'bullmq';
import { describe, expect, it } from 'vitest';

import { createProcessor } from '../src/processor.ts';

const jobNamed = (name: string) => ({ name, data: {} }) as Job;

describe('aiguillage des jobs', () => {
  it('un job inconnu échoue définitivement, sans nouvelle tentative', async () => {
    const processor = createProcessor(new Map());
    await expect(processor(jobNamed('inconnu'))).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('un job connu est confié à son handler', async () => {
    const processor = createProcessor(new Map([['exemple', () => Promise.resolve('fait')]]));
    await expect(processor(jobNamed('exemple'))).resolves.toBe('fait');
  });
});
