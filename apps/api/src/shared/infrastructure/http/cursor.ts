import { decodeCursor, InvalidCursorError as MalformedCursorError } from '@clone/db';

import { InvalidCursorError, type PageCursor } from '../../domain/pagination.ts';

/** Curseur opaque reçu du client (ADR-007) : mal formé → `400 invalid_cursor`. */
export function parseCursor(raw: string | undefined): PageCursor | null {
  if (raw === undefined) return null;
  try {
    return decodeCursor(raw);
  } catch (error) {
    if (error instanceof MalformedCursorError) throw new InvalidCursorError();
    throw error;
  }
}
