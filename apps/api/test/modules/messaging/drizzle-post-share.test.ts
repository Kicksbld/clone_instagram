import { media, newId, postMedia, posts, profiles } from '@clone/db';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';
import { DrizzleSharedPostReader } from '../../../src/modules/messaging/infrastructure/persistence/drizzle-shared-post-reader.ts';
import { DrizzleMessagingRepository } from '../../../src/modules/messaging/infrastructure/persistence/drizzle-messaging-repository.ts';
import { publicMediaUrls } from '../../../src/shared/infrastructure/http/public-media-urls.ts';
import { connectTestDatabase } from '../../support/database.ts';
const database = connectTestDatabase();
const a = newId();
const b = newId();
const postId = newId();
const photoId = newId();
afterAll(async () => {
  await database.db.delete(posts).where(eq(posts.id, postId));
  await database.db.delete(profiles).where(inArray(profiles.id, [a, b]));
  await database.close();
});
it('persists a post share and reads its current preview, then hides a deleted post', async () => {
  const { db } = database;
  await db.insert(profiles).values(
    [a, b].map((id) => ({
      id,
      username: `share_${id.slice(-12)}`,
      fullName: 'Test',
      birthDate: '2000-01-01',
    })),
  );
  await db.insert(posts).values({ id: postId, authorId: a, kind: 'reel', caption: 'Video' });
  await db.insert(media).values({
    id: photoId,
    ownerId: a,
    kind: 'video',
    purpose: 'post',
    status: 'ready',
    originalPath: 'test',
    mimeType: 'video/mp4',
    sizeBytes: 100,
    variants: { hls: 'test/master.m3u8', thumbnail: 'test/thumbnail.webp' },
  });
  await db.insert(postMedia).values({ postId, mediaId: photoId, position: 0 });
  const reader = new DrizzleSharedPostReader(db, publicMediaUrls('http://localhost:54321'));
  expect(await reader.find(postId)).toMatchObject({
    owner: { id: a },
    preview: {
      id: postId,
      kind: 'reel',
      caption: 'Video',
      thumbnail: 'http://localhost:54321/storage/v1/object/public/media-public/test/thumbnail.webp',
    },
  });
  const repository = new DrizzleMessagingRepository(db);
  const [low, high] = [a, b].sort();
  if (!low || !high) throw new Error('Missing member');
  const conversation = await repository.getOrCreate({
    id: newId(),
    memberLowId: low,
    memberHighId: high,
    createdAt: new Date(),
    lastMessageAt: null,
  });
  const sent = await repository.insertMessage({
    id: newId(),
    conversationId: conversation.conversation.id,
    senderId: a,
    clientId: newId(),
    kind: 'post_share',
    body: '',
    mediaId: null,
    sharedPostId: postId,
    createdAt: new Date(),
  });
  expect(
    (await repository.listMessages(conversation.conversation.id, null, false)).items[0],
  ).toMatchObject({ id: sent.message.id, kind: 'post_share', sharedPostId: postId });
  await db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, postId));
  expect(await reader.find(postId)).toBeNull();
  await db.delete(posts).where(eq(posts.id, postId));
  expect(await reader.find(postId)).toBeNull();
  expect(await repository.findMessage(sent.message.id)).toMatchObject({
    kind: 'post_share',
    sharedPostId: postId,
  });
});
