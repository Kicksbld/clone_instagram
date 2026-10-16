import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { Executor } from './client.ts';
import { comments, postLikes } from './schema/engagement.ts';
import { posts } from './schema/posts.ts';
import { profiles } from './schema/profiles.ts';
import { follows } from './schema/social.ts';

/**
 * Données d'un compte supprimé (`purge-account`, T13) : suppression réelle (ADR-007) de la ligne
 * `profiles`, que les clés étrangères propagent (médias, posts, likes, commentaires, abonnements,
 * blocages, `subscriptions`, signalements). Seulement si le profil est `deleted` : `false` sinon, ou
 * s'il est déjà purgé. Les fichiers Storage sont effacés avant, par le worker.
 *
 * Les compteurs des autres comptes que le compte supprimé alimentait (abonnés, abonnements, likes,
 * commentaires et réponses) sont recomptés sur les seules lignes touchées, dans la même transaction :
 * un décrément calculé à la main compterait deux fois les commentaires déjà supprimés logiquement, et
 * oublierait les réponses des autres que la cascade de `parent_id` efface avec ses commentaires.
 */
export async function purgeAccountData(tx: Executor, profileId: string): Promise<boolean> {
  const accountIds = await relatedAccounts(tx, profileId);
  const postIds = await relatedPosts(tx, profileId);
  const parentIds = await relatedParentComments(tx, profileId);

  const deleted = await tx
    .delete(profiles)
    .where(and(eq(profiles.id, profileId), eq(profiles.status, 'deleted')))
    .returning({ id: profiles.id });
  if (deleted.length === 0) return false;

  if (accountIds.length > 0) {
    await tx
      .update(profiles)
      .set({
        followerCount: sql`(SELECT count(*) FROM ${follows} WHERE ${follows.followeeId} = ${profiles.id})`,
        followingCount: sql`(SELECT count(*) FROM ${follows} WHERE ${follows.followerId} = ${profiles.id})`,
      })
      .where(inArray(profiles.id, accountIds));
  }
  if (postIds.length > 0) {
    await tx
      .update(posts)
      .set({
        likeCount: sql`(SELECT count(*) FROM ${postLikes} WHERE ${postLikes.postId} = ${posts.id})`,
        // Réponses comprises, sans les commentaires supprimés (T9).
        commentCount: sql`(SELECT count(*) FROM ${comments} WHERE ${comments.postId} = ${posts.id} AND ${comments.deletedAt} IS NULL)`,
      })
      .where(inArray(posts.id, postIds));
  }
  if (parentIds.length > 0) {
    await tx
      .update(comments)
      .set({
        replyCount: sql`(SELECT count(*) FROM ${comments} AS replies WHERE replies.parent_id = ${comments.id} AND replies.deleted_at IS NULL)`,
      })
      .where(inArray(comments.id, parentIds));
  }
  return true;
}

/** Comptes suivis par le compte supprimé, et ses abonnés. */
async function relatedAccounts(tx: Executor, profileId: string): Promise<string[]> {
  const [followees, followers] = await Promise.all([
    tx.select({ id: follows.followeeId }).from(follows).where(eq(follows.followerId, profileId)),
    tx.select({ id: follows.followerId }).from(follows).where(eq(follows.followeeId, profileId)),
  ]);
  return unique([...followees, ...followers].map((row) => row.id));
}

/** Posts d'autres auteurs que le compte supprimé a aimés ou commentés. */
async function relatedPosts(tx: Executor, profileId: string): Promise<string[]> {
  const [liked, commented] = await Promise.all([
    tx
      .select({ id: posts.id })
      .from(postLikes)
      .innerJoin(posts, eq(posts.id, postLikes.postId))
      .where(and(eq(postLikes.userId, profileId), ne(posts.authorId, profileId))),
    tx
      .selectDistinct({ id: posts.id })
      .from(comments)
      .innerJoin(posts, eq(posts.id, comments.postId))
      .where(and(eq(comments.authorId, profileId), ne(posts.authorId, profileId))),
  ]);
  return unique([...liked, ...commented].map((row) => row.id));
}

/** Commentaires d'autres auteurs auxquels le compte supprimé a répondu. */
async function relatedParentComments(tx: Executor, profileId: string): Promise<string[]> {
  const parents = alias(comments, 'parents');
  const rows = await tx
    .selectDistinct({ id: parents.id })
    .from(comments)
    .innerJoin(parents, eq(parents.id, comments.parentId))
    .where(and(eq(comments.authorId, profileId), ne(parents.authorId, profileId)));
  return rows.map((row) => row.id);
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}
