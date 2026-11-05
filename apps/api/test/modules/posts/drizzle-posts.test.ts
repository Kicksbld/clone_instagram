import { DrizzleNotificationWriter } from '../../../src/modules/activity/infrastructure/persistence/drizzle-notification-writer.ts';
import { DrizzleRelationshipReader } from '../../../src/shared/infrastructure/persistence/drizzle-relationship-reader.ts';
import { InMemoryNotificationDispatcher } from '../../support/in-memory-notifications.ts';
import { DrizzleMentionWriter } from '../../../src/modules/engagement/infrastructure/persistence/drizzle-mention-writer.ts';
import { media, mentions, notifications, newId, posts, profiles, type Executor } from '@clone/db';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { MediaAlreadyAttachedError } from '../../../src/modules/media/domain/errors.ts';
import { DrizzleMediaRepository } from '../../../src/modules/media/infrastructure/persistence/drizzle-media-repository.ts';
import { CreatePost } from '../../../src/modules/posts/application/use-cases/create-post.ts';
import { DeletePost } from '../../../src/modules/posts/application/use-cases/delete-post.ts';
import { UpdatePostCaption } from '../../../src/modules/posts/application/use-cases/update-post-caption.ts';
import { PostNotFoundError } from '../../../src/modules/posts/domain/errors.ts';
import {
  DrizzlePostReader,
  DrizzlePostRepository,
} from '../../../src/modules/posts/infrastructure/persistence/drizzle-post-repository.ts';
import { DrizzleAccountReader } from '../../../src/modules/social/infrastructure/persistence/drizzle-account-reader.ts';
import { noopAnalyticsTracker } from '../../../src/shared/infrastructure/analytics/posthog-analytics-tracker.ts';
import { DrizzleUnitOfWork } from '../../../src/shared/infrastructure/persistence/drizzle-unit-of-work.ts';
import { uuidV7Generator } from '../../../src/shared/infrastructure/uuid-v7-generator.ts';
import { connectTestDatabase } from '../../support/database.ts';

const database = connectTestDatabase();
const { db } = database;
const reader = new DrizzlePostReader(db);
const created: string[] = [];
let now = Date.parse('2026-09-25T12:00:00.000Z');
const clock = { now: () => new Date(now) };
const createPost = new CreatePost(
  new DrizzleUnitOfWork(db, (tx: Executor) => ({
    accounts: new DrizzleAccountReader(tx),
    media: new DrizzleMediaRepository(tx),
    posts: new DrizzlePostRepository(tx),
    reader: new DrizzlePostReader(tx),
    mentions: new DrizzleMentionWriter(tx),
    relationships: new DrizzleRelationshipReader(tx),
    notifications: new DrizzleNotificationWriter(tx),
  })),
  uuidV7Generator,
  clock,
  noopAnalyticsTracker,
  new InMemoryNotificationDispatcher(),
);

const deletePost = new DeletePost(
  new DrizzleUnitOfWork(db, (tx: Executor) => ({
    media: new DrizzleMediaRepository(tx),
    posts: new DrizzlePostRepository(tx),
  })),
);

const updatePostCaption = new UpdatePostCaption(
  new DrizzleUnitOfWork(db, (tx: Executor) => ({
    posts: new DrizzlePostRepository(tx),
    reader: new DrizzlePostReader(tx),
    mentions: new DrizzleMentionWriter(tx),
    relationships: new DrizzleRelationshipReader(tx),
    notifications: new DrizzleNotificationWriter(tx),
  })),
  new InMemoryNotificationDispatcher(),
);

afterEach(async () => {
  // Supprimer les profils supprime leurs posts et leurs médias (ON DELETE CASCADE).
  if (created.length > 0) await db.delete(profiles).where(inArray(profiles.id, created.splice(0)));
});

afterAll(() => database.close());

async function givenProfile(): Promise<string> {
  const id = newId();
  created.push(id);
  await db.insert(profiles).values({
    id,
    username: `t_${id.replaceAll('-', '').slice(-20)}`,
    fullName: 'Test',
    birthDate: '2000-01-31',
  });
  return id;
}

async function givenReadyPhoto(ownerId: string): Promise<string> {
  const id = newId();
  await db.insert(media).values({
    id,
    ownerId,
    kind: 'image',
    purpose: 'post',
    status: 'ready',
    originalPath: `${ownerId}/${id}`,
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
    width: 1080,
    height: 1440,
    variants: { thumb: `${id}/thumb.webp`, medium: `${id}/medium.webp`, large: `${id}/large.webp` },
  });
  return id;
}

async function publish(authorId: string, caption = ''): Promise<string> {
  now += 1;
  const post = await createPost.execute({
    authorId,
    kind: 'post',
    caption,
    mediaIds: [await givenReadyPhoto(authorId)],
  });
  return post.id;
}

describe('CreatePost sur Postgres', () => {
  it('écrit le post, rattache le média et incrémente post_count dans une transaction', async () => {
    const author = await givenProfile();
    const photo = await givenReadyPhoto(author);

    const post = await createPost.execute({
      authorId: author,
      kind: 'post',
      caption: 'Légende',
      mediaIds: [photo],
    });

    expect(post).toMatchObject({
      kind: 'post',
      caption: 'Légende',
      author: { id: author, status: 'active', isPrivate: false, avatarVariants: null },
      media: [{ variants: { large: `${photo}/large.webp` }, width: 1080, height: 1440 }],
    });
    const [photoRow] = await db.select().from(media).where(eq(media.id, photo));
    expect(photoRow?.attachedAt).not.toBeNull();
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, author));
    expect(profile?.postCount).toBe(1);
  });

  it('carrousel : médias relus dans l’ordre de mediaIds', async () => {
    const author = await givenProfile();
    const photos = [
      await givenReadyPhoto(author),
      await givenReadyPhoto(author),
      await givenReadyPhoto(author),
    ].reverse();

    const post = await createPost.execute({
      authorId: author,
      kind: 'post',
      caption: '',
      mediaIds: photos,
    });

    expect(
      post.media.map((item) => ('large' in item.variants ? item.variants.large : undefined)),
    ).toEqual(photos.map((id) => `${id}/large.webp`));
  });

  it('média déjà utilisé : refus, rien n’est écrit', async () => {
    const author = await givenProfile();
    const photo = await givenReadyPhoto(author);
    await createPost.execute({ authorId: author, kind: 'post', caption: '', mediaIds: [photo] });

    await expect(
      createPost.execute({ authorId: author, kind: 'post', caption: '', mediaIds: [photo] }),
    ).rejects.toBeInstanceOf(MediaAlreadyAttachedError);

    const rows = await db.select().from(posts).where(eq(posts.authorId, author));
    expect(rows).toHaveLength(1);
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, author));
    expect(profile?.postCount).toBe(1);
  });
});

describe('DrizzlePostReader', () => {
  it('liste du plus récent au plus ancien, pagine par curseur, ignore les posts supprimés', async () => {
    const author = await givenProfile();
    const [first, second, third] = [
      await publish(author),
      await publish(author),
      await publish(author),
    ];
    const deleted = await publish(author);
    await db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, deleted));

    const page = await reader.listByAuthor({
      viewerId: author,
      authorId: author,
      after: null,
      limit: 2,
    });

    expect(page.items.map((post) => post.id)).toEqual([third, second]);
    expect(page.next?.id).toBe(second);

    const next = await reader.listByAuthor({
      viewerId: author,
      authorId: author,
      after: page.next,
      limit: 2,
    });

    expect(next.items.map((post) => post.id)).toEqual([first]);
    expect(next.next).toBeNull();
    await expect(reader.findById(deleted, author)).resolves.toBeNull();
  });

  it('même date : départagé par id', async () => {
    const author = await givenProfile();
    const a = await publish(author);
    const b = await publish(author);
    await db
      .update(posts)
      .set({ createdAt: new Date(now) })
      .where(inArray(posts.id, [a, b]));

    const page = await reader.listByAuthor({
      viewerId: author,
      authorId: author,
      after: null,
      limit: 1,
    });
    const next = await reader.listByAuthor({
      viewerId: author,
      authorId: author,
      after: page.next,
      limit: 1,
    });

    expect([...page.items, ...next.items].map((post) => post.id)).toEqual([b, a]);
  });

  it('post d’un autre auteur absent de la liste ; post inexistant → null', async () => {
    const [author, other] = [await givenProfile(), await givenProfile()];
    await publish(other);

    await expect(
      reader.listByAuthor({ viewerId: author, authorId: author, after: null, limit: 12 }),
    ).resolves.toEqual({ items: [], next: null });
    await expect(reader.findById(newId(), author)).resolves.toBeNull();
  });
});

describe('DeletePost sur Postgres', () => {
  it('suppression logique, médias détachés et post_count décrémenté dans une transaction', async () => {
    const author = await givenProfile();
    const photos = [await givenReadyPhoto(author), await givenReadyPhoto(author)];
    const post = await createPost.execute({
      authorId: author,
      kind: 'post',
      caption: '',
      mediaIds: photos,
    });

    await deletePost.execute({ authorId: author, postId: post.id });

    const [row] = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(row?.deletedAt).not.toBeNull();
    await expect(reader.findById(post.id, author)).resolves.toBeNull();
    const rows = await db.select().from(media).where(inArray(media.id, photos));
    expect(rows.every((photo) => photo.detachedAt !== null)).toBe(true);
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, author));
    expect(profile?.postCount).toBe(0);
  });

  it('double suppression : refus, le compteur ne baisse qu’une fois', async () => {
    const author = await givenProfile();
    const postId = await publish(author);
    await publish(author);

    await deletePost.execute({ authorId: author, postId });
    await expect(deletePost.execute({ authorId: author, postId })).rejects.toBeInstanceOf(
      PostNotFoundError,
    );

    const [profile] = await db.select().from(profiles).where(eq(profiles.id, author));
    expect(profile?.postCount).toBe(1);
  });

  it('post d’un autre auteur : refus, rien ne change', async () => {
    const [author, other] = [await givenProfile(), await givenProfile()];
    const postId = await publish(other);

    await expect(deletePost.execute({ authorId: author, postId })).rejects.toBeInstanceOf(
      PostNotFoundError,
    );

    await expect(reader.findById(postId, author)).resolves.not.toBeNull();
  });
});

describe('mentions des publications sur Postgres', () => {
  it('crée les mentions et notifications avec le post, puis les retire à la suppression', async () => {
    const [authorId, mentionedId] = [await givenProfile(), await givenProfile()];
    const [mentioned] = await db.select().from(profiles).where(eq(profiles.id, mentionedId));
    if (!mentioned) throw new Error('profil absent');
    const post = await createPost.execute({
      authorId,
      kind: 'post',
      caption: `Avec @${mentioned.username}`,
      mediaIds: [await givenReadyPhoto(authorId)],
    });
    expect(post.mentions?.map((user) => user.id)).toEqual([mentionedId]);
    expect(
      await db.select().from(notifications).where(eq(notifications.postId, post.id)),
    ).toMatchObject([{ type: 'mention', recipientId: mentionedId }]);
    await deletePost.execute({ authorId, postId: post.id });
    expect(await db.select().from(mentions).where(eq(mentions.postId, post.id))).toEqual([]);
    expect(await db.select().from(notifications).where(eq(notifications.postId, post.id))).toEqual(
      [],
    );
  });
});

describe('modification de la légende sur Postgres', () => {
  async function usernameOf(id: string): Promise<string> {
    const [row] = await db.select().from(profiles).where(eq(profiles.id, id));
    if (!row) throw new Error('profil absent');
    return row.username;
  }
  const mentionNotifications = (postId: string) =>
    db
      .select({ recipientId: notifications.recipientId })
      .from(notifications)
      .where(eq(notifications.postId, postId));

  it('met à jour légende et updated_at, recalcule mentions et notifications', async () => {
    const [authorId, keptId, addedId] = [
      await givenProfile(),
      await givenProfile(),
      await givenProfile(),
    ];
    const [kept, added] = [await usernameOf(keptId), await usernameOf(addedId)];
    const post = await createPost.execute({
      authorId,
      kind: 'post',
      caption: `Avec @${kept}`,
      mediaIds: [await givenReadyPhoto(authorId)],
    });

    const withBoth = await updatePostCaption.execute({
      authorId,
      postId: post.id,
      caption: `Avec @${kept} et @${added}`,
    });
    expect(withBoth.caption).toBe(`Avec @${kept} et @${added}`);
    expect(withBoth.mentions?.map((user) => user.id)).toEqual([keptId, addedId]);
    expect((await mentionNotifications(post.id)).map((row) => row.recipientId).sort()).toEqual(
      [keptId, addedId].sort(),
    );
    const [row] = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(row?.updatedAt.getTime()).toBeGreaterThan(row?.createdAt.getTime() ?? Infinity);

    const withoutKept = await updatePostCaption.execute({
      authorId,
      postId: post.id,
      caption: `Seulement @${added}`,
    });
    expect(withoutKept.mentions?.map((user) => user.id)).toEqual([addedId]);
    expect(await mentionNotifications(post.id)).toEqual([{ recipientId: addedId }]);
    expect(
      await db
        .select({ id: mentions.mentionedUserId })
        .from(mentions)
        .where(eq(mentions.postId, post.id)),
    ).toEqual([{ id: addedId }]);
  });

  it('post d’un autre ou supprimé → PostNotFoundError, rien n’est modifié', async () => {
    const [authorId, otherId] = [await givenProfile(), await givenProfile()];
    const post = await createPost.execute({
      authorId,
      kind: 'post',
      caption: 'Avant',
      mediaIds: [await givenReadyPhoto(authorId)],
    });

    await expect(
      updatePostCaption.execute({ authorId: otherId, postId: post.id, caption: 'Après' }),
    ).rejects.toBeInstanceOf(PostNotFoundError);
    await deletePost.execute({ authorId, postId: post.id });
    await expect(
      updatePostCaption.execute({ authorId, postId: post.id, caption: 'Après' }),
    ).rejects.toBeInstanceOf(PostNotFoundError);
    const [row] = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(row?.caption).toBe('Avant');
  });
});

it('persiste les descriptions par position et les conserve lors d’une modification de légende seule', async () => {
  const authorId = await givenProfile();
  const post = await createPost.execute({
    authorId,
    kind: 'post',
    caption: '',
    mediaIds: [await givenReadyPhoto(authorId), await givenReadyPhoto(authorId)],
    mediaAltTexts: ['Première', 'Deuxième'],
  });
  expect((await reader.findById(post.id, authorId))?.media.map((item) => item.altText)).toEqual([
    'Première',
    'Deuxième',
  ]);
  await updatePostCaption.execute({ authorId, postId: post.id, caption: 'Légende' });
  expect((await reader.findById(post.id, authorId))?.media[0]?.altText).toBe('Première');
  await updatePostCaption.execute({
    authorId,
    postId: post.id,
    caption: 'Légende',
    mediaAltTexts: ['', 'Modifiée'],
  });
  expect((await reader.findById(post.id, authorId))?.media.map((item) => item.altText)).toEqual([
    undefined,
    'Modifiée',
  ]);
});
