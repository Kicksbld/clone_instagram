import { and, desc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';

import type { Executor } from '../client.ts';
import { newId } from '../ids.ts';
import { comments, postLikes, posts } from '../schema/index.ts';
import { fixedId } from './fixed-profiles.ts';
import { SEED_COMMENT_BODIES } from './plan.ts';

/**
 * Onglet Amis des Reels (T33) : le seed n'a pas de vidéo ; sur les 20 reels les plus récents déjà
 * (mires du seed des reels et reels publiés depuis l'app, hors ceux de Léa et Hugo), Léa met un J'aime et Hugo commente un reel sur
 * deux. Idempotent : J'aime par clé primaire, commentaire seulement si Hugo n'en a pas encore.
 */
export async function writeFriendsReelsSeed(db: Executor): Promise<number> {
  const [lea, hugo] = [fixedId('lea'), fixedId('hugo')];
  const reels = await db
    .select({ id: posts.id })
    .from(posts)
    .where(
      and(eq(posts.kind, 'reel'), isNull(posts.deletedAt), notInArray(posts.authorId, [lea, hugo])),
    )
    .orderBy(desc(posts.createdAt))
    .limit(20);
  for (const [index, { id }] of reels.entries()) {
    await db.insert(postLikes).values({ userId: lea, postId: id }).onConflictDoNothing();
    if (index % 2 !== 0) continue;
    const [existing] = await db
      .select({ id: comments.id })
      .from(comments)
      .where(and(eq(comments.postId, id), eq(comments.authorId, hugo)))
      .limit(1);
    if (!existing) {
      await db.insert(comments).values({
        id: newId(),
        postId: id,
        authorId: hugo,
        body: SEED_COMMENT_BODIES[index % SEED_COMMENT_BODIES.length] ?? 'Trop beau 😍',
      });
    }
  }
  if (reels.length === 0) return 0;
  // Compteurs dénormalisés recalculés (ADR-007).
  await db
    .update(posts)
    .set({
      likeCount: sql`(SELECT count(*) FROM ${postLikes} WHERE ${postLikes.postId} = ${posts.id})::int`,
      commentCount: sql`(SELECT count(*) FROM ${comments} WHERE ${comments.postId} = ${posts.id} AND ${comments.deletedAt} IS NULL)::int`,
    })
    .where(
      inArray(
        posts.id,
        reels.map((reel) => reel.id),
      ),
    );
  return reels.length;
}
