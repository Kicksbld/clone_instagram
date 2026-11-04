import { media, newId, stories, profiles } from '@clone/db';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';
import { DrizzleSharedStoryReader } from '../../../src/modules/messaging/infrastructure/persistence/drizzle-shared-story-reader.ts';
import { DrizzleMessagingRepository } from '../../../src/modules/messaging/infrastructure/persistence/drizzle-messaging-repository.ts';
import { publicMediaUrls } from '../../../src/shared/infrastructure/http/public-media-urls.ts';
import { connectTestDatabase } from '../../support/database.ts';
const database = connectTestDatabase();
const a = newId();
const b = newId();
const storyId = newId();
const photoId = newId();
afterAll(async () => {
  await database.db.delete(profiles).where(inArray(profiles.id, [a, b]));
  await database.close();
});
it('persists a story reply and reads the current story preview', async () => {
  const { db } = database;
  await db.insert(profiles).values(
    [a, b].map((id) => ({
      id,
      username: `share_${id.slice(-12)}`,
      fullName: 'Test',
      birthDate: '2000-01-01',
    })),
  );
  await db.insert(media).values({
    id: photoId,
    ownerId: a,
    kind: 'image',
    purpose: 'story',
    status: 'ready',
    originalPath: 'test',
    mimeType: 'image/webp',
    sizeBytes: 100,
    variants: { thumb: 'test/thumb.webp', medium: 'test/medium.webp', large: 'test/large.webp' },
  });
  await db.insert(stories).values({
    id: storyId,
    authorId: a,
    mediaId: photoId,
    audience: 'close_friends',
    createdAt: new Date('2026-11-01'),
    expiresAt: new Date('2026-11-02'),
  });
  const reader = new DrizzleSharedStoryReader(db, publicMediaUrls('http://localhost:54321'));
  expect(await reader.find(storyId)).toMatchObject({
    owner: { id: a },
    preview: {
      id: storyId,
      thumbnail: 'http://localhost:54321/storage/v1/object/public/media-public/test/thumb.webp',
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
    kind: 'story_reply',
    body: 'Bonjour',
    mediaId: null,
    storyId,
    createdAt: new Date(),
  });
  expect(
    (await repository.listMessages(conversation.conversation.id, null, false)).items[0],
  ).toMatchObject({ id: sent.message.id, kind: 'story_reply', storyId });
  await db.update(stories).set({ deletedAt: new Date() }).where(eq(stories.id, storyId));
  expect(await reader.find(storyId)).toBeNull();

  expect(await repository.findMessage(sent.message.id)).toMatchObject({
    kind: 'story_reply',
    storyId,
  });
});
