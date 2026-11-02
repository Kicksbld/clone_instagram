import { randomBytes } from 'node:crypto';

import {
  blocks,
  comments,
  media,
  newId,
  notifications,
  postMedia,
  posts,
  profiles,
  type Executor,
} from '@clone/db';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import {
  DrizzleActivityReader,
  DrizzleActivityRepository,
} from '../../../src/modules/activity/infrastructure/persistence/drizzle-activity.ts';
import { DrizzleNotificationWriter } from '../../../src/modules/activity/infrastructure/persistence/drizzle-notification-writer.ts';
import type { ActivityGroup } from '../../../src/modules/activity/domain/activity.ts';
import { CreateComment } from '../../../src/modules/engagement/application/use-cases/create-comment.ts';
import { LikePost } from '../../../src/modules/engagement/application/use-cases/like-post.ts';
import {
  DrizzleCommentReader,
  DrizzleCommentRepository,
} from '../../../src/modules/engagement/infrastructure/persistence/drizzle-comments.ts';
import {
  DrizzleLikeablePostReader,
  DrizzleLikeRepository,
} from '../../../src/modules/engagement/infrastructure/persistence/drizzle-likes.ts';
import { FollowUser } from '../../../src/modules/social/application/use-cases/follow-user.ts';
import { DrizzleAccountReader } from '../../../src/modules/social/infrastructure/persistence/drizzle-account-reader.ts';
import {
  DrizzleFollowCounters,
  DrizzleFollowRepository,
} from '../../../src/modules/social/infrastructure/persistence/drizzle-follow-repository.ts';
import { DrizzleRelationshipReader } from '../../../src/shared/infrastructure/persistence/drizzle-relationship-reader.ts';
import { DrizzleUnitOfWork } from '../../../src/shared/infrastructure/persistence/drizzle-unit-of-work.ts';
import { systemClock } from '../../../src/shared/infrastructure/system-clock.ts';
import { uuidV7Generator } from '../../../src/shared/infrastructure/uuid-v7-generator.ts';
import { connectTestDatabase } from '../../support/database.ts';
import { InMemoryNotificationDispatcher } from '../../support/in-memory-notifications.ts';

const database = connectTestDatabase();
const { db } = database;
const writer = new DrizzleNotificationWriter(db);
const reader = new DrizzleActivityReader(db);
const repository = new DrizzleActivityRepository(db);
const dispatcher = new InMemoryNotificationDispatcher();
const like = new LikePost(
  new DrizzleUnitOfWork(db, (tx: Executor) => ({
    accounts: new DrizzleAccountReader(tx),
    relationships: new DrizzleRelationshipReader(tx),
    posts: new DrizzleLikeablePostReader(tx),
    likes: new DrizzleLikeRepository(tx),
    notifications: new DrizzleNotificationWriter(tx),
  })),
  dispatcher,
);
const comment = new CreateComment(
  new DrizzleUnitOfWork(db, (tx: Executor) => ({
    accounts: new DrizzleAccountReader(tx),
    relationships: new DrizzleRelationshipReader(tx),
    posts: new DrizzleLikeablePostReader(tx),
    comments: new DrizzleCommentRepository(tx),
    reader: new DrizzleCommentReader(tx),
    notifications: new DrizzleNotificationWriter(tx),
  })),
  uuidV7Generator,
  systemClock,
  dispatcher,
);
const follow = new FollowUser(
  new DrizzleUnitOfWork(db, (tx: Executor) => ({
    accounts: new DrizzleAccountReader(tx),
    relationships: new DrizzleRelationshipReader(tx),
    follows: new DrizzleFollowRepository(tx),
    counters: new DrizzleFollowCounters(tx),
    notifications: new DrizzleNotificationWriter(tx),
  })),
  dispatcher,
);
const created: string[] = [];

/** Préfixe propre à ce fichier de test : la base de dev n'est pas vidée entre deux exécutions. */
const RUN = `t${randomBytes(4).toString('hex')}`;

afterEach(async () => {
  // Supprimer les profils supprime leurs posts, médias, commentaires et notifications (cascade).
  if (created.length > 0) await db.delete(profiles).where(inArray(profiles.id, created.splice(0)));
});

afterAll(() => database.close());

async function newProfile(suffix: string): Promise<string> {
  const id = newId();
  created.push(id);
  await db.insert(profiles).values({
    id,
    username: `${RUN}_${suffix}`,
    fullName: 'Test',
    birthDate: '2000-01-31',
  });
  return id;
}

/** Post d'une image prête ; renvoie aussi le chemin de sa miniature. */
async function newPost(authorId: string): Promise<{ id: string; thumb: string }> {
  const mediaId = newId();
  const variants = {
    thumb: `${mediaId}/thumb.webp`,
    medium: `${mediaId}/medium.webp`,
    large: `${mediaId}/large.webp`,
  };
  await db.insert(media).values({
    id: mediaId,
    ownerId: authorId,
    kind: 'image',
    purpose: 'post',
    status: 'ready',
    originalPath: `${authorId}/${mediaId}`,
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
    width: 1080,
    height: 1350,
    variants,
    attachedAt: new Date(),
  });
  const id = newId();
  await db.insert(posts).values({ id, authorId, kind: 'post', caption: '' });
  await db.insert(postMedia).values({ postId: id, mediaId, position: 0 });
  return { id, thumb: variants.thumb };
}

const activityOf = async (recipientId: string, limit = 20) =>
  (await reader.list({ recipientId, after: null, limit })).items;
const groupOf = (items: ActivityGroup[], type: string) => items.find((item) => item.type === type);

describe('DrizzleNotificationWriter', () => {
  it('notify : crée la notification une seule fois (J’aime retiré puis remis)', async () => {
    const [actor, recipient] = [await newProfile('actor'), await newProfile('recipient')];
    const post = await newPost(recipient);
    const draft = {
      recipientId: recipient,
      actorId: actor,
      type: 'like',
      postId: post.id,
    } as const;

    await expect(writer.notify(draft)).resolves.toMatchObject(draft);
    await expect(writer.notify(draft)).resolves.toBeNull();
    await writer.retract(draft);
    await expect(writer.notify(draft)).resolves.toMatchObject(draft);

    expect(await activityOf(recipient)).toHaveLength(1);
  });

  it('jamais vers soi-même', async () => {
    const me = await newProfile('me');

    await expect(
      writer.notify({ recipientId: me, actorId: me, type: 'follow' }),
    ).resolves.toBeNull();
  });

  it.each([
    ['le destinataire a bloqué l’acteur', (actor: string, recipient: string) => [recipient, actor]],
    ['l’acteur a bloqué le destinataire', (actor: string, recipient: string) => [actor, recipient]],
  ])('jamais si %s', async (_case, pair) => {
    const [actor, recipient] = [await newProfile('actor'), await newProfile('recipient')];
    const [blockerId, blockedId] = pair(actor, recipient) as [string, string];
    await db.insert(blocks).values({ blockerId, blockedId });

    await expect(
      writer.notify({ recipientId: recipient, actorId: actor, type: 'follow' }),
    ).resolves.toBeNull();
  });

  it('transaction annulée → aucune notification', async () => {
    const [actor, recipient] = [await newProfile('actor'), await newProfile('recipient')];
    const transaction = new DrizzleUnitOfWork(
      db,
      (tx: Executor) => new DrizzleNotificationWriter(tx),
    );

    await expect(
      transaction.run(async (scoped) => {
        await scoped.notify({ recipientId: recipient, actorId: actor, type: 'follow' });
        throw new Error('annulée');
      }),
    ).rejects.toThrow('annulée');

    await expect(
      db.select().from(notifications).where(eq(notifications.recipientId, recipient)),
    ).resolves.toEqual([]);
  });
});

describe('DrizzleActivityReader', () => {
  it('regroupe les J’aime d’un post : dernier acteur, nombre d’acteurs, miniature', async () => {
    const [me, lea, tom] = [
      await newProfile('me'),
      await newProfile('lea'),
      await newProfile('tom'),
    ];
    const post = await newPost(me);
    await like.execute({ viewerId: tom, postId: post.id });
    await like.execute({ viewerId: lea, postId: post.id });

    const [group] = await activityOf(me);

    expect(group).toMatchObject({
      key: `like:${post.id}`,
      type: 'like',
      actor: { id: lea, username: `${RUN}_lea`, avatar: null },
      actorCount: 2,
      read: false,
      post: { id: post.id, thumbnail: { thumb: post.thumb } },
      comment: null,
    });
  });

  it('commentaires, réponses et abonnements : un groupe chacun, du plus récent au plus ancien', async () => {
    const [me, lea] = [await newProfile('me'), await newProfile('lea')];
    const post = await newPost(me);
    await follow.execute({ viewerId: lea, userId: me });
    const first = await comment.execute({ authorId: lea, postId: post.id, body: 'Un' });
    await comment.execute({ authorId: lea, postId: post.id, body: 'Deux' });
    const mine = await comment.execute({ authorId: me, postId: post.id, body: 'À moi' });
    await comment.execute({ authorId: lea, postId: post.id, body: 'Merci', parentId: mine.id });

    const items = await activityOf(me);

    expect(items.map((item) => [item.type, item.comment?.body ?? null])).toEqual([
      ['comment_reply', 'Merci'],
      ['comment', 'Deux'],
      ['comment', 'Un'],
      ['follow', null],
    ]);
    expect(items[2]).toMatchObject({ actorCount: 1, comment: { id: first.id } });
    expect(groupOf(items, 'follow')).toMatchObject({ post: null, actor: { id: lea } });
  });

  it('acteurs bloqués ou suspendus masqués, J’aime d’un autre acteur conservé', async () => {
    const [me, lea, tom, ines] = [
      await newProfile('me'),
      await newProfile('lea'),
      await newProfile('tom'),
      await newProfile('ines'),
    ];
    const post = await newPost(me);
    await like.execute({ viewerId: lea, postId: post.id });
    await like.execute({ viewerId: ines, postId: post.id });
    await like.execute({ viewerId: tom, postId: post.id });
    await db.insert(blocks).values({ blockerId: me, blockedId: tom });
    await db.update(profiles).set({ status: 'suspended' }).where(eq(profiles.id, ines));

    const [group] = await activityOf(me);

    expect(group).toMatchObject({ actor: { id: lea }, actorCount: 1 });
  });

  it('post ou commentaire supprimé : notification masquée', async () => {
    const [me, lea] = [await newProfile('me'), await newProfile('lea')];
    const deletedPost = await newPost(me);
    await like.execute({ viewerId: lea, postId: deletedPost.id });
    const post = await newPost(me);
    const removed = await comment.execute({ authorId: lea, postId: post.id, body: 'Effacé' });
    await db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, deletedPost.id));
    await db.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, removed.id));

    expect(await activityOf(me)).toEqual([]);
    await expect(reader.countUnread(me)).resolves.toBe(0);
  });

  it('réponse sur le post d’un compte privé que je ne suis plus : masquée', async () => {
    const [me, owner, lea] = [
      await newProfile('me'),
      await newProfile('owner'),
      await newProfile('lea'),
    ];
    const post = await newPost(owner);
    const mine = await comment.execute({ authorId: me, postId: post.id, body: 'Moi' });
    await comment.execute({ authorId: lea, postId: post.id, body: 'Toi', parentId: mine.id });
    expect(await activityOf(me)).toHaveLength(1);

    await db.update(profiles).set({ isPrivate: true }).where(eq(profiles.id, owner));

    expect(await activityOf(me)).toEqual([]);
  });

  it('pages par curseur (date la plus récente, clé du groupe), sans doublon ni trou', async () => {
    const me = await newProfile('me');
    const actors = [];
    for (const name of ['a', 'b', 'c', 'd', 'e']) actors.push(await newProfile(name));
    for (const actor of actors) await follow.execute({ viewerId: actor, userId: me });

    const first = await reader.list({ recipientId: me, after: null, limit: 2 });
    const second = await reader.list({ recipientId: me, after: first.next, limit: 2 });
    const third = await reader.list({ recipientId: me, after: second.next, limit: 2 });

    const seen = [...first.items, ...second.items, ...third.items].map((item) => item.actor.id);
    expect(seen).toEqual([...actors].reverse());
    expect(third.next).toBeNull();
  });

  it('unreadCount : groupes non lus ; markAllRead les marque tous comme lus', async () => {
    const [me, lea, tom] = [
      await newProfile('me'),
      await newProfile('lea'),
      await newProfile('tom'),
    ];
    const post = await newPost(me);
    await like.execute({ viewerId: lea, postId: post.id });
    await like.execute({ viewerId: tom, postId: post.id });
    await follow.execute({ viewerId: tom, userId: me });
    await expect(reader.countUnread(me)).resolves.toBe(2);

    await repository.markAllRead(me);

    await expect(reader.countUnread(me)).resolves.toBe(0);
    expect((await activityOf(me)).every((item) => item.read)).toBe(true);

    await like.execute({ viewerId: me, postId: (await newPost(lea)).id });
    await expect(reader.countUnread(lea)).resolves.toBe(1);
  });
});
