import { comments, posts, profiles, reports, type Executor } from '@clone/db';
import { aliasedTable, and, eq, isNull } from 'drizzle-orm';

import type { ReportRepository } from '../../application/ports/report-repository.ts';
import type {
  ReportedComment,
  ReportTargetReader,
} from '../../application/ports/report-target-reader.ts';
import type { VisibilitySubject } from '../../../../shared/domain/visibility.ts';
import type { NewReport } from '../../domain/report.ts';

const postAuthor = aliasedTable(profiles, 'post_author');

/** Signalements : une colonne par type de cible (ADR-007), statut `open` par défaut. */
export class DrizzleReportRepository implements ReportRepository {
  constructor(private readonly db: Executor) {}

  async create({ id, reporterId, target, reason, details }: NewReport): Promise<void> {
    await this.db.insert(reports).values({
      id,
      reporterId,
      reason,
      details,
      ...(target.type === 'post' && { postId: target.id }),
      ...(target.type === 'comment' && { commentId: target.id }),
      ...(target.type === 'user' && { userId: target.id }),
    });
  }
}

/** Cibles d'un signalement : posts et commentaires non supprimés, profils. */
export class DrizzleReportTargetReader implements ReportTargetReader {
  constructor(private readonly db: Executor) {}

  async findPostAuthor(postId: string): Promise<VisibilitySubject | null> {
    const [row] = await this.db
      .select({ id: profiles.id, status: profiles.status, isPrivate: profiles.isPrivate })
      .from(posts)
      .innerJoin(profiles, eq(profiles.id, posts.authorId))
      .where(and(eq(posts.id, postId), isNull(posts.deletedAt)));
    return row ?? null;
  }

  async findComment(commentId: string): Promise<ReportedComment | null> {
    const [row] = await this.db
      .select({
        authorId: profiles.id,
        authorStatus: profiles.status,
        authorIsPrivate: profiles.isPrivate,
        postAuthorId: postAuthor.id,
        postAuthorStatus: postAuthor.status,
        postAuthorIsPrivate: postAuthor.isPrivate,
      })
      .from(comments)
      .innerJoin(profiles, eq(profiles.id, comments.authorId))
      .innerJoin(posts, eq(posts.id, comments.postId))
      .innerJoin(postAuthor, eq(postAuthor.id, posts.authorId))
      .where(and(eq(comments.id, commentId), isNull(comments.deletedAt), isNull(posts.deletedAt)));
    if (!row) return null;
    return {
      author: { id: row.authorId, status: row.authorStatus, isPrivate: row.authorIsPrivate },
      postAuthor: {
        id: row.postAuthorId,
        status: row.postAuthorStatus,
        isPrivate: row.postAuthorIsPrivate,
      },
    };
  }

  async findUser(userId: string): Promise<VisibilitySubject | null> {
    const [row] = await this.db
      .select({ id: profiles.id, status: profiles.status, isPrivate: profiles.isPrivate })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    return row ?? null;
  }
}
