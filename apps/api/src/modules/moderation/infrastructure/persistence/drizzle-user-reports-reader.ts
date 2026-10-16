import { comments, posts, profiles, reports, type Executor } from '@clone/db';
import { count, desc, eq, inArray, or, type SQL } from 'drizzle-orm';

import type {
  ReportTargetType,
  UserReport,
  UserReportList,
  UserReportsReader,
} from '../../../identity/application/ports/user-reports-reader.ts';

/** Type de cible d'une ligne : une seule colonne de cible est renseignée (`CHECK`, ADR-007). */
function targetOf(row: {
  postId: string | null;
  commentId: string | null;
  userId: string | null;
}): { targetType: ReportTargetType; targetId: string } | null {
  if (row.postId) return { targetType: 'post', targetId: row.postId };
  if (row.commentId) return { targetType: 'comment', targetId: row.commentId };
  if (row.userId) return { targetType: 'user', targetId: row.userId };
  return null; // Story ou message (P1) : pas encore exposé.
}

/** Signalements d'un compte pour la fiche du backoffice (T14), lus dans la table `reports`. */
export class DrizzleUserReportsReader implements UserReportsReader {
  constructor(private readonly db: Executor) {}

  received(userId: string, limit: number): Promise<UserReportList> {
    // Le compte lui-même, ses posts (même supprimés) et ses commentaires (même supprimés).
    const where = or(
      eq(reports.userId, userId),
      inArray(
        reports.postId,
        this.db.select({ id: posts.id }).from(posts).where(eq(posts.authorId, userId)),
      ),
      inArray(
        reports.commentId,
        this.db.select({ id: comments.id }).from(comments).where(eq(comments.authorId, userId)),
      ),
    );
    return this.list(where ?? eq(reports.userId, userId), limit);
  }

  filed(userId: string, limit: number): Promise<UserReportList> {
    return this.list(eq(reports.reporterId, userId), limit);
  }

  private async list(where: SQL, limit: number): Promise<UserReportList> {
    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: reports.id,
          postId: reports.postId,
          commentId: reports.commentId,
          userId: reports.userId,
          reason: reports.reason,
          details: reports.details,
          status: reports.status,
          createdAt: reports.createdAt,
          reporterId: profiles.id,
          reporterUsername: profiles.username,
        })
        .from(reports)
        .innerJoin(profiles, eq(profiles.id, reports.reporterId))
        .where(where)
        .orderBy(desc(reports.createdAt), desc(reports.id))
        .limit(limit),
      this.db.select({ total: count() }).from(reports).where(where),
    ]);
    const items = rows.flatMap((row): UserReport[] => {
      const target = targetOf(row);
      if (!target) return [];
      return [
        {
          id: row.id,
          ...target,
          reason: row.reason,
          details: row.details,
          status: row.status,
          reporter: { id: row.reporterId, username: row.reporterUsername },
          createdAt: row.createdAt,
        },
      ];
    });
    return { total: totals[0]?.total ?? 0, items };
  }
}
