import { SharedPosts } from '../../../src/modules/messaging/application/shared-posts.ts';
import { DrizzleSharedPostReader } from '../../../src/modules/messaging/infrastructure/persistence/drizzle-shared-post-reader.ts';
import { publicMediaUrls } from '../../../src/shared/infrastructure/http/public-media-urls.ts';
import { findMediaById, media, newId, profiles } from '@clone/db';
import { inArray } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';
import { DrizzleMediaRepository } from '../../../src/modules/media/infrastructure/persistence/drizzle-media-repository.ts';
import { GetOrCreateConversation } from '../../../src/modules/messaging/application/use-cases/get-or-create-conversation.ts';
import { SendMessage } from '../../../src/modules/messaging/application/use-cases/send-message.ts';
import { DrizzleMessagingRepository } from '../../../src/modules/messaging/infrastructure/persistence/drizzle-messaging-repository.ts';
import { DrizzleRelationshipReader } from '../../../src/shared/infrastructure/persistence/drizzle-relationship-reader.ts';
import { DrizzleUnitOfWork } from '../../../src/shared/infrastructure/persistence/drizzle-unit-of-work.ts';
import { connectTestDatabase } from '../../support/database.ts';

const database = connectTestDatabase();
const sharedPosts = new SharedPosts(
  new DrizzleSharedPostReader(database.db, publicMediaUrls('http://localhost:54321')),
  new DrizzleRelationshipReader(database.db),
);
const ids = [newId(), newId()];
afterAll(async () => {
  await database.db.delete(profiles).where(inArray(profiles.id, ids));
  await database.close();
});

it('envoie une photo : média rattaché dans la transaction, relu par message, renvoi sans doublon', async () => {
  const { db } = database;
  await db.insert(profiles).values(
    ids.map((id, i) => ({
      id,
      username: `p_${id.slice(-12)}_${i}`,
      fullName: 'Test',
      birthDate: '2000-01-01',
    })),
  );
  const [a, b] = ids as [string, string];
  const photoId = newId();
  const variants = {
    thumb: `${photoId}/thumb.webp`,
    medium: `${photoId}/medium.webp`,
    large: `${photoId}/large.webp`,
  };
  await db.insert(media).values({
    id: photoId,
    ownerId: a,
    kind: 'image',
    purpose: 'message',
    status: 'ready',
    originalPath: `${a}/${photoId}`,
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
    variants,
  });
  const transaction = new DrizzleUnitOfWork(db, (tx) => ({
    repository: new DrizzleMessagingRepository(tx),
    relationships: new DrizzleRelationshipReader(tx),
    media: new DrizzleMediaRepository(tx),
  }));
  const clock = { now: () => new Date('2026-11-04T12:00:00.000Z') };
  const conversationId = (
    await new GetOrCreateConversation(transaction, { next: newId }, clock, sharedPosts).execute({
      viewerId: a,
      userId: b,
    })
  ).conversation.id;
  const send = new SendMessage(
    transaction,
    { next: newId },
    clock,
    {
      publish: () => {},
      disconnect: () => {},
    },
    sharedPosts,
  );
  const input = {
    viewerId: a,
    conversationId,
    clientId: newId(),
    content: { kind: 'image' as const, mediaId: photoId },
  };

  const sent = await send.execute(input);
  expect(sent.message).toMatchObject({ kind: 'image', body: '', mediaId: photoId });
  expect((await findMediaById(db, photoId))?.attachedAt).not.toBeNull();

  const retry = await send.execute(input);
  expect(retry).toMatchObject({ created: false, message: { id: sent.message.id } });

  // Même photo, autre clientId : refusée, rien n'est inséré.
  await expect(send.execute({ ...input, clientId: newId() })).rejects.toMatchObject({
    code: 'media_already_attached',
  });

  const repository = new DrizzleMessagingRepository(db);
  await expect(repository.findMessagePhoto(photoId)).resolves.toEqual({
    conversationId,
    variants,
  });
  await expect(repository.findMessagePhoto(newId())).resolves.toBeNull();
  const page = await repository.listMessages(conversationId, null, false);
  expect(page.items.map((m) => m.id)).toEqual([sent.message.id]);
});
