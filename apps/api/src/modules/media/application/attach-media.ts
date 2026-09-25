import { attachRefusal } from '../domain/errors.ts';
import type { MediaPurpose } from '../domain/media.ts';
import type { MediaRepository } from './ports/media-repository.ts';

/**
 * Rattache un média à un contenu de son propriétaire (photo de profil, post…), ou lève le refus
 * adapté. Utilisé par les use cases des autres modules, dans leur transaction.
 */
export async function attachMediaOrThrow(
  media: MediaRepository,
  target: { id: string; ownerId: string; purpose: MediaPurpose },
): Promise<void> {
  if (await media.attach(target)) return;
  throw attachRefusal(await media.findById(target.id), target);
}
