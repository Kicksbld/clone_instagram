import type { paths } from '@clone/contract';
import createClient from 'openapi-fetch';
import { describe, expect, it } from 'vitest';

import { getUser, listUsers } from './queries';

const USER = '0199a1b2-0000-7000-8000-000000000001';

function clientRespondingWith(respond: (request: Request) => Promise<Response>) {
  return createClient<paths>({ baseUrl: 'http://api.test', fetch: respond });
}

const problem = (status: number, code: string) =>
  new Response(JSON.stringify({ type: 'about:blank', title: 'x', status, detail: 'x', code }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });

describe('listUsers', () => {
  it('transmet les critères de l’URL et renvoie la page', async () => {
    let url = '';
    const client = clientRespondingWith((request) => {
      url = request.url;
      return Promise.resolve(Response.json({ items: [], nextCursor: 'abc' }));
    });

    const result = await listUsers(client, { q: 'ines', status: 'banned', cursor: 'xyz' });

    expect(result).toEqual({ kind: 'page', page: { items: [], nextCursor: 'abc' } });
    expect(url).toBe('http://api.test/v1/admin/users?q=ines&status=banned&cursor=xyz');
  });

  it('curseur invalide → invalid_cursor ; autre erreur → exception', async () => {
    const invalid = clientRespondingWith(() => Promise.resolve(problem(400, 'invalid_cursor')));
    expect(await listUsers(invalid, { cursor: 'x' })).toEqual({ kind: 'invalid_cursor' });

    const failing = clientRespondingWith(() => Promise.resolve(problem(500, 'internal_error')));
    await expect(listUsers(failing, {})).rejects.toThrow('HTTP 500');
  });
});

describe('getUser', () => {
  it('404 → null ; 500 → exception', async () => {
    const missing = clientRespondingWith(() => Promise.resolve(problem(404, 'user_not_found')));
    expect(await getUser(missing, USER)).toBeNull();

    const failing = clientRespondingWith(() => Promise.resolve(problem(500, 'internal_error')));
    await expect(getUser(failing, USER)).rejects.toThrow('HTTP 500');
  });
});
