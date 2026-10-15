import { ForbiddenError } from '../../../shared/domain/errors.ts';

export type SubscriptionStatus = 'active' | 'expired';
export type Plan = 'free' | 'plus';

/** Copie locale de l'abonnement Clone Plus lu chez RevenueCat (ADR-012). */
export interface Subscription {
  userId: string;
  status: SubscriptionStatus;
  /** Identifiant du produit dans le store (`…plus.monthly`). */
  productId: string;
  /** Fin de la période payée ; `null` si RevenueCat n'en donne pas. */
  expiresAt: Date | null;
  refreshedAt: Date;
}

/** Plan vu par l'app : `plusExpiresAt` seulement si le plan est `plus`. */
export interface PlanStatus {
  plan: Plan;
  expiresAt: Date | null;
}

/** Délai pendant lequel un abonnement actif n'est pas relu chez RevenueCat (ADR-012). */
export const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Règle unique (ADR-012) : abonné Plus si l'abonnement est actif et que sa période payée n'est pas
 * terminée. Tout avantage côté API passe par elle.
 */
export function isPlus(subscription: Subscription | null, now: Date): boolean {
  return (
    subscription?.status === 'active' &&
    subscription.expiresAt !== null &&
    subscription.expiresAt.getTime() > now.getTime()
  );
}

export function planOf(subscription: Subscription | null, now: Date): PlanStatus {
  return subscription && isPlus(subscription, now)
    ? { plan: 'plus', expiresAt: subscription.expiresAt }
    : { plan: 'free', expiresAt: null };
}

/** Un abonné Plus vient d'être relu : inutile de rappeler RevenueCat (ADR-012). */
export function isFresh(subscription: Subscription | null, now: Date): boolean {
  return (
    subscription !== null &&
    isPlus(subscription, now) &&
    now.getTime() - subscription.refreshedAt.getTime() < REFRESH_INTERVAL_MS
  );
}

/** Avantage Clone Plus demandé sans abonnement actif (ADR-012). Aucune route P0 ne le lève encore. */
export class PlusRequiredError extends ForbiddenError {
  constructor() {
    super('plus_required', 'Cet avantage est réservé aux abonnés Clone Plus.');
  }
}
