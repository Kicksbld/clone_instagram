import { media, postMedia, posts, profiles, type Executor } from '@clone/db';
import { and, eq, isNull } from 'drizzle-orm';
import type { SharedPostReader } from '../../application/ports/shared-post-reader.ts';
import type { PublicMediaUrls } from '../../../../shared/infrastructure/http/public-media-urls.ts';

export class DrizzleSharedPostReader implements SharedPostReader {
  constructor(
    private readonly db: Executor,
    private readonly urls: PublicMediaUrls,
  ) {}
  async find(id: string) {
    const [row] = await this.db
      .select({
        id: posts.id,
        kind: posts.kind,
        caption: posts.caption,
        owner: { id: profiles.id, status: profiles.status, isPrivate: profiles.isPrivate },
        username: profiles.username,
        variants: media.variants,
      })
      .from(posts)
      .innerJoin(profiles, eq(profiles.id, posts.authorId))
      .leftJoin(postMedia, and(eq(postMedia.postId, posts.id), eq(postMedia.position, 0)))
      .leftJoin(media, eq(media.id, postMedia.mediaId))
      .where(and(eq(posts.id, id), isNull(posts.deletedAt)));
    if (!row) return null;
    const variants = row.variants ? this.urls.of(row.variants) : null;
    return {
      owner: row.owner,
      preview: {
        id: row.id,
        kind: row.kind,
        caption: row.caption,
        author: { id: row.owner.id, username: row.username },
        ...(variants && { thumbnail: 'thumb' in variants ? variants.thumb : variants.thumbnail }),
      },
    };
  }
}
