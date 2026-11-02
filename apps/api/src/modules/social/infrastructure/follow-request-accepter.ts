import type { FollowRequestAccepter } from '../../../shared/application/follow-request-accepter.ts';
import type { CreatedNotification } from '../../../shared/domain/notification.ts';
import {
  acceptAllRequests,
  type FollowRequestAcceptance,
} from '../application/follow-request-acceptance.ts';

/**
 * Adapter du port transverse `FollowRequestAccepter` (ADR-032) : la règle d'acceptation du module
 * `social`, sur des repositories liés à la transaction de l'appelant.
 */
export class SocialFollowRequestAccepter implements FollowRequestAccepter {
  constructor(private readonly scope: FollowRequestAcceptance) {}

  acceptAll(targetId: string): Promise<CreatedNotification[]> {
    return acceptAllRequests(this.scope, targetId);
  }
}
