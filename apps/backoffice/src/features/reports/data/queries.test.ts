import type { paths } from '@clone/contract';
import createClient from 'openapi-fetch';
import { describe, expect, it } from 'vitest';

import { getReport, listReports } from './queries';

const REPORT = '0199a1b2-0000-7000-8000-000000000001';

function clientRespondingWith(respond: (request: Request) => Promise<Response>) {
  return createClient<paths>({ baseUrl: 'http://api.test', fetch: respond });
}

const problem = (status: number, code: string) =>
  new Response(JSON.stringify({ type: 'about:blank', title: 'x', status, detail: 'x', code }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });

describe('listReports', () => {
  it('transmet les filtres de l’URL et renvoie la page', async () => {
    let url = '';
    const client = clientRespondingWith((request) => {
      url = request.url;
      return Promise.resolve(Response.json({ items: [], nextCursor: 'abc' }));
    });

    const result = await listReports(client, { status: 'open', reason: 'spam', cursor: 'xyz' });

    expect(result).toEqual({ kind: 'page', page: { items: [], nextCursor: 'abc' } });
    expect(url).toBe('http://api.test/v1/admin/reports?status=open&reason=spam&cursor=xyz');
  });

  it('curseur invalide → invalid_cursor ; autre erreur → exception', async () => {
    const invalid = clientRespondingWith(() => Promise.resolve(problem(400, 'invalid_cursor')));
    expect(await listReports(invalid, { cursor: 'x' })).toEqual({ kind: 'invalid_cursor' });

    const failing = clientRespondingWith(() => Promise.resolve(problem(500, 'internal_error')));
    await expect(listReports(failing, {})).rejects.toThrow('HTTP 500');
  });
});

describe('getReport', () => {
  it('404 → null ; 500 → exception', async () => {
    const missing = clientRespondingWith(() => Promise.resolve(problem(404, 'report_not_found')));
    expect(await getReport(missing, REPORT)).toBeNull();

    const failing = clientRespondingWith(() => Promise.resolve(problem(500, 'internal_error')));
    await expect(getReport(failing, REPORT)).rejects.toThrow('HTTP 500');
  });
});
