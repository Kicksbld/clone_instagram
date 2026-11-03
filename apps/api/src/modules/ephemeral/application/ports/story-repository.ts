import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type { StoryViewer } from '../../domain/story.ts';
import type { Story, StoryAudience, StoryTrayEntry } from '../../domain/story.ts';

export interface NewStory {
  id: string;
  authorId: string;
  /** Média déjà rattaché (ADR-008). */
  mediaId: string;
  audience: StoryAudience;
  createdAt: Date;
  expiresAt: Date;
}

/** Écritures des tables `stories` et `story_views`. */
export interface StoryRepository {
  create(story: NewStory): Promise<void>;
  /**
   * Suppression logique, active ou expirée, seulement si la story est à `authorId` et pas encore
   * supprimée. Renvoie son média, ou `null` si aucune ligne n'est touchée.
   */
  softDelete(id: string, authorId: string): Promise<{ mediaId: string | null } | null>;
  /** Vue enregistrée une seule fois ; `true` seulement si la ligne vient d'être créée. */
  recordView(storyId: string, viewerId: string, viewedAt: Date): Promise<boolean>;
  incrementViewCount(storyId: string): Promise<void>;
}

/**
 * Lectures des stories non supprimées, vues par `viewerId`. La visibilité d'une story lue par son
 * identifiant ou par auteur est décidée par le use case (ADR-006) ; le bandeau la traduit en SQL.
 */
export interface StoryReader {
  listArchived(input: {
    authorId: string;
    now: Date;
    after: PageCursor | null;
    limit: number;
  }): Promise<Page<Story>>;
  /** Story non supprimée appartenant à l’auteur, active ou archivée. */
  findOwned(id: string, authorId: string): Promise<Story | null>;
  /** canViewProfile : comptes actifs, aucun blocage dans les deux sens. */
  listViewers(input: {
    storyId: string;
    authorId: string;
    after: PageCursor | null;
    q?: string;
    limit: number;
  }): Promise<Page<StoryViewer>>;

  /** Story non supprimée et active à `now`. */
  findActive(id: string, viewerId: string, now: Date): Promise<Story | null>;
  /** Stories actives d'un auteur, de la plus ancienne à la plus récente, toutes audiences. */
  listActiveByAuthor(authorId: string, viewerId: string, now: Date): Promise<Story[]>;
  /**
   * Auteurs (soi-même et comptes suivis) ayant une story active visible (`canViewStory`), dans
   * l'ordre du bandeau, `limit` au plus.
   */
  tray(viewerId: string, now: Date, limit: number): Promise<StoryTrayEntry[]>;
}
