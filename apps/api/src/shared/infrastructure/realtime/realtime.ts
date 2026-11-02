import spec from '@clone/contract/openapi.json' with { type: 'json' };
import { Ajv2020 } from 'ajv/dist/2020.js';
import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { RealtimeEvent, RealtimePublisher } from '../../application/realtime-publisher.ts';
import type { AccountStatusReader } from '../../application/account-status-reader.ts';
import type { TokenVerifier } from '../auth/token-verifier.ts';
import { routeSchemaFor } from '../http/contract-schemas.ts';

const validateAuth = new Ajv2020({ strict: true }).compile<{ type: 'auth'; token: string }>(
  spec.components.schemas.RealtimeAuth,
);

export class RealtimeBroker implements RealtimePublisher {
  private readonly connections = new Map<string, Set<WebSocket>>();
  private readonly authenticating = new Map<string, Set<WebSocket>>();
  constructor(private readonly onError: (error: unknown) => void) {}
  add(userId: string, socket: WebSocket): () => void {
    return this.track(this.connections, userId, socket);
  }
  trackAuthentication(userId: string, socket: WebSocket): () => void {
    return this.track(this.authenticating, userId, socket);
  }
  private track(
    connections: Map<string, Set<WebSocket>>,
    userId: string,
    socket: WebSocket,
  ): () => void {
    const sockets = connections.get(userId) ?? new Set<WebSocket>();
    connections.set(userId, sockets);
    sockets.add(socket);
    const remove = () => {
      socket.off('close', remove);
      sockets.delete(socket);
      if (!sockets.size && connections.get(userId) === sockets) connections.delete(userId);
    };
    socket.once('close', remove);
    return remove;
  }
  publish(userIds: string[], event: RealtimeEvent): void {
    for (const id of new Set(userIds)) {
      for (const socket of this.connections.get(id) ?? []) {
        try {
          if (socket.readyState === 1)
            socket.send(JSON.stringify(event), (error) => {
              if (error) this.onError(error);
            });
        } catch (error) {
          this.onError(error);
        }
      }
    }
  }
  disconnect(userId: string, code: 4401 | 4403): void {
    for (const socket of new Set([
      ...(this.connections.get(userId) ?? []),
      ...(this.authenticating.get(userId) ?? []),
    ])) {
      try {
        socket.close(code);
      } catch (error) {
        this.onError(error);
      }
    }
  }
}

export function registerRealtime(
  app: FastifyInstance,
  verifier: TokenVerifier,
  accounts: AccountStatusReader,
  broker: RealtimeBroker,
): void {
  void app.register(websocket, { options: { maxPayload: 16_384 } });
  void app.register((scope, _options, done) => {
    scope.get(
      '/v1/ws',
      { websocket: true, schema: routeSchemaFor('connectRealtime') },
      (socket) => {
        let userId: string | undefined;
        let remove: (() => void) | undefined;
        let alive = true;
        let expiry = setTimeout(() => {
          socket.close(4401);
        }, 5000);
        const heartbeat = setInterval(() => {
          if (!alive) {
            socket.terminate();
            return;
          }
          alive = false;
          socket.ping();
        }, 30_000);
        socket.on('pong', () => {
          alive = true;
        });
        socket.on('close', () => {
          clearTimeout(expiry);
          clearInterval(heartbeat);
          remove?.();
        });
        let pending = Promise.resolve();
        socket.on('message', (raw) => {
          pending = pending.then(async () => {
            if (!isOpen(socket)) return;
            try {
              const message: unknown = JSON.parse(
                (Array.isArray(raw)
                  ? Buffer.concat(raw)
                  : Buffer.isBuffer(raw)
                    ? raw
                    : Buffer.from(raw)
                ).toString('utf8'),
              );
              if (!validateAuth(message)) {
                socket.close(4401);
                return;
              }
              const identity = await verifier.verify(message.token);
              if (!isOpen(socket)) return;
              // Fence the status read: sanctions committed while it is pending also close this socket.
              const untrack = broker.trackAuthentication(identity.userId, socket);
              try {
                const status = await accounts.statusOf(identity.userId);
                if (!isOpen(socket)) return;
                if (status === 'deleted' || (userId && userId !== identity.userId)) {
                  socket.close(4401);
                  return;
                }
                if (status === 'suspended' || status === 'banned') {
                  socket.close(4403);
                  return;
                }
                if (!identity.expiresAt || identity.expiresAt * 1000 <= Date.now()) {
                  socket.close(4401);
                  return;
                }
                clearTimeout(expiry);
                expiry = setTimeout(
                  () => {
                    socket.close(4401);
                  },
                  Math.min(identity.expiresAt * 1000 - Date.now(), 2_147_483_647),
                );
                userId = identity.userId;
                remove?.();
                remove = broker.add(userId, socket);
                socket.send(JSON.stringify({ type: 'auth.ok' }));
              } finally {
                untrack();
              }
            } catch {
              socket.close(4401);
            }
          });
        });
      },
    );
    done();
  });
}

function isOpen(socket: WebSocket): boolean {
  return socket.readyState === 1;
}
