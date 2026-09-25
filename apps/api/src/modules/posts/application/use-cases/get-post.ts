import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import { canViewContent, SELF_RELATIONSHIP } from '../../../../shared/domain/visibility.ts';
import { PostNotFoundError } from '../../domain/errors.ts';
import type { Post } from '../../domain/post.ts';
import type { PostReader } from '../ports/post-repository.ts';

/** Détail d'un post, si l'appelant peut voir les contenus de l'auteur (ADR-006) ; sinon 404. */
export class GetPost {
  constructor(
    private readonly posts: PostReader,
    private readonly relationships: RelationshipReader,
  ) {}

  async execute(input: { viewerId: string; postId: string }): Promise<Post> {
    const post = await this.posts.findById(input.postId);
    if (!post) throw new PostNotFoundError();
    const { author } = post;
    const relation =
      author.id === input.viewerId
        ? SELF_RELATIONSHIP
        : await this.relationships.between(input.viewerId, author.id);
    if (!canViewContent(input.viewerId, author, relation)) throw new PostNotFoundError();
    return post;
  }
}
