import type { ReportRepository } from '../../src/modules/moderation/application/ports/report-repository.ts';
import type {
  ReportedComment,
  ReportTargetReader,
} from '../../src/modules/moderation/application/ports/report-target-reader.ts';
import type { NewReport } from '../../src/modules/moderation/domain/report.ts';
import type { VisibilitySubject } from '../../src/shared/domain/visibility.ts';
import type { InMemoryComments } from './in-memory-comments.ts';
import type { InMemoryLikes } from './in-memory-likes.ts';
import type { InMemoryProfileRepository } from './in-memory-profile-repository.ts';

/** Signalements en mémoire, et lecture de leurs cibles dans les autres adapters en mémoire. */
export class InMemoryReports implements ReportRepository, ReportTargetReader {
  readonly rows: NewReport[] = [];

  constructor(
    private readonly profiles: InMemoryProfileRepository,
    private readonly posts: InMemoryLikes,
    private readonly comments: InMemoryComments,
  ) {}

  create(report: NewReport): Promise<void> {
    this.rows.push(report);
    return Promise.resolve();
  }

  async findPostAuthor(postId: string): Promise<VisibilitySubject | null> {
    return (await this.posts.findById(postId))?.author ?? null;
  }

  async findComment(commentId: string): Promise<ReportedComment | null> {
    const target = await this.comments.findTarget(commentId);
    return target && { author: target.author, postAuthor: target.postAuthor };
  }

  findUser(userId: string): Promise<VisibilitySubject | null> {
    const profile = this.profiles.rows.get(userId);
    if (!profile) return Promise.resolve(null);
    const { id, status, isPrivate } = profile;
    return Promise.resolve({ id, status, isPrivate });
  }
}
