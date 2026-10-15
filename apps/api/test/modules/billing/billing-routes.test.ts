import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, TEST_NOW } from '../../support/test-app.ts';
import { signTestToken } from '../../support/tokens.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';
const PRODUCT = 'com.killianboularand.cloneinstagram.plus.monthly';
const EXPIRES_AT = new Date(TEST_NOW.getTime() + 30 * 24 * 60 * 60 * 1000);

let context: ReturnType<typeof buildTestApp>;
let auth: { authorization: string };

beforeEach(async () => {
  context = buildTestApp();
  auth = { authorization: `Bearer ${await signTestToken(ME)}` };
});

afterEach(async () => {
  await context.app.close();
});

const refresh = (headers: Record<string, string> = auth) =>
  context.app.inject({ method: 'POST', url: '/v1/me/subscription/refresh', headers });

describe('POST /v1/me/subscription/refresh', () => {
  it('sans abonnement → plan free', async () => {
    context.profiles.add({ id: ME, username: 'killian' });
    const response = await refresh();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ plan: 'free' });
  });

  it('après un achat → plan plus et date de fin ; GET /v1/me suit', async () => {
    context.profiles.add({ id: ME, username: 'killian' });
    context.subscriptionProvider.customers.set(ME, {
      status: 'active',
      productId: PRODUCT,
      expiresAt: EXPIRES_AT,
    });

    const response = await refresh();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ plan: 'plus', expiresAt: EXPIRES_AT.toISOString() });

    const me = await context.app.inject({ method: 'GET', url: '/v1/me', headers: auth });
    expect(me.json()).toMatchObject({ plan: 'plus', plusExpiresAt: EXPIRES_AT.toISOString() });
  });

  it('RevenueCat injoignable → 200 avec le dernier statut connu', async () => {
    context.profiles.add({ id: ME, username: 'killian' });
    context.subscriptionProvider.unavailable = true;

    const response = await refresh();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ plan: 'free' });
  });

  it('profil absent → 404 profile_not_found', async () => {
    const response = await refresh();
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'profile_not_found' });
  });

  it('sans JWT → 401', async () => {
    const response = await refresh({});
    expect(response.statusCode).toBe(401);
  });
});
