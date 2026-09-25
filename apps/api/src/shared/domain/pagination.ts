import { BadRequestError } from './errors.ts';

/**
 * Pagination par curseur (ADR-007) : couple `(created_at, id)` du dernier élément renvoyé. Le
 * domaine manipule le couple ; l'infrastructure HTTP l'encode en chaîne opaque pour le client.
 */
export interface PageCursor {
  createdAt: Date;
  id: string;
}

/** Une page d'éléments ; `next` est `null` sur la dernière page. */
export interface Page<T> {
  items: T[];
  next: PageCursor | null;
}

export class InvalidCursorError extends BadRequestError {
  constructor() {
    super('invalid_cursor', 'Curseur de pagination invalide.');
  }
}
