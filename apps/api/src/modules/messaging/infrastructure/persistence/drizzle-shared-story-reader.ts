import { media, profiles, stories, type Executor } from '@clone/db';
import { and, eq, isNull } from 'drizzle-orm';
import type { SharedStoryReader } from '../../application/ports/shared-story-reader.ts';
import type { PublicMediaUrls } from '../../../../shared/infrastructure/http/public-media-urls.ts';

export class DrizzleSharedStoryReader implements SharedStoryReader {
  constructor(
    private readonly db: Executor,
    private readonly urls: PublicMediaUrls,
  ) {}
  async find(id: string) {
    const [row] = await this.db
      .select({
        id: stories.id,
        audience: stories.audience,
        expiresAt: stories.expiresAt,
        owner: { id: profiles.id, status: profiles.status, isPrivate: profiles.isPrivate },
        username: profiles.username,
        variants: media.variants,
      })
      .from(stories)
      .innerJoin(profiles, eq(profiles.id, stories.authorId))
      .innerJoin(media, eq(media.id, stories.mediaId))
      .where(and(eq(stories.id, id), isNull(stories.deletedAt)));
    if (!row?.variants || !('thumb' in row.variants)) return null;
    return {
      owner: row.owner,
      audience: row.audience,
      preview: {
        id: row.id,
        author: { id: row.owner.id, username: row.username },
        thumbnail: this.urls.of(row.variants).thumb,
        expiresAt: row.expiresAt.toISOString(),
      },
    };
  }
}
