import { canViewContent, SELF_RELATIONSHIP } from '../../../shared/domain/visibility.ts';
import { ProfileNotFoundError } from '../../identity/domain/errors.ts';
import { PostNotFoundError } from '../../posts/domain/errors.ts';
import type { LikeablePost } from './ports/like-repository.ts';
import type { LikeTransaction } from './ports/like-transaction.ts';

/**
 * Like et unlike : l'appelant a un profil, et le post existe, n'est pas supprimé et est visible
 * (`canViewContent`, ADR-006) ; sinon `post_not_found`, jamais 403.
 */
export async function requireLikeablePost(
  { accounts, relationships, posts }: LikeTransaction,
  viewerId: string,
  postId: string,
): Promise<LikeablePost> {
  if (!(await accounts.findById(viewerId))) throw new ProfileNotFoundError();
  const post = await posts.findById(postId);
  if (!post) throw new PostNotFoundError();
  const { author } = post;
  const relation =
    author.id === viewerId ? SELF_RELATIONSHIP : await relationships.between(viewerId, author.id);
  if (!canViewContent(viewerId, author, relation)) throw new PostNotFoundError();
  return post;
}
