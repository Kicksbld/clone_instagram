import { describe, expect, it } from 'vitest';
import { MediaCompletionEvents } from '../../../src/modules/media/infrastructure/queue-events/media-queue-events.ts';
import type { RealtimeEvent } from '../../../src/shared/application/realtime-publisher.ts';
import { publicMediaUrls } from '../../../src/shared/infrastructure/http/public-media-urls.ts';
import { InMemoryMediaRepository } from '../../support/in-memory-media-repository.ts';
import { TEST_MEDIA_BASE_URL } from '../../support/test-app.ts';

const OWNER = '0199a1b2-0000-7000-8000-000000000001';
const MEDIA = '0199a1b2-0000-7000-a000-000000000001';

function completion() {
  const media = new InMemoryMediaRepository();
  const published: { userIds: string[]; event: RealtimeEvent }[] = [];
  const events = new MediaCompletionEvents(media, publicMediaUrls(TEST_MEDIA_BASE_URL), {
    publish: (userIds, event) => published.push({ userIds, event }),
    disconnect: () => {},
  });
  return { media, published, events };
}

describe('MediaCompletionEvents.completed', () => {
  it('photo de message → media.ready au propriétaire, sans aucune URL publique', async () => {
    const { media, published, events } = completion();
    media.addReady({ id: MEDIA, ownerId: OWNER, purpose: 'message' });

    await events.completed({ mediaId: MEDIA, ownerId: OWNER });

    expect(published).toEqual([
      { userIds: [OWNER], event: { type: 'media.ready', data: { mediaId: MEDIA } } },
    ]);
  });

  it('photo de post → media.ready avec les URL publiques des variantes', async () => {
    const { media, published, events } = completion();
    media.addReady({ id: MEDIA, ownerId: OWNER, purpose: 'post' });

    await events.completed({ mediaId: MEDIA, ownerId: OWNER });

    expect(published[0]?.event).toMatchObject({
      type: 'media.ready',
      data: {
        mediaId: MEDIA,
        variants: {
          large: `${TEST_MEDIA_BASE_URL}/storage/v1/object/public/media-public/${MEDIA}/large.webp`,
        },
      },
    });
  });
});
