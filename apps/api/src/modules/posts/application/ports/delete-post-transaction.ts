import type { MediaRepository } from '../../../media/application/ports/media-repository.ts';
import type { PostRepository } from './post-repository.ts';

/** Repositories d'une suppression : post + médias détachés + compteur (ADR-005). */
export interface DeletePostTransaction {
  media: MediaRepository;
  posts: PostRepository;
}
