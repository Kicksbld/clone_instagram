import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/domain/errors.ts';
import { isOwnedBy, type Media, type MediaPurpose } from './media.ts';

/** Média inexistant ou d'un autre utilisateur. */
export class MediaNotFoundError extends NotFoundError {
  constructor() {
    super('media_not_found', 'Média introuvable.');
  }
}

export class MediaInvalidTransitionError extends ConflictError {
  constructor() {
    super('media_invalid_transition', 'Le statut du média ne permet pas cette opération.');
  }
}

export class MediaNotReadyError extends ConflictError {
  constructor() {
    super('media_not_ready', 'Le média n’est pas encore prêt.');
  }
}

export class MediaAlreadyAttachedError extends ConflictError {
  constructor() {
    super('media_already_attached', 'Ce média est déjà utilisé.');
  }
}

export class MediaPurposeMismatchError extends BusinessRuleError {
  constructor() {
    super('media_purpose_mismatch', 'Ce média est prévu pour un autre usage.');
  }
}

/**
 * Motif du refus d'un rattachement (ADR-008), relu après un `UPDATE` sans effet : introuvable,
 * mauvais usage, pas prêt, puis déjà utilisé.
 */
export function attachRefusal(
  media: Media | null,
  target: { ownerId: string; purpose: MediaPurpose },
): Error {
  if (!isOwnedBy(media, target.ownerId)) return new MediaNotFoundError();
  if (media.purpose !== target.purpose) return new MediaPurposeMismatchError();
  if (media.status !== 'ready') return new MediaNotReadyError();
  if (media.attachedAt !== null) return new MediaAlreadyAttachedError();
  // L'état relu autorise le rattachement : il a changé entre-temps (course).
  return new MediaInvalidTransitionError();
}
