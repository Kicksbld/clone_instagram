import type { SubscriptionStatus } from '../../domain/subscription.ts';

/** Abonnement Clone Plus tel que RevenueCat le décrit (source de vérité des achats, ADR-012). */
export interface ProviderSubscription {
  status: SubscriptionStatus;
  productId: string;
  expiresAt: Date | null;
}

/** RevenueCat ne répond pas (réseau, délai, erreur 5xx, réponse illisible). */
export class SubscriptionProviderUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('RevenueCat injoignable', { cause });
    this.name = 'SubscriptionProviderUnavailableError';
  }
}

/** Lecture de l'abonnement chez RevenueCat ; client RevenueCat = identifiant de profil. */
export interface SubscriptionProvider {
  /** `null` si l'utilisateur n'a jamais été abonné ; lève `SubscriptionProviderUnavailableError`. */
  fetch(customerId: string): Promise<ProviderSubscription | null>;
}
