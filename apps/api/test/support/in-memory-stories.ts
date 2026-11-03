import type {
  NewStory,
  StoryReader,
  StoryRepository,
} from '../../src/modules/ephemeral/application/ports/story-repository.ts';
import {
  compareTrayEntries,
  isActive,
  type Story,
  type StoryTrayEntry,
} from '../../src/modules/ephemeral/domain/story.ts';
import type { ImageVariantPaths } from '../../src/shared/domain/image-variants.ts';
import { canViewStory, SELF_RELATIONSHIP } from '../../src/shared/domain/visibility.ts';
import type { InMemoryMediaRepository } from './in-memory-media-repository.ts';
import type { InMemoryProfileRepository } from './in-memory-profile-repository.ts';
import type { InMemoryRelationshipReader } from './in-memory-relationship-reader.ts';
import { TEST_IMAGE_SIZE } from './in-memory-posts.ts';

type StoryRow = NewStory & { deletedAt: Date | null; viewCount: number };

/**
 * Adapter en mémoire (ADR-005) : mêmes règles que `DrizzleStoryReader` / `DrizzleStoryRepository`
 * (stories non supprimées, actives à `now`, bandeau limité à moi et aux comptes suivis).
 */
export class InMemoryStories implements StoryRepository, StoryReader {
  readonly rows = new Map<string, StoryRow>();
  /** Vues (`story_views`), clé `storyId:viewerId`. */
  readonly views = new Map<string, Date>();

  constructor(
    private readonly profiles: InMemoryProfileRepository,
    private readonly media: InMemoryMediaRepository,
    private readonly relationships: InMemoryRelationshipReader,
  ) {}

  create(story: NewStory): Promise<void> {
    this.rows.set(story.id, { ...story, deletedAt: null, viewCount: 0 });
    return Promise.resolve();
  }

  softDelete(id: string, authorId: string): Promise<{ mediaId: string | null } | null> {
    const row = this.rows.get(id);
    if (!row || row.authorId !== authorId || row.deletedAt) return Promise.resolve(null);
    this.rows.set(id, { ...row, deletedAt: new Date() });
    return Promise.resolve({ mediaId: row.mediaId });
  }

  recordView(storyId: string, viewerId: string, viewedAt: Date): Promise<boolean> {
    const key = `${storyId}:${viewerId}`;
    if (this.views.has(key)) return Promise.resolve(false);
    this.views.set(key, viewedAt);
    return Promise.resolve(true);
  }

  incrementViewCount(storyId: string): Promise<void> {
    const row = this.rows.get(storyId);
    if (row) row.viewCount += 1;
    return Promise.resolve();
  }

  findActive(id: string, viewerId: string, now: Date): Promise<Story | null> {
    const row = this.rows.get(id);
    const story = row && !row.deletedAt ? this.toStory(row, viewerId) : null;
    return Promise.resolve(story && isActive(story, now) ? story : null);
  }

  listActiveByAuthor(authorId: string, viewerId: string, now: Date): Promise<Story[]> {
    return Promise.resolve(this.active(viewerId, now).filter((s) => s.author.id === authorId));
  }

  async tray(viewerId: string, now: Date, limit: number): Promise<StoryTrayEntry[]> {
    const byAuthor = new Map<string, StoryTrayEntry>();
    for (const story of this.active(viewerId, now)) {
      const { author } = story;
      const self = author.id === viewerId;
      if (!self && !this.relationships.isFollowing(viewerId, author.id)) continue;
      const relation = self
        ? SELF_RELATIONSHIP
        : await this.relationships.between(viewerId, author.id);
      if (!canViewStory(viewerId, story, relation)) continue;
      const entry = byAuthor.get(author.id);
      byAuthor.set(author.id, {
        author: { id: author.id, username: author.username, avatarVariants: author.avatarVariants },
        seen: (entry?.seen ?? true) && story.viewerHasSeen,
        hasCloseFriendsStory:
          (entry?.hasCloseFriendsStory ?? false) || story.audience === 'close_friends',
        latestStoryAt:
          entry && entry.latestStoryAt > story.createdAt ? entry.latestStoryAt : story.createdAt,
      });
    }
    return [...byAuthor.values()].sort(compareTrayEntries(viewerId)).slice(0, limit);
  }

  /** Stories non supprimées et actives, de la plus ancienne à la plus récente. */
  private active(viewerId: string, now: Date): Story[] {
    return [...this.rows.values()]
      .filter((row) => !row.deletedAt)
      .map((row) => this.toStory(row, viewerId))
      .filter((story) => isActive(story, now))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  }

  private toStory(row: StoryRow, viewerId: string): Story {
    const author = this.profiles.rows.get(row.authorId);
    if (!author) throw new Error(`Auteur absent : ${row.authorId}`);
    const variants = this.media.rows.get(row.mediaId)?.variants;
    if (!variants || !('thumb' in variants)) throw new Error(`Photo absente : ${row.mediaId}`);
    return {
      id: row.id,
      audience: row.audience,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      viewerHasSeen: row.authorId === viewerId || this.views.has(`${row.id}:${viewerId}`),
      media: { variants: variants satisfies ImageVariantPaths, ...TEST_IMAGE_SIZE },
      author: {
        id: author.id,
        username: author.username,
        status: author.status,
        isPrivate: author.isPrivate,
        avatarVariants: author.avatar?.variants ?? null,
      },
    };
  }
}
