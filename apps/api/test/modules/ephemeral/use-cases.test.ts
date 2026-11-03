import { beforeEach, describe, expect, it } from 'vitest';

import { ViewStory } from '../../../src/modules/ephemeral/application/use-cases/view-story.ts';
import { InMemoryUnitOfWork } from '../../support/fakes.ts';
import { InMemoryStories } from '../../support/in-memory-stories.ts';
import { InMemoryRelationshipReader } from '../../support/in-memory-relationship-reader.ts';
import { inMemoryAdapters, TEST_NOW } from '../../support/test-app.ts';

const AUTHOR = '0199a1b2-0000-7000-8000-000000000001';
const VIEWER = '0199a1b2-0000-7000-8000-000000000002';
const STORY = '0199a1b2-0000-7000-e100-000000000001';
const PHOTO = '0199a1b2-0000-7000-d000-000000000001';

let stories: InMemoryStories;
let viewStory: ViewStory;

beforeEach(async () => {
  const { profiles, media } = inMemoryAdapters();
  const relationships = new InMemoryRelationshipReader();
  profiles.add({ id: AUTHOR, username: 'killian' });
  profiles.add({ id: VIEWER, username: 'bruno' });
  media.addReady({ id: PHOTO, ownerId: AUTHOR, purpose: 'story' });
  stories = new InMemoryStories(profiles, media, relationships);
  await stories.create({
    id: STORY,
    authorId: AUTHOR,
    mediaId: PHOTO,
    audience: 'everyone',
    createdAt: TEST_NOW,
    expiresAt: new Date(TEST_NOW.getTime() + 24 * 60 * 60 * 1000),
  });
  viewStory = new ViewStory(
    new InMemoryUnitOfWork({ relationships, reader: stories, stories }),
    {
      now: () => TEST_NOW,
    },
    { isPlus: () => Promise.resolve(false) },
  );
});

const viewCount = () => stories.rows.get(STORY)?.viewCount;

describe('ViewStory', () => {
  it('compte une vue par compte : une vue en double ne compte pas deux fois', async () => {
    await viewStory.execute({ viewerId: VIEWER, storyId: STORY });
    await viewStory.execute({ viewerId: VIEWER, storyId: STORY });

    expect(viewCount()).toBe(1);
    expect(stories.views.size).toBe(1);
  });

  it('l’auteur qui regarde sa propre story n’est pas compté', async () => {
    await viewStory.execute({ viewerId: AUTHOR, storyId: STORY });

    expect(viewCount()).toBe(0);
    expect(stories.views.size).toBe(0);
  });
});
