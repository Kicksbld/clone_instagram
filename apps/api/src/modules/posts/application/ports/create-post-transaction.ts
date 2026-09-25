import type { MediaRepository } from '../../../media/application/ports/media-repository.ts';
import type { AccountReader } from '../../../social/application/ports/account-reader.ts';
import type { PostReader, PostRepository } from './post-repository.ts';

/** Repositories d'une publication : post + médias rattachés + compteur (ADR-005). */
export interface CreatePostTransaction {
  accounts: AccountReader;
  media: MediaRepository;
  posts: PostRepository;
  reader: PostReader;
}
