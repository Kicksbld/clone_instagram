import { createRequire } from 'node:module';

import { cruise, type ICruiseResult, type IConfiguration } from 'dependency-cruiser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const config = require('../.dependency-cruiser.cjs') as IConfiguration;

// Mêmes options que `pnpm lint`, sauf l'exclusion des fixtures, qu'on veut justement analyser.
const options = { ...config.options };
delete options.exclude;

async function violationsIn(directory: string) {
  const { output } = await cruise([directory], {
    ...options,
    validate: true,
    ruleSet: { forbidden: config.forbidden ?? [] },
  });
  return (output as ICruiseResult).summary.violations.map((v) => ({
    rule: v.rule.name,
    from: v.from,
  }));
}

describe('règles d’architecture (dependency-cruiser)', () => {
  it('le code de src ne viole aucune règle', async () => {
    expect(await violationsIn('src')).toEqual([]);
  });

  it('rejette les imports interdits', async () => {
    const violations = await violationsIn('test/fixtures/depcruise');

    expect(violations).toContainEqual({
      rule: 'domain-sans-import-externe',
      from: 'test/fixtures/depcruise/modules/sample/domain/entity.ts',
    });
    expect(violations).toContainEqual({
      rule: 'jobs-uniquement-en-infrastructure',
      from: 'test/fixtures/depcruise/modules/sample/application/use-case.ts',
    });
    expect(violations).not.toContainEqual(
      expect.objectContaining({
        rule: 'jobs-uniquement-en-infrastructure',
        from: 'test/fixtures/depcruise/modules/sample/infrastructure/adapter.ts',
      }),
    );
  });
});
