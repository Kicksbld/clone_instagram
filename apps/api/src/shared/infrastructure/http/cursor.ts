import { decodeCursor, InvalidCursorError as MalformedCursorError } from '@clone/db';

import { InvalidCursorError, type PageCursor } from '../../domain/pagination.ts';

/**
 * Curseur opaque reçu du client (ADR-007) : mal formé → `400 invalid_cursor`. `isValidId` : voir
 * `decodeCursor` (UUID par défaut).
 */
export function parseCursor(
  raw: string | undefined,
  isValidId?: (id: string) => boolean,
): PageCursor | null {
  if (raw === undefined) return null;
  try {
    return decodeCursor(raw, isValidId);
  } catch (error) {
    if (error instanceof MalformedCursorError) throw new InvalidCursorError();
    throw error;
  }
}
