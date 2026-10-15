import { PostHog, type PostHogOptions } from 'posthog-node';

import type { AnalyticsEvent, AnalyticsTracker } from '../../application/analytics-tracker.ts';

export interface PostHogAnalyticsTrackerOptions {
  apiKey: string;
  host: string;
  /** Échec d'envoi : journalisé par l'appelant, jamais propagé (ADR-013). */
  onError: (error: unknown) => void;
  /** Réglages réseau remplacés dans les tests (`fetch` factice, sans nouvelle tentative ni compression). */
  transport?: Pick<PostHogOptions, 'fetch' | 'fetchRetryCount' | 'disableCompression'>;
}

/** Événements serveur envoyés à PostHog Cloud par `posthog-node` (ADR-013). */
export class PostHogAnalyticsTracker implements AnalyticsTracker {
  private readonly client: PostHog;
  private readonly onError: (error: unknown) => void;

  constructor(options: PostHogAnalyticsTrackerOptions) {
    this.onError = options.onError;
    this.client = new PostHog(options.apiKey, {
      host: options.host,
      // Géolocalisation sur l'IP du serveur : sans intérêt, et aucune IP n'est utile ici.
      disableGeoip: true,
      ...options.transport,
    });
    this.client.on('error', (error: unknown) => {
      this.onError(error);
    });
  }

  track(distinctId: string, event: AnalyticsEvent): void {
    try {
      this.client.capture({
        distinctId,
        event: event.name,
        ...('properties' in event ? { properties: event.properties } : {}),
      });
    } catch (error) {
      this.onError(error);
    }
  }

  /** Envoie les événements en attente (arrêt de l'API, tests). */
  async flush(): Promise<void> {
    try {
      await this.client.flush();
    } catch (error) {
      this.onError(error);
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.client.shutdown();
    } catch (error) {
      this.onError(error);
    }
  }
}

/** PostHog non configuré (clé absente) : aucun envoi. */
export const noopAnalyticsTracker: AnalyticsTracker = { track: () => undefined };
