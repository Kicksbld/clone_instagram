import type { RelationshipReader } from '../../../shared/application/relationship-reader.ts';
import {
  canViewContent,
  canViewProfile,
  SELF_RELATIONSHIP,
  type VisibilitySubject,
} from '../../../shared/domain/visibility.ts';
import { ProfileNotFoundError } from '../../identity/domain/errors.ts';
import { PostNotFoundError } from '../../posts/domain/errors.ts';
import type { AccountReader } from '../../social/application/ports/account-reader.ts';
import type { LikeablePost, LikeablePostReader } from './ports/like-repository.ts';

/** Relation de `viewerId` envers `ownerId`, soi-même compris. */
function relationTo(relationships: RelationshipReader, viewerId: string, ownerId: string) {
  return ownerId === viewerId ? SELF_RELATIONSHIP : relationships.between(viewerId, ownerId);
}

/**
 * Le post existe, n'est pas supprimé et est visible pour l'appelant (`canViewContent`, ADR-006) ;
 * sinon `post_not_found`, jamais 403.
 */
export async function requireVisiblePost(
  scope: { relationships: RelationshipReader; posts: LikeablePostReader },
  viewerId: string,
  postId: string,
): Promise<LikeablePost> {
  const post = await scope.posts.findById(postId);
  if (!post) throw new PostNotFoundError();
  const relation = await relationTo(scope.relationships, viewerId, post.author.id);
  if (!canViewContent(viewerId, post.author, relation)) throw new PostNotFoundError();
  return post;
}

/** Écritures (like, commentaire) : l'appelant a un profil, et le post est visible. */
export async function requireEngageablePost(
  scope: { accounts: AccountReader; relationships: RelationshipReader; posts: LikeablePostReader },
  viewerId: string,
  postId: string,
): Promise<LikeablePost> {
  if (!(await scope.accounts.findById(viewerId))) throw new ProfileNotFoundError();
  return requireVisiblePost(scope, viewerId, postId);
}

/** L'auteur d'un commentaire est visible pour l'appelant (`canViewProfile`, ADR-006). */
export async function canSeeCommentAuthor(
  relationships: RelationshipReader,
  viewerId: string,
  author: VisibilitySubject,
): Promise<boolean> {
  return canViewProfile(viewerId, author, await relationTo(relationships, viewerId, author.id));
}
