import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { once } from 'node:events';
import {
  RealtimeBroker,
  registerRealtime,
} from '../../src/shared/infrastructure/realtime/realtime.ts';

let app: FastifyInstance;
let broker: RealtimeBroker;
beforeEach(() => {
  app = Fastify();
  broker = new RealtimeBroker(() => undefined);
});
afterEach(async () => {
  vi.useRealTimers();
  await app.close();
});
test('only authenticated recipients receive activity, on all their devices', async () => {
  registerRealtime(
    app,
    { verify: (token) => Promise.resolve({ userId: token, expiresAt: Date.now() / 1000 + 60 }) },
    { statusOf: () => Promise.resolve('active') },
    broker,
  );
  await app.ready();
  const socket = await app.injectWS('/v1/ws');
  const authenticated = once(socket, 'message');
  socket.send(JSON.stringify({ type: 'auth', token: 'alice' }));
  expect(JSON.parse(String((await authenticated)[0]))).toEqual({ type: 'auth.ok' });
  const message = once(socket, 'message');
  broker.publish(['alice'], { type: 'activity.created', data: { unreadCount: 3 } });
  expect(JSON.parse(String((await message)[0]))).toEqual({
    type: 'activity.created',
    data: { unreadCount: 3 },
  });
  socket.close();
});

test.each([
  ['deleted', 4401],
  ['suspended', 4403],
  ['banned', 4403],
] as const)('refuses %s accounts with %i', async (status, code) => {
  registerRealtime(
    app,
    { verify: () => Promise.resolve({ userId: 'alice', expiresAt: Date.now() / 1000 + 60 }) },
    { statusOf: () => Promise.resolve(status) },
    broker,
  );
  await app.ready();
  const socket = await app.injectWS('/v1/ws');
  const closed = once(socket, 'close');
  socket.send(JSON.stringify({ type: 'auth', token: 'token' }));
  expect((await closed)[0]).toBe(code);
});

test('missing auth closes after five seconds', async () => {
  registerRealtime(
    app,
    {
      verify: () => Promise.reject(new Error('invalid')),
    },
    { statusOf: () => Promise.resolve('active') },
    broker,
  );
  await app.ready();
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  const socket = await app.injectWS('/v1/ws');
  const closed = once(socket, 'close');
  await vi.advanceTimersByTimeAsync(5000);
  await vi.advanceTimersByTimeAsync(30_000);
  expect((await closed)[0]).toBe(4401);
});

test('expiry can be renewed on the same connection; otherwise it closes', async () => {
  registerRealtime(
    app,
    {
      verify: (token) =>
        Promise.resolve({
          userId: 'alice',
          expiresAt: Date.now() / 1000 + (token === 'first' ? 2 : 10),
        }),
    },
    { statusOf: () => Promise.resolve('active') },
    broker,
  );
  await app.ready();
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  const socket = await app.injectWS('/v1/ws');
  let ack = once(socket, 'message');
  socket.send(JSON.stringify({ type: 'auth', token: 'first' }));
  await ack;
  await vi.advanceTimersByTimeAsync(1000);
  ack = once(socket, 'message');
  socket.send(JSON.stringify({ type: 'auth', token: 'renewed' }));
  await ack;
  await vi.advanceTimersByTimeAsync(2000);
  expect(socket.readyState).toBe(1);
  const closed = once(socket, 'close');
  await vi.advanceTimersByTimeAsync(8000);
  await vi.advanceTimersByTimeAsync(30_000);
  expect((await closed)[0]).toBe(4401);
});

test('moderation disconnects every device of the recipient, but no other account', async () => {
  registerRealtime(
    app,
    { verify: (token) => Promise.resolve({ userId: token, expiresAt: Date.now() / 1000 + 60 }) },
    { statusOf: () => Promise.resolve('active') },
    broker,
  );
  await app.ready();
  const sockets = await Promise.all(
    ['alice', 'alice', 'bob'].map(async (token) => {
      const socket = await app.injectWS('/v1/ws');
      const ack = once(socket, 'message');
      socket.send(JSON.stringify({ type: 'auth', token }));
      await ack;
      return socket;
    }),
  );
  const received: unknown[] = [];
  sockets[2]?.on('message', (value: unknown) => received.push(value));
  const messages = sockets.slice(0, 2).map((socket) => once(socket, 'message'));
  broker.publish(['alice'], { type: 'activity.created', data: { unreadCount: 1 } });
  await Promise.all(messages);
  const closed = sockets.slice(0, 2).map((socket) => once(socket, 'close'));
  broker.disconnect('alice', 4403);
  expect((await Promise.all(closed)).map(([code]: unknown[]) => code)).toEqual([4403, 4403]);
  expect(sockets[2]?.readyState).toBe(1);
  expect(received).toEqual([]);
  sockets[2]?.close();
});

test.each([
  '{',
  '{}',
  '{"type":"write"}',
  '{"type":"auth","token":false}',
  '{"type":"auth","token":"valid","extra":true}',
])('malformed client message closes with 4401: %s', async (message) => {
  registerRealtime(
    app,
    {
      verify: () => Promise.resolve({ userId: 'alice', expiresAt: Date.now() / 1000 + 60 }),
    },
    { statusOf: () => Promise.resolve('active') },
    broker,
  );
  await app.ready();
  const socket = await app.injectWS('/v1/ws');
  const closed = once(socket, 'close');
  socket.send(message);
  expect((await closed)[0]).toBe(4401);
});

test('a connection cannot switch accounts during renewal', async () => {
  registerRealtime(
    app,
    { verify: (token) => Promise.resolve({ userId: token, expiresAt: Date.now() / 1000 + 60 }) },
    { statusOf: () => Promise.resolve('active') },
    broker,
  );
  await app.ready();
  const socket = await app.injectWS('/v1/ws');
  const ack = once(socket, 'message');
  socket.send(JSON.stringify({ type: 'auth', token: 'alice' }));
  await ack;
  const closed = once(socket, 'close');
  socket.send(JSON.stringify({ type: 'auth', token: 'bob' }));
  expect((await closed)[0]).toBe(4401);
});

test('a client without pong is disconnected at the next heartbeat', async () => {
  registerRealtime(
    app,
    { verify: () => Promise.resolve({ userId: 'alice', expiresAt: Date.now() / 1000 + 600 }) },
    { statusOf: () => Promise.resolve('active') },
    broker,
  );
  await app.ready();
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  const socket = await app.injectWS('/v1/ws');
  socket.pause();
  // Resume for auth acknowledgement, then stop processing pings (and therefore auto-pongs).
  socket.resume();
  const ack = once(socket, 'message');
  socket.send(JSON.stringify({ type: 'auth', token: 'token' }));
  await ack;
  socket.pause();
  await vi.advanceTimersByTimeAsync(30_000);
  const closed = once(socket, 'close');
  await vi.advanceTimersByTimeAsync(30_000);
  socket.resume();
  await closed;
  expect(socket.readyState).toBe(3);
});

test('invalid JWT closes with 4401', async () => {
  registerRealtime(
    app,
    { verify: () => Promise.reject(new Error('invalid token')) },
    { statusOf: () => Promise.resolve('active') },
    broker,
  );
  await app.ready();
  const socket = await app.injectWS('/v1/ws');
  const closed = once(socket, 'close');
  socket.send(JSON.stringify({ type: 'auth', token: 'invalid' }));
  expect((await closed)[0]).toBe(4401);
});

test.each([4401, 4403] as const)(
  'disconnect %i also closes sockets still authenticating',
  async (code) => {
    let finishStatus: ((status: 'active') => void) | undefined;
    registerRealtime(
      app,
      { verify: () => Promise.resolve({ userId: 'alice', expiresAt: Date.now() / 1000 + 60 }) },
      {
        statusOf: () =>
          new Promise<'active'>((resolve) => {
            finishStatus = resolve;
          }),
      },
      broker,
    );
    await app.ready();
    const socket = await app.injectWS('/v1/ws');
    const messages: unknown[] = [];
    socket.on('message', (message: unknown) => {
      messages.push(message);
    });
    socket.send(JSON.stringify({ type: 'auth', token: 'token' }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(finishStatus).toBeDefined();
    const closed = once(socket, 'close');
    broker.disconnect('alice', code);
    finishStatus?.('active');
    // A missed disconnect would register the socket and emit auth.ok instead of closing.
    await Promise.race([closed, once(socket, 'message')]);
    expect(messages).toEqual([]);
    expect((await closed)[0]).toBe(code);
  },
);
