import { beforeEach, describe, expect, it } from 'vitest';

import { LikePost } from '../../../src/modules/engagement/application/use-cases/like-post.ts';
import { UnlikePost } from '../../../src/modules/engagement/application/use-cases/unlike-post.ts';
import { ProfileNotFoundError } from '../../../src/modules/identity/domain/errors.ts';
import { PostNotFoundError } from '../../../src/modules/posts/domain/errors.ts';
import { InMemoryUnitOfWork } from '../../support/fakes.ts';
import { InMemoryLikes } from '../../support/in-memory-likes.ts';
import { InMemoryMediaRepository } from '../../support/in-memory-media-repository.ts';
import { InMemoryPosts } from '../../support/in-memory-posts.ts';
import { InMemoryProfileRepository } from '../../support/in-memory-profile-repository.ts';
import { InMemoryRelationshipReader } from '../../support/in-memory-relationship-reader.ts';
import { InMemorySocialGraph } from '../../support/in-memory-social-graph.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';
const AUTHOR = '0199a1b2-0000-7000-8000-000000000002';
const POST = '0199a1b2-0000-7000-a000-000000000001';

let profiles: InMemoryProfileRepository;
let relationships: InMemoryRelationshipReader;
let posts: InMemoryPosts;
let like: LikePost;
let unlike: UnlikePost;

beforeEach(() => {
  profiles = new InMemoryProfileRepository();
  relationships = new InMemoryRelationshipReader();
  const media = new InMemoryMediaRepository();
  posts = new InMemoryPosts(profiles, media);
  const likes = new InMemoryLikes(posts);
  const transaction = new InMemoryUnitOfWork({
    accounts: new InMemorySocialGraph(profiles, relationships),
    relationships,
    posts: likes,
    likes,
  });
  like = new LikePost(transaction);
  unlike = new UnlikePost(transaction);
  profiles.add({ id: ME, username: 'killian' });
  profiles.add({ id: AUTHOR, username: 'lea' });
  givenPost(AUTHOR);
});

/** Post de `authorId` (sans média : les likes ne lisent que l'auteur et le compteur). */
function givenPost(authorId: string, id = POST): void {
  posts.rows.set(id, {
    id,
    authorId,
    kind: 'post',
    caption: '',
    mediaIds: [],
    createdAt: new Date('2026-09-25T12:00:00.000Z'),
    deletedAt: null,
    likeCount: 0,
  });
}

const likeCount = () => posts.rows.get(POST)?.likeCount;
const input = { viewerId: ME, postId: POST };

describe('LikePost', () => {
  it('aime un post visible : like créé, compteur +1', async () => {
    await expect(like.execute(input)).resolves.toEqual({ liked: true, likeCount: 1 });
    expect(posts.likes.has(`${ME}:${POST}`)).toBe(true);
  });

  it('double like : sans effet, compteur augmenté une seule fois', async () => {
    await like.execute(input);

    await expect(like.execute(input)).resolves.toEqual({ liked: true, likeCount: 1 });
    expect(likeCount()).toBe(1);
  });

  it('aimer son propre post est permis', async () => {
    givenPost(ME);

    await expect(like.execute(input)).resolves.toEqual({ liked: true, likeCount: 1 });
  });

  it('post d’un compte privé suivi : permis', async () => {
    profiles.add({ id: AUTHOR, username: 'lea', isPrivate: true });
    relationships.follow(ME, AUTHOR);

    await expect(like.execute(input)).resolves.toEqual({ liked: true, likeCount: 1 });
  });

  it.each([
    ['inexistant', () => posts.rows.delete(POST)],
    [
      'supprimé',
      () => {
        const row = posts.rows.get(POST);
        if (row) posts.rows.set(POST, { ...row, deletedAt: new Date() });
      },
    ],
    [
      'dont l’auteur m’a bloqué',
      () => {
        relationships.block(AUTHOR, ME);
      },
    ],
    [
      'dont j’ai bloqué l’auteur',
      () => {
        relationships.block(ME, AUTHOR);
      },
    ],
    [
      'd’un compte privé non suivi',
      () => profiles.add({ id: AUTHOR, username: 'lea', isPrivate: true }),
    ],
    [
      'd’un auteur suspendu',
      () => profiles.add({ id: AUTHOR, username: 'lea', status: 'suspended' }),
    ],
    ['d’un auteur banni', () => profiles.add({ id: AUTHOR, username: 'lea', status: 'banned' })],
  ])('post %s → post_not_found, rien ne change', async (_case, arrange) => {
    arrange();

    await expect(like.execute(input)).rejects.toBeInstanceOf(PostNotFoundError);
    expect(posts.likes.size).toBe(0);
  });

  it('sans profil (onboarding non terminé) → profile_not_found', async () => {
    profiles.rows.delete(ME);

    await expect(like.execute(input)).rejects.toBeInstanceOf(ProfileNotFoundError);
  });
});

describe('UnlikePost', () => {
  it('n’aime plus : like supprimé, compteur −1', async () => {
    await like.execute(input);

    await expect(unlike.execute(input)).resolves.toEqual({ liked: false, likeCount: 0 });
    expect(posts.likes.size).toBe(0);
  });

  it('sans like : sans effet, compteur inchangé', async () => {
    await like.execute({ viewerId: AUTHOR, postId: POST });

    await expect(unlike.execute(input)).resolves.toEqual({ liked: false, likeCount: 1 });
    expect(likeCount()).toBe(1);
  });

  it.each([
    ['inexistant', () => posts.rows.delete(POST)],
    [
      'dont l’auteur m’a bloqué',
      () => {
        relationships.block(AUTHOR, ME);
      },
    ],
    [
      'd’un compte privé non suivi',
      () => profiles.add({ id: AUTHOR, username: 'lea', isPrivate: true }),
    ],
    [
      'd’un auteur suspendu',
      () => profiles.add({ id: AUTHOR, username: 'lea', status: 'suspended' }),
    ],
  ])('post %s → post_not_found, le like reste', async (_case, arrange) => {
    await like.execute(input);
    arrange();

    await expect(unlike.execute(input)).rejects.toBeInstanceOf(PostNotFoundError);
    expect(posts.likes.size).toBe(1);
  });
});
