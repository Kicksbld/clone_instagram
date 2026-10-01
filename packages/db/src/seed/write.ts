// Écriture du plan en base, dans une transaction (images déjà dans Storage). Idempotente : lignes
// existantes ignorées, compteurs dénormalisés recalculés (ADR-007).
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import type { Executor } from '../client.ts';
import { blocks, follows, media, postMedia, posts, profiles } from '../schema/index.ts';
import { variantPaths } from './images.ts';
import { RATIOS, type SeedPlan } from './plan.ts';

/** Lignes insérées par paquets, sous la limite de paramètres de Postgres. */
const BATCH = 500;

function chunks<T>(rows: readonly T[]): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < rows.length; i += BATCH) result.push(rows.slice(i, i + BATCH));
  return result;
}

export async function findViewerId(db: Executor, username: string): Promise<string> {
  const [viewer] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.username, username.trim().toLowerCase()))
    .limit(1);
  if (!viewer) {
    throw new Error(
      `SEED_VIEWER_USERNAME : aucun profil « ${username} » (terminer l'onboarding avant le seed)`,
    );
  }
  return viewer.id;
}

/** Médias du plan déjà en base : leurs images sont déjà dans Storage. */
export async function existingMediaIds(db: Executor, ids: readonly string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const batch of chunks(ids)) {
    const rows = await db.select({ id: media.id }).from(media).where(inArray(media.id, batch));
    for (const row of rows) found.add(row.id);
  }
  return found;
}

/**
 * `sizes` : taille de la variante `large` des médias envoyés par cette exécution. `viewerId` :
 * compte de démo dont les compteurs sont aussi recalculés.
 */
export async function writeSeed(
  db: Executor,
  plan: SeedPlan,
  sizes: ReadonlyMap<string, number>,
  viewerId: string | null,
): Promise<void> {
  // Même id déjà présent : ignoré ; username pris par un autre compte : erreur explicite de la base.
  await db
    .insert(profiles)
    .values(
      plan.profiles.map((profile) => ({
        id: profile.id,
        username: profile.username,
        fullName: profile.fullName,
        bio: profile.bio,
        isPrivate: profile.isPrivate,
        status: profile.status,
        birthDate: '2000-01-31',
      })),
    )
    .onConflictDoNothing({ target: profiles.id });

  // Médias `ready` et attachés : `purge-orphan-media` ne les touche pas (ADR-008).
  for (const batch of chunks(plan.media)) {
    await db
      .insert(media)
      .values(
        batch.map((item) => ({
          id: item.id,
          ownerId: item.ownerId,
          kind: 'image' as const,
          purpose: item.purpose,
          status: 'ready' as const,
          originalPath: `${item.ownerId}/${item.id}`,
          mimeType: 'image/jpeg',
          sizeBytes: sizes.get(item.id) ?? 1,
          ...RATIOS[item.ratio],
          variants: variantPaths(item.id),
          processedAt: item.attachedAt,
          attachedAt: item.attachedAt,
        })),
      )
      .onConflictDoNothing({ target: media.id });
  }

  // Photo de profil posée seulement si le compte n'en a pas encore.
  for (const profile of plan.profiles) {
    if (!profile.avatarMediaId) continue;
    await db
      .update(profiles)
      .set({ avatarMediaId: profile.avatarMediaId })
      .where(and(eq(profiles.id, profile.id), isNull(profiles.avatarMediaId)));
  }

  for (const batch of chunks(plan.posts)) {
    await db
      .insert(posts)
      .values(
        batch.map((post) => ({
          id: post.id,
          authorId: post.authorId,
          kind: 'post' as const,
          caption: post.caption,
          createdAt: post.createdAt,
          updatedAt: post.createdAt,
        })),
      )
      .onConflictDoNothing({ target: posts.id });
  }
  const postMediaRows = plan.posts.flatMap((post) =>
    post.mediaIds.map((mediaId, position) => ({ postId: post.id, mediaId, position })),
  );
  for (const batch of chunks(postMediaRows)) {
    await db.insert(postMedia).values(batch).onConflictDoNothing();
  }

  for (const batch of chunks(plan.follows)) {
    await db
      .insert(follows)
      .values(batch.map(([followerId, followeeId]) => ({ followerId, followeeId })))
      .onConflictDoNothing();
  }
  await db
    .insert(blocks)
    .values(plan.blocks.map(([blockerId, blockedId]) => ({ blockerId, blockedId })))
    .onConflictDoNothing();

  // Compteurs dénormalisés (ADR-007) recalculés à partir de `follows` et `posts`.
  const touched = plan.profiles.map((p) => p.id);
  if (viewerId) touched.push(viewerId);
  await db
    .update(profiles)
    .set({
      followerCount: sql`(SELECT count(*) FROM ${follows} WHERE ${follows.followeeId} = ${profiles.id})::int`,
      followingCount: sql`(SELECT count(*) FROM ${follows} WHERE ${follows.followerId} = ${profiles.id})::int`,
      postCount: sql`(SELECT count(*) FROM ${posts} WHERE ${posts.authorId} = ${profiles.id} AND ${posts.deletedAt} IS NULL)::int`,
      updatedAt: sql`now()`,
    })
    .where(inArray(profiles.id, touched));
}
