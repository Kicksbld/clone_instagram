import { once } from 'node:events';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { buildTestApp } from './support/test-app.ts';
import { signTestToken } from './support/tokens.ts';

const USER = '0199a1b2-0000-7000-8000-000000000001';
const ADMIN = '0199a1b2-0000-7000-8000-00000000a001';
let context: ReturnType<typeof buildTestApp>;
beforeEach(() => {
  context = buildTestApp();
});
afterEach(async () => {
  await context.app.close();
});

test('REST deletion immediately closes an authenticated WebSocket with 4401', async () => {
  context.profiles.add({ id: USER, username: 'alice' });
  await context.app.ready();
  const token = await signTestToken(USER);
  const socket = await context.app.injectWS('/v1/ws');
  const ack = once(socket, 'message');
  socket.send(JSON.stringify({ type: 'auth', token }));
  expect(JSON.parse(String((await ack)[0]))).toEqual({ type: 'auth.ok' });
  const closed = once(socket, 'close');
  const result = await context.app.inject({
    method: 'DELETE',
    url: '/v1/me',
    headers: { authorization: `Bearer ${token}` },
  });
  expect(result.statusCode).toBe(204);
  expect((await closed)[0]).toBe(4401);
});

test.each(['suspend', 'ban', 'delete'])(
  'admin %s disconnects the target socket after REST commits',
  async (action) => {
    context.profiles.add({ id: USER, username: 'alice' });
    context.adminRoles.admins.add(ADMIN);
    await context.app.ready();
    const socket = await context.app.injectWS('/v1/ws');
    const ack = once(socket, 'message');
    socket.send(JSON.stringify({ type: 'auth', token: await signTestToken(USER) }));
    await ack;
    const closed = once(socket, 'close');
    const result = await context.app.inject({
      method: action === 'delete' ? 'DELETE' : 'POST',
      url: `/v1/admin/users/${USER}${action === 'delete' ? '' : `/${action}`}`,
      headers: { authorization: `Bearer ${await signTestToken(ADMIN)}` },
      payload: { reason: 'Spam' },
    });
    expect(result.statusCode).toBe(action === 'delete' ? 204 : 200);
    expect((await closed)[0]).toBe(action === 'delete' ? 4401 : 4403);
  },
);
