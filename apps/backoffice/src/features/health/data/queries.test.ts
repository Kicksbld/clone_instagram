import type { paths } from '@clone/contract';
import createClient from 'openapi-fetch';
import { describe, expect, it } from 'vitest';

import { getApiHealth } from './queries';

function clientRespondingWith(respond: () => Promise<Response>) {
  return createClient<paths>({ baseUrl: 'http://api.test', fetch: respond });
}

describe('getApiHealth', () => {
  it('renvoie ok quand /health répond { status: "ok" }', async () => {
    const client = clientRespondingWith(() =>
      Promise.resolve(Response.json({ status: 'ok' }, { status: 200 })),
    );
    expect(await getApiHealth(client)).toBe('ok');
  });

  it('renvoie unreachable sur une erreur Problem Details', async () => {
    const client = clientRespondingWith(() =>
      Promise.resolve(
        new Response(JSON.stringify({ status: 500, code: 'internal_error' }), {
          status: 500,
          headers: { 'content-type': 'application/problem+json' },
        }),
      ),
    );
    expect(await getApiHealth(client)).toBe('unreachable');
  });

  it('renvoie unreachable quand l’API est injoignable', async () => {
    const client = clientRespondingWith(() => Promise.reject(new TypeError('fetch failed')));
    expect(await getApiHealth(client)).toBe('unreachable');
  });
});
