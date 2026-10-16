import type { paths } from '@clone/contract';
import createClient from 'openapi-fetch';
import { describe, expect, it } from 'vitest';

import { checkAdmin } from './admin-session';

function clientReplying(status: number) {
  return createClient<paths>({
    baseUrl: 'http://api.test',
    fetch: () =>
      Promise.resolve(
        status === 200
          ? Response.json({ id: '0199a1b2-0000-7000-8000-000000000001', role: 'admin' })
          : new Response(JSON.stringify({ status, code: 'x' }), {
              status,
              headers: { 'content-type': 'application/problem+json' },
            }),
      ),
  });
}

describe('checkAdmin', () => {
  it.each([
    [200, 'admin'],
    [401, 'unauthenticated'],
    [403, 'not_admin'],
  ] as const)('HTTP %i → %s', async (status, expected) => {
    expect(await checkAdmin(clientReplying(status))).toBe(expected);
  });

  it('API en erreur → exception (page d’erreur)', async () => {
    await expect(checkAdmin(clientReplying(500))).rejects.toThrow('HTTP 500');
  });
});
