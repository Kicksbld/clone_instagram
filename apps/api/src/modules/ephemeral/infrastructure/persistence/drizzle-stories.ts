import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type { StoryViewer } from '../../domain/story.ts';
import { media, profiles, stories, storyViews, type Executor } from '@clone/db';
import { and, asc, desc, eq, gt, isNull, lte, sql, type SQL } from 'drizzle-orm';

import type {
  NewStory,
  StoryReader,
  StoryRepository,
} from '../../application/ports/story-repository.ts';
import type { Story, StoryTrayEntry } from '../../domain/story.ts';
import type {
  ImageVariantPaths,
  MediaVariantPaths,
} from '../../../../shared/domain/image-variants.ts';

/** Écritures des stories et des vues, sur une connexion ou dans une transaction. */
export class DrizzleStoryRepository implements StoryRepository {
  constructor(private readonly db: Executor) {}

  async create(story: NewStory): Promise<void> {
    await this.db.insert(stories).values(story);
  }

  async softDelete(id: string, authorId: string): Promise<{ mediaId: string | null } | null> {
    const [deleted] = await this.db
      .update(stories)
      .set({ deletedAt: sql`now()` })
      .where(and(eq(stories.id, id), eq(stories.authorId, authorId), isNull(stories.deletedAt)))
      .returning({ mediaId: stories.mediaId });
    return deleted ?? null;
  }

  async recordView(storyId: string, viewerId: string, viewedAt: Date): Promise<boolean> {
    const inserted = await this.db
      .insert(storyViews)
      .values({ storyId, viewerId, viewedAt })
      .onConflictDoNothing()
      .returning({ storyId: storyViews.storyId });
    return inserted.length > 0;
  }

  async incrementViewCount(storyId: string): Promise<void> {
    await this.db
      .update(stories)
      .set({ viewCount: sql`${stories.viewCount} + 1` })
      .where(eq(stories.id, storyId));
  }
}

/** Lectures des stories non supprimées. */
export class DrizzleStoryReader implements StoryReader {
  constructor(private readonly db: Executor) {}

  async listArchived(input: {
    authorId: string;
    now: Date;
    after: PageCursor | null;
    limit: number;
  }): Promise<Page<Story>> {
    const { authorId, now, after, limit } = input;
    // canViewStory : seul le propriétaire consulte son archive, sans restriction d’audience.
    const rows = await this.select(
      authorId,
      and(
        eq(stories.authorId, authorId),
        lte(stories.expiresAt, now),
        after
          ? sql`(${stories.createdAt}, ${stories.id}) < (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)`
          : undefined,
      ),
      { limit: limit + 1 },
    );
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      next: rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
  }

  async findOwned(id: string, authorId: string): Promise<Story | null> {
    const [story] = await this.select(
      authorId,
      and(eq(stories.id, id), eq(stories.authorId, authorId)),
    );
    return story ?? null;
  }

  async listViewers(input: {
    storyId: string;
    authorId: string;
    after: PageCursor | null;
    q?: string;
    limit: number;
  }): Promise<Page<StoryViewer>> {
    const { storyId, authorId, after, q, limit } = input;
    const rows = await this.db
      .select({
        id: profiles.id,
        username: profiles.username,
        fullName: profiles.fullName,
        avatarVariants: media.variants,
        viewedAt: storyViews.viewedAt,
      })
      .from(storyViews)
      .innerJoin(profiles, eq(profiles.id, storyViews.viewerId))
      .leftJoin(media, eq(media.id, profiles.avatarMediaId))
      .where(
        and(
          eq(storyViews.storyId, storyId),
          eq(profiles.status, 'active'),
          sql`NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ${authorId} AND b.blocked_id = ${profiles.id}) OR (b.blocked_id = ${authorId} AND b.blocker_id = ${profiles.id}))`,
          after
            ? sql`(${storyViews.viewedAt}, ${storyViews.viewerId}) < (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)`
            : undefined,
          q !== undefined
            ? sql`(strpos(lower(${profiles.username}), lower(${q})) > 0 OR strpos(lower(${profiles.fullName}), lower(${q})) > 0)`
            : undefined,
        ),
      )
      .orderBy(desc(storyViews.viewedAt), desc(storyViews.viewerId))
      .limit(limit + 1);
    const items = rows.slice(0, limit).map((row) => ({
      viewer: {
        id: row.id,
        username: row.username,
        fullName: row.fullName,
        avatarVariants:
          row.avatarVariants && 'thumb' in row.avatarVariants ? row.avatarVariants : null,
      },
      viewedAt: row.viewedAt,
    }));
    const last = items.at(-1);
    return {
      items,
      next: rows.length > limit && last ? { createdAt: last.viewedAt, id: last.viewer.id } : null,
    };
  }

  async findActive(id: string, viewerId: string, now: Date): Promise<Story | null> {
    const [story] = await this.select(viewerId, and(eq(stories.id, id), activeAt(now)));
    return story ?? null;
  }

  listActiveByAuthor(authorId: string, viewerId: string, now: Date): Promise<Story[]> {
    return this.select(viewerId, and(eq(stories.authorId, authorId), activeAt(now)));
  }

  /**
   * `canViewStory` traduit en SQL (ADR-006) : auteurs = moi et les comptes que je suis (l'abonnement
   * donne l'accès aux contenus d'un compte privé), actifs, sans blocage dans un sens ou dans l'autre ;
   * audience `everyone`, ou moi dans les amis proches de l'auteur. Index `(author_id, expires_at)`.
   */
  async tray(viewerId: string, now: Date, limit: number): Promise<StoryTrayEntry[]> {
    const rows = await this.db.execute<{
      author_id: string;
      username: string;
      avatar_variants: ImageVariantPaths | null;
      seen: boolean;
      has_close_friends_story: boolean;
      latest_story_at: string | Date;
    }>(sql`
      WITH authors AS (
        SELECT ${viewerId}::uuid AS id
        UNION
        SELECT f.followee_id FROM follows f
        JOIN profiles p ON p.id = f.followee_id AND p.status = 'active'
        WHERE f.follower_id = ${viewerId}
          AND NOT EXISTS (
            SELECT 1 FROM blocks b
            WHERE (b.blocker_id = ${viewerId} AND b.blocked_id = f.followee_id)
               OR (b.blocker_id = f.followee_id AND b.blocked_id = ${viewerId})
          )
      ),
      visible AS (
        SELECT s.author_id, s.created_at, s.audience,
          (s.author_id = ${viewerId} OR EXISTS (
            SELECT 1 FROM story_views v WHERE v.story_id = s.id AND v.viewer_id = ${viewerId}
          )) AS seen
        FROM authors a
        JOIN stories s ON s.author_id = a.id
        WHERE s.expires_at > ${now.toISOString()}::timestamptz
          AND s.deleted_at IS NULL
          AND (
            s.audience = 'everyone'
            OR s.author_id = ${viewerId}
            OR EXISTS (
              SELECT 1 FROM close_friends cf
              WHERE cf.owner_id = s.author_id AND cf.friend_id = ${viewerId}
            )
          )
      ),
      tray AS (
        SELECT author_id,
          bool_and(seen) AS seen,
          bool_or(audience = 'close_friends') AS has_close_friends_story,
          max(created_at) AS latest_story_at
        FROM visible
        GROUP BY author_id
      )
      SELECT t.author_id, p.username, av.variants AS avatar_variants, t.seen,
        t.has_close_friends_story, t.latest_story_at
      FROM tray t
      JOIN profiles p ON p.id = t.author_id
      LEFT JOIN media av ON av.id = p.avatar_media_id
      ORDER BY (t.author_id = ${viewerId}) DESC, t.seen ASC, t.latest_story_at DESC, t.author_id DESC
      LIMIT ${limit}
    `);
    return rows.map((row) => ({
      author: {
        id: row.author_id,
        username: row.username,
        avatarVariants:
          row.avatar_variants && 'thumb' in row.avatar_variants ? row.avatar_variants : null,
      },
      seen: row.seen,
      hasCloseFriendsStory: row.has_close_friends_story,
      latestStoryAt: new Date(row.latest_story_at),
    }));
  }

  /** Stories non supprimées filtrées par `where`, de la plus ancienne à la plus récente. */
  private async select(
    viewerId: string,
    where: SQL | undefined,
    archive?: { limit: number },
  ): Promise<Story[]> {
    const rows = await this.db
      .select({
        id: stories.id,
        audience: stories.audience,
        createdAt: stories.createdAt,
        expiresAt: stories.expiresAt,
        // Clé primaire `(story_id, viewer_id)` de `story_views`.
        viewed: sql<boolean>`EXISTS (
          SELECT 1 FROM ${storyViews} AS v WHERE v.story_id = ${stories.id} AND v.viewer_id = ${viewerId}
        )`,
        variants: media.variants,
        width: media.width,
        height: media.height,
        authorId: profiles.id,
        username: profiles.username,
        status: profiles.status,
        isPrivate: profiles.isPrivate,
        // Sous-requête plutôt qu'une seconde jointure sur `media` (que le typage de Drizzle refuse).
        avatarVariants: sql<MediaVariantPaths | null>`(
          SELECT av.variants FROM media AS av WHERE av.id = ${profiles.avatarMediaId}
        )`,
      })
      .from(stories)
      .innerJoin(profiles, eq(profiles.id, stories.authorId))
      .innerJoin(media, eq(media.id, stories.mediaId))
      .where(and(isNull(stories.deletedAt), where))
      .orderBy(
        archive ? desc(stories.createdAt) : asc(stories.createdAt),
        archive ? desc(stories.id) : asc(stories.id),
      )
      .limit(archive?.limit ?? 2147483647);

    return rows.map((row) => {
      // Un média rattaché est toujours une image `ready` : variantes et dimensions sont renseignées.
      const { variants, width, height } = row;
      if (!variants || !('thumb' in variants) || width === null || height === null)
        throw new Error(`Média de story incomplet (story ${row.id})`);
      return {
        id: row.id,
        audience: row.audience,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        viewerHasSeen: row.authorId === viewerId || row.viewed,
        media: { variants, width, height },
        author: {
          id: row.authorId,
          username: row.username,
          status: row.status,
          isPrivate: row.isPrivate,
          avatarVariants:
            row.avatarVariants && 'thumb' in row.avatarVariants ? row.avatarVariants : null,
        },
      };
    });
  }
}

function activeAt(now: Date): SQL {
  return gt(stories.expiresAt, now);
}
