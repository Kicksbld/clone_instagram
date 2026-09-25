import type { Relationship } from '../domain/visibility.ts';

/**
 * Relation entre deux comptes (abonnements, blocages), lue avant d'appliquer la politique de
 * visibilité (ADR-006). Port transverse : tout use case de lecture l'utilise.
 */
export interface RelationshipReader {
  /** Relation vue par `viewerId` envers `ownerId` (deux comptes distincts). */
  between(viewerId: string, ownerId: string): Promise<Relationship>;
}
