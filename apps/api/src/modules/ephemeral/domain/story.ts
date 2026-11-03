import type { ImageVariantPaths } from '../../../shared/domain/image-variants.ts';
import type { StoryAudience, VisibilitySubject } from '../../../shared/domain/visibility.ts';

export type { StoryAudience };

const HOUR_MS = 60 * 60 * 1000;
/** Durée d'une story (ADR-025) : 24 h, ou 48 h si l'auteur est Clone Plus à la publication. */
export const STORY_DURATION_MS = 24 * HOUR_MS;
export const PLUS_STORY_DURATION_MS = 48 * HOUR_MS;
/** Bandeau : 100 auteurs au plus (décision du lead dev, T24). */
export const STORY_TRAY_LIMIT = 100;

/** Fin de la période active, fixée une fois pour toutes à la publication (avantage acquis, ADR-012). */
export function storyExpiresAt(createdAt: Date, authorIsPlus: boolean): Date {
  return new Date(
    createdAt.getTime() + (authorIsPlus ? PLUS_STORY_DURATION_MS : STORY_DURATION_MS),
  );
}

/** Auteur d'une story : ce que la politique de visibilité lit, et ce que la réponse affiche. */
export interface StoryAuthor extends VisibilitySubject {
  username: string;
  avatarVariants: ImageVariantPaths | null;
}

export interface StoryMedia {
  variants: ImageVariantPaths;
  width: number;
  height: number;
}

/** Story non supprimée, vue par un appelant. */
export interface Story {
  id: string;
  author: StoryAuthor;
  audience: StoryAudience;
  media: StoryMedia;
  /** L'appelant a vu cette story ; toujours vrai pour l'auteur. */
  viewerHasSeen: boolean;
  createdAt: Date;
  expiresAt: Date;
}

/** Active : ni expirée ni supprimée (les lectures ne renvoient jamais une story supprimée). */
export function isActive(story: Pick<Story, 'expiresAt'>, now: Date): boolean {
  return story.expiresAt.getTime() > now.getTime();
}

/** Un auteur du bandeau, d'après ses stories actives visibles par l'appelant. */
export interface StoryTrayEntry {
  author: Pick<StoryAuthor, 'id' | 'username' | 'avatarVariants'>;
  /** L'appelant a vu toutes ses stories actives visibles. */
  seen: boolean;
  hasCloseFriendsStory: boolean;
  latestStoryAt: Date;
}

/**
 * Ordre du bandeau (ADR-025) : ma story d'abord, puis les auteurs non vus, puis les vus ; dans chaque
 * groupe, de la story la plus récente à la plus ancienne.
 */
export function compareTrayEntries(viewerId: string) {
  const group = (entry: StoryTrayEntry) => (entry.author.id === viewerId ? 0 : entry.seen ? 2 : 1);
  return (a: StoryTrayEntry, b: StoryTrayEntry): number =>
    group(a) - group(b) ||
    b.latestStoryAt.getTime() - a.latestStoryAt.getTime() ||
    (a.author.id < b.author.id ? 1 : -1);
}

/** Compte et date de sa première vue normale. */
export interface StoryViewer {
  viewer: {
    id: string;
    username: string;
    fullName: string;
    avatarVariants: ImageVariantPaths | null;
  };
  viewedAt: Date;
}
