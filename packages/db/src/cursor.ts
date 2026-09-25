import { validate } from 'uuid';

/**
 * Curseur de pagination : couple (created_at, id) du dernier élément renvoyé (ADR-007).
 * `createdAt` est à la milliseconde : les colonnes de curseur sont en `timestamptz(3)` (ADR-007).
 * `id` est un UUID de toute version : v7 pour nos lignes, v4 pour les profils (id Supabase Auth).
 */
export interface Cursor {
  createdAt: Date;
  id: string;
}

export class InvalidCursorError extends Error {
  constructor() {
    super('Curseur de pagination invalide');
    this.name = 'InvalidCursorError';
  }
}

const MAX_CURSOR_LENGTH = 128;

/** Encode le curseur en base64url, opaque pour le client. */
export function encodeCursor(cursor: Cursor): string {
  const payload = JSON.stringify([cursor.createdAt.toISOString(), cursor.id]);
  return Buffer.from(payload, 'utf8').toString('base64url');
}

/** Décode un curseur reçu du client ; lève `InvalidCursorError` s'il est mal formé (→ 400). */
export function decodeCursor(raw: string): Cursor {
  if (raw.length === 0 || raw.length > MAX_CURSOR_LENGTH) throw new InvalidCursorError();

  const bytes = Buffer.from(raw, 'base64url');
  // Node ignore les caractères invalides : on refuse tout ce qui ne se ré-encode pas à l'identique.
  if (bytes.toString('base64url') !== raw) throw new InvalidCursorError();

  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new InvalidCursorError();
  }

  if (!Array.isArray(parsed) || parsed.length !== 2) throw new InvalidCursorError();
  const [iso, id] = parsed as unknown[];
  if (typeof iso !== 'string' || typeof id !== 'string') throw new InvalidCursorError();

  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== iso) {
    throw new InvalidCursorError();
  }
  if (!validate(id)) throw new InvalidCursorError();

  return { createdAt, id };
}
