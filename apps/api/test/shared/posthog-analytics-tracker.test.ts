import { describe, expect, it } from 'vitest';

import type { AnalyticsEvent } from '../../src/shared/application/analytics-tracker.ts';
import { PostHogAnalyticsTracker } from '../../src/shared/infrastructure/analytics/posthog-analytics-tracker.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';

interface BatchBody {
  batch: { event: string; distinct_id: string; properties: object }[];
}

/** Corps des requêtes envoyées à PostHog, décodés. */
function recordingFetch(response: () => Promise<Response>) {
  const bodies: BatchBody[] = [];
  const fetch = async (_url: string, options: { body?: string | Blob }) => {
    if (typeof options.body === 'string') bodies.push(JSON.parse(options.body) as BatchBody);
    return response();
  };
  return { bodies, fetch };
}

const tracker = (fetch: ReturnType<typeof recordingFetch>['fetch'], errors: unknown[]) =>
  new PostHogAnalyticsTracker({
    apiKey: 'phc_test',
    host: 'https://posthog.test',
    onError: (error) => errors.push(error),
    transport: { fetch: fetch as never, fetchRetryCount: 0, disableCompression: true },
  });

describe('PostHogAnalyticsTracker', () => {
  it('envoie l’événement avec le profil comme distinct_id et ses seules propriétés', async () => {
    const errors: unknown[] = [];
    const { bodies, fetch } = recordingFetch(() =>
      Promise.resolve(new Response('{}', { status: 200 })),
    );
    const analytics = tracker(fetch, errors);

    analytics.track(ME, { name: 'post_created', properties: { kind: 'post', media_count: 2 } });
    await analytics.flush();

    const [event] = bodies.flatMap((body) => body.batch);
    expect(event).toMatchObject({
      event: 'post_created',
      distinct_id: ME,
      properties: { kind: 'post', media_count: 2 },
    });
    expect(errors).toEqual([]);
    await analytics.shutdown();
  });

  it('PostHog injoignable : aucune exception, erreur transmise à onError', async () => {
    const errors: unknown[] = [];
    const { fetch } = recordingFetch(() => Promise.reject(new Error('ECONNREFUSED')));
    const analytics = tracker(fetch, errors);

    expect(() => {
      analytics.track(ME, { name: 'profile_created' });
    }).not.toThrow();
    await expect(analytics.flush()).resolves.toBeUndefined();
    await expect(analytics.shutdown()).resolves.toBeUndefined();
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('événements serveur (ADR-013)', () => {
  it('aucune donnée personnelle : seules des propriétés techniques sont possibles', () => {
    const events: AnalyticsEvent[] = [
      { name: 'profile_created' },
      { name: 'post_created', properties: { kind: 'post', media_count: 1 } },
      { name: 'subscription_activated', properties: { product_id: 'plus.monthly' } },
    ];
    const keys = events.flatMap((event) =>
      'properties' in event ? Object.keys(event.properties) : [],
    );

    expect(keys.sort()).toEqual(['kind', 'media_count', 'product_id']);
  });
});
