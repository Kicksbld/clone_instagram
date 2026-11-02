import type { ActivityRepository } from '../ports/activity-repository.ts';

/** Ouverture de l'Activité : toutes les notifications de l'appelant deviennent lues. Idempotent. */
export class MarkActivityRead {
  constructor(private readonly activity: ActivityRepository) {}

  execute(input: { viewerId: string }): Promise<void> {
    return this.activity.markAllRead(input.viewerId);
  }
}
