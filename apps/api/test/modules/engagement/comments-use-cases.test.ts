import { InMemoryMentions } from '../../support/in-memory-mentions.ts';
import { beforeEach, describe, expect, it } from 'vitest';

import { CreateComment } from '../../../src/modules/engagement/application/use-cases/create-comment.ts';
import { DeleteComment } from '../../../src/modules/engagement/application/use-cases/delete-comment.ts';
import { ListComments } from '../../../src/modules/engagement/application/use-cases/list-comments.ts';
import { ListReplies } from '../../../src/modules/engagement/application/use-cases/list-replies.ts';
import { normalizeCommentBody } from '../../../src/modules/engagement/domain/comment.ts';
import {
  CommentNotFoundError,
  InvalidCommentBodyError,
  ReplyToReplyError,
} from '../../../src/modules/engagement/domain/errors.ts';
import { ProfileNotFoundError } from '../../../src/modules/identity/domain/errors.ts';
import { PostNotFoundError } from '../../../src/modules/posts/domain/errors.ts';
import { InMemoryUnitOfWork, sequentialIds } from '../../support/fakes.ts';
import { InMemoryComments } from '../../support/in-memory-comments.ts';
import { InMemoryLikes } from '../../support/in-memory-likes.ts';
import { InMemoryMediaRepository } from '../../support/in-memory-media-repository.ts';
import {
  InMemoryNotificationDispatcher,
  InMemoryNotifications,
} from '../../support/in-memory-notifications.ts';
import { InMemoryPosts } from '../../support/in-memory-posts.ts';
import { InMemoryProfileRepository } from '../../support/in-memory-profile-repository.ts';
import { InMemoryRelationshipReader } from '../../support/in-memory-relationship-reader.ts';
import { InMemorySocialGraph } from '../../support/in-memory-social-graph.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';
const AUTHOR = '0199a1b2-0000-7000-8000-000000000002';
const OTHER = '0199a1b2-0000-7000-8000-000000000003';
const POST = '0199a1b2-0000-7000-a000-000000000001';
const OTHER_POST = '0199a1b2-0000-7000-a000-000000000002';

let profiles: InMemoryProfileRepository;
let relationships: InMemoryRelationshipReader;
let posts: InMemoryPosts;
let comments: InMemoryComments;
let notifications: InMemoryNotifications;
let dispatcher: InMemoryNotificationDispatcher;
let create: CreateComment;
let listComments: ListComments;
let listReplies: ListReplies;
let remove: DeleteComment;
let tick: number;

beforeEach(() => {
  profiles = new InMemoryProfileRepository();
  relationships = new InMemoryRelationshipReader();
  posts = new InMemoryPosts(profiles, new InMemoryMediaRepository());
  const likes = new InMemoryLikes(posts);
  comments = new InMemoryComments(profiles, posts, relationships);
  notifications = new InMemoryNotifications(relationships);
  dispatcher = new InMemoryNotificationDispatcher();
  const transaction = new InMemoryUnitOfWork({
    accounts: new InMemorySocialGraph(profiles, relationships),
    relationships,
    posts: likes,
    comments,
    reader: comments,
    mentions: new InMemoryMentions(profiles, relationships, posts, comments),
    notifications,
  });
  // Une milliseconde de plus à chaque commentaire : ordre chronologique explicite.
  tick = Date.parse('2026-09-25T12:00:00.000Z');
  const clock = { now: () => new Date((tick += 1)) };
  create = new CreateComment(
    transaction,
    sequentialIds('0199a1b2-0000-7000-b100-'),
    clock,
    dispatcher,
  );
  listComments = new ListComments(relationships, likes, comments);
  listReplies = new ListReplies(relationships, comments, comments);
  remove = new DeleteComment(transaction);
  profiles.add({ id: ME, username: 'killian' });
  profiles.add({ id: AUTHOR, username: 'lea' });
  profiles.add({ id: OTHER, username: 'ines' });
  givenPost(AUTHOR, POST);
  givenPost(AUTHOR, OTHER_POST);
});

function givenPost(authorId: string, id: string): void {
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

const commentCount = (postId = POST) => posts.rows.get(postId)?.commentCount ?? 0;
const comment = (authorId: string, body = 'Super', parentId?: string) =>
  create.execute({ authorId, postId: POST, body, ...(parentId && { parentId }) });
const list = (viewerId = ME) => listComments.execute({ viewerId, postId: POST, after: null });

describe('normalizeCommentBody', () => {
  it('retire les espaces de début et de fin', () => {
    expect(normalizeCommentBody('  Bravo \n')).toBe('Bravo');
  });

  it.each([[''], ['   '], ['a'.repeat(2201)]])('refuse %j', (body) => {
    expect(() => normalizeCommentBody(body)).toThrow(InvalidCommentBodyError);
  });

  it('accepte 2 200 caractères, comptés en points de code', () => {
    expect(normalizeCommentBody('😀'.repeat(2200))).toHaveLength(4400);
  });
});

describe('CreateComment', () => {
  it('commente un post visible : comment_count +1, je peux supprimer mon commentaire', async () => {
    const created = await comment(ME, '  Bravo ');

    expect(created).toMatchObject({
      postId: POST,
      parentId: null,
      body: 'Bravo',
      replyCount: 0,
      viewerCanDelete: true,
      author: { id: ME, username: 'killian' },
    });
    expect(commentCount()).toBe(1);
  });

  it('répond à un commentaire : reply_count du parent +1, comment_count compte la réponse', async () => {
    const parent = await comment(AUTHOR);

    const reply = await comment(ME, 'Merci', parent.id);

    expect(reply.parentId).toBe(parent.id);
    expect(comments.rows.get(parent.id)?.replyCount).toBe(1);
    expect(commentCount()).toBe(2);
  });

  it('commentaire : notifie l’auteur du post, diffusé après la transaction', async () => {
    const created = await comment(ME);

    const notified = {
      recipientId: AUTHOR,
      actorId: ME,
      type: 'comment',
      postId: POST,
      commentId: created.id,
    };
    expect(notifications.receivedBy(AUTHOR)).toEqual([notified]);
    expect(dispatcher.dispatched).toEqual([expect.objectContaining(notified)]);
  });

  it('réponse : notifie l’auteur du commentaire parent, pas celui du post', async () => {
    const parent = await comment(OTHER);

    const reply = await comment(ME, 'Merci', parent.id);

    expect(notifications.receivedBy(OTHER)).toEqual([
      { recipientId: OTHER, actorId: ME, type: 'comment_reply', postId: POST, commentId: reply.id },
    ]);
    expect(notifications.receivedBy(AUTHOR)).toEqual([
      expect.objectContaining({ actorId: OTHER, type: 'comment' }),
    ]);
  });

  it('commenter son propre post ou répondre à soi-même : aucune notification', async () => {
    const own = await create.execute({ authorId: AUTHOR, postId: POST, body: 'Moi' });
    await comment(AUTHOR, 'Encore moi', own.id);

    expect(notifications.rows.size).toBe(0);
    expect(dispatcher.dispatched).toEqual([]);
  });

  it('réponse à une réponse → reply_to_reply', async () => {
    const parent = await comment(AUTHOR);
    const reply = await comment(ME, 'Merci', parent.id);

    await expect(comment(ME, 'Encore', reply.id)).rejects.toBeInstanceOf(ReplyToReplyError);
    expect(commentCount()).toBe(2);
  });

  it('parent d’un autre post → comment_not_found', async () => {
    const parent = await create.execute({ authorId: ME, postId: OTHER_POST, body: 'Ailleurs' });

    await expect(comment(ME, 'Ici', parent.id)).rejects.toBeInstanceOf(CommentNotFoundError);
  });

  it('parent supprimé → comment_not_found', async () => {
    const parent = await comment(ME);
    await remove.execute({ viewerId: ME, commentId: parent.id });

    await expect(comment(ME, 'Ici', parent.id)).rejects.toBeInstanceOf(CommentNotFoundError);
  });

  it('parent d’un auteur qui m’a bloqué → comment_not_found', async () => {
    const parent = await comment(OTHER);
    relationships.block(OTHER, ME);

    await expect(comment(ME, 'Ici', parent.id)).rejects.toBeInstanceOf(CommentNotFoundError);
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
      'd’un compte privé non suivi',
      () => profiles.add({ id: AUTHOR, username: 'lea', isPrivate: true }),
    ],
    [
      'd’un auteur suspendu',
      () => profiles.add({ id: AUTHOR, username: 'lea', status: 'suspended' }),
    ],
  ])('post %s → post_not_found', async (_case, arrange) => {
    arrange();

    await expect(comment(ME)).rejects.toBeInstanceOf(PostNotFoundError);
    expect(comments.rows.size).toBe(0);
  });

  it('sans profil → profile_not_found', async () => {
    profiles.rows.delete(ME);

    await expect(comment(ME)).rejects.toBeInstanceOf(ProfileNotFoundError);
  });
});

describe('ListComments', () => {
  it('premier niveau seulement, du plus récent au plus ancien', async () => {
    const first = await comment(AUTHOR, 'Premier');
    const second = await comment(OTHER, 'Deuxième');
    await comment(ME, 'Réponse', first.id);

    const page = await list();

    expect(page.items.map((c) => c.id)).toEqual([second.id, first.id]);
    expect(page.items[1]).toMatchObject({ replyCount: 1 });
    expect(page.next).toBeNull();
  });

  it('pages de 20 avec curseur', async () => {
    for (let i = 0; i < 21; i++) await comment(OTHER, `n°${i}`);

    const first = await list();
    expect(first.items).toHaveLength(20);
    expect(first.next).not.toBeNull();

    const second = await listComments.execute({ viewerId: ME, postId: POST, after: first.next });
    expect(second.items.map((c) => c.body)).toEqual(['n°0']);
    expect(second.next).toBeNull();
  });

  it('commentaires d’auteurs bloqués (dans les deux sens) ou suspendus masqués', async () => {
    await comment(OTHER, 'Bloqué');
    const blocker = '0199a1b2-0000-7000-8000-000000000004';
    const suspended = '0199a1b2-0000-7000-8000-000000000005';
    profiles.add({ id: blocker, username: 'blocker' });
    profiles.add({ id: suspended, username: 'suspendu' });
    await comment(blocker, 'M’a bloqué');
    await comment(suspended, 'Suspendu');
    const visible = await comment(AUTHOR, 'Visible');
    relationships.block(ME, OTHER);
    relationships.block(blocker, ME);
    profiles.add({ id: suspended, username: 'suspendu', status: 'suspended' });

    expect((await list()).items.map((c) => c.id)).toEqual([visible.id]);
  });

  it('viewerCanDelete : auteur du commentaire ou du post', async () => {
    await comment(OTHER, 'Autre');
    await comment(ME, 'Moi');

    expect((await list(ME)).items.map((c) => c.viewerCanDelete)).toEqual([true, false]);
    expect((await list(AUTHOR)).items.map((c) => c.viewerCanDelete)).toEqual([true, true]);
  });

  it('post invisible → post_not_found', async () => {
    relationships.block(AUTHOR, ME);

    await expect(list()).rejects.toBeInstanceOf(PostNotFoundError);
  });
});

describe('ListReplies', () => {
  it('réponses du plus récent au plus ancien', async () => {
    const parent = await comment(AUTHOR);
    const first = await comment(ME, 'Un', parent.id);
    const second = await comment(OTHER, 'Deux', parent.id);

    const page = await listReplies.execute({ viewerId: ME, commentId: parent.id, after: null });

    expect(page.items.map((c) => c.id)).toEqual([second.id, first.id]);
  });

  it.each([
    [
      'dont l’auteur m’a bloqué',
      () => {
        relationships.block(OTHER, ME);
      },
    ],
    [
      'dont le post est invisible',
      () => {
        relationships.block(AUTHOR, ME);
      },
    ],
  ])('commentaire %s → comment_not_found', async (_case, arrange) => {
    const parent = await comment(OTHER);
    arrange();

    await expect(
      listReplies.execute({ viewerId: ME, commentId: parent.id, after: null }),
    ).rejects.toBeInstanceOf(CommentNotFoundError);
  });
});

describe('DeleteComment', () => {
  it('l’auteur supprime son commentaire : comment_count −1', async () => {
    const created = await comment(ME);

    await remove.execute({ viewerId: ME, commentId: created.id });

    expect(commentCount()).toBe(0);
    expect((await list()).items).toEqual([]);
  });

  it('l’auteur du post supprime le commentaire d’un autre', async () => {
    const created = await comment(ME);

    await remove.execute({ viewerId: AUTHOR, commentId: created.id });

    expect(commentCount()).toBe(0);
  });

  it('retire la notification du commentaire supprimé', async () => {
    const created = await comment(ME);

    await remove.execute({ viewerId: ME, commentId: created.id });

    expect(notifications.rows.size).toBe(0);
  });

  it('retire la notification de la réponse supprimée, pas celle du commentaire parent', async () => {
    const parent = await comment(OTHER);
    const reply = await comment(ME, 'Un', parent.id);

    await remove.execute({ viewerId: ME, commentId: reply.id });

    expect(notifications.receivedBy(OTHER)).toEqual([]);
    expect(notifications.receivedBy(AUTHOR)).toHaveLength(1);
  });

  it('supprimer un commentaire supprime ses réponses : comment_count −(1 + réponses)', async () => {
    const parent = await comment(ME);
    await comment(OTHER, 'Un', parent.id);
    await comment(AUTHOR, 'Deux', parent.id);
    await comment(OTHER, 'Autre');
    expect(commentCount()).toBe(4);

    await remove.execute({ viewerId: ME, commentId: parent.id });

    expect(commentCount()).toBe(1);
    await expect(
      listReplies.execute({ viewerId: ME, commentId: parent.id, after: null }),
    ).rejects.toBeInstanceOf(CommentNotFoundError);
  });

  it('supprimer une réponse : reply_count du parent −1', async () => {
    const parent = await comment(AUTHOR);
    const reply = await comment(ME, 'Un', parent.id);

    await remove.execute({ viewerId: ME, commentId: reply.id });

    expect(comments.rows.get(parent.id)?.replyCount).toBe(0);
    expect(commentCount()).toBe(1);
  });

  it('par un tiers → comment_not_found, rien ne change', async () => {
    const created = await comment(ME);

    await expect(remove.execute({ viewerId: OTHER, commentId: created.id })).rejects.toBeInstanceOf(
      CommentNotFoundError,
    );
    expect(commentCount()).toBe(1);
  });

  it('déjà supprimé → comment_not_found', async () => {
    const created = await comment(ME);
    await remove.execute({ viewerId: ME, commentId: created.id });

    await expect(remove.execute({ viewerId: ME, commentId: created.id })).rejects.toBeInstanceOf(
      CommentNotFoundError,
    );
    expect(commentCount()).toBe(0);
  });
});

describe('mentions dans les commentaires', () => {
  it('résout les comptes connus, déduplique et ne double pas la notification du propriétaire', async () => {
    const created = await comment(ME, 'Avec @lea et @ines, @ines et @inconnu');
    expect(created.mentions?.map((user) => user.id)).toEqual([AUTHOR, OTHER]);
    expect([...notifications.rows.values()].map((row) => [row.recipientId, row.type])).toEqual([
      [AUTHOR, 'comment'],
      [OTHER, 'mention'],
    ]);
  });
});

describe('visibilité et limites des mentions', () => {
  it('un compte bloqué ou non actif reste du texte ; soi-même ne reçoit rien', async () => {
    relationships.block(ME, OTHER);
    const created = await comment(ME, '@ines @killian @inconnu');
    expect(created.mentions?.map((user) => user.id)).toEqual([ME]);
    expect([...notifications.rows.values()].filter((row) => row.type === 'mention')).toEqual([]);
  });

  it('une personne qui ne peut pas voir le post privé est mentionnée sans être notifiée', async () => {
    const author = profiles.rows.get(AUTHOR);
    if (!author) throw new Error('profil absent');
    profiles.rows.set(AUTHOR, { ...author, isPrivate: true });
    relationships.follow(ME, AUTHOR);
    const created = await comment(ME, '@ines');
    expect(created.mentions?.map((user) => user.id)).toEqual([OTHER]);
    expect([...notifications.rows.values()].filter((row) => row.type === 'mention')).toEqual([]);
  });

  it('21 noms distincts sont refusés avant toute écriture, les doublons ne comptent qu’une fois', async () => {
    await expect(
      comment(ME, Array.from({ length: 21 }, (_, index) => `@user${index}`).join(' ')),
    ).rejects.toMatchObject({ code: 'too_many_mentions' });
    expect(comments.rows.size).toBe(0);
    expect(notifications.rows.size).toBe(0);
    const created = await comment(ME, Array(21).fill('@ines').join(' '));
    expect(created.mentions?.map((user) => user.id)).toEqual([OTHER]);
  });

  it('les mentions devenues invisibles sont retirées à la lecture', async () => {
    await comment(ME, '@ines');
    relationships.block(ME, OTHER);
    expect((await list()).items[0]?.mentions).toEqual([]);
  });
});

describe('notifications de mentions', () => {
  it('une réponse qui mentionne son destinataire ne le notifie qu’une fois', async () => {
    const parent = await comment(OTHER);
    notifications.rows.clear();
    await comment(ME, '@ines @lea', parent.id);
    expect([...notifications.rows.values()].map((row) => [row.recipientId, row.type])).toEqual([
      [OTHER, 'comment_reply'],
      [AUTHOR, 'mention'],
    ]);
  });
  it('un compte suspendu n’est ni mentionné ni notifié', async () => {
    const profile = profiles.rows.get(OTHER);
    if (!profile) throw new Error('profil absent');
    profiles.rows.set(OTHER, { ...profile, status: 'suspended' });
    const created = await comment(ME, '@ines');
    expect(created.mentions).toEqual([]);
    expect([...notifications.rows.values()].filter((row) => row.type === 'mention')).toEqual([]);
  });
});
