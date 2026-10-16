import { comments, media, postMedia, posts, profiles, reports, type Executor } from '@clone/db';
import {
  aliasedTable,
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type {
  AdminReportedComment,
  AdminReportedPost,
  AdminReportReader,
  AdminReportsQuery,
  AdminReportSummary,
} from '../../application/ports/admin-report-reader.ts';
import type {
  ReportResolutionRepository,
  Resolution,
} from '../../application/ports/report-resolution.ts';
import type {
  AdminReport,
  ReportStatus,
  ReportTarget,
  ReportTargetType,
} from '../../domain/report.ts';

/** Longueur de l'extrait du contenu affiché dans la file. */
const EXCERPT_LENGTH = 120;

const author = aliasedTable(profiles, 'author');
const avatar = aliasedTable(media, 'avatar');

/** Colonne de cible d'un type (une colonne par type, ADR-007). */
function targetColumn(type: ReportTargetType) {
  switch (type) {
    case 'post':
      return reports.postId;
    case 'comment':
      return reports.commentId;
    case 'user':
      return reports.userId;
  }
}

/** Signalements d'une cible exposée en P0 ; les stories et messages (P1) sont ignorés. */
const P0_TARGET = or(
  isNotNull(reports.postId),
  isNotNull(reports.commentId),
  isNotNull(reports.userId),
);

/** Cible d'une ligne : une seule colonne de cible est renseignée (`CHECK`). */
function targetOf(row: {
  postId: string | null;
  commentId: string | null;
  userId: string | null;
}): ReportTarget | null {
  if (row.postId) return { type: 'post', id: row.postId };
  if (row.commentId) return { type: 'comment', id: row.commentId };
  if (row.userId) return { type: 'user', id: row.userId };
  return null;
}

/** Signalements strictement plus anciens que le curseur `(created_at, id)` (ADR-007). */
function reportsBefore(after: PageCursor | null): SQL | undefined {
  return after
    ? sql`(${reports.createdAt}, ${reports.id}) < (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)`
    : undefined;
}

function excerptOf(text: string | null): string | null {
  const trimmed = text?.trim() ?? '';
  if (trimmed === '') return null;
  const chars = Array.from(trimmed);
  return chars.length > EXCERPT_LENGTH ? `${chars.slice(0, EXCERPT_LENGTH).join('')}…` : trimmed;
}

const REPORT_COLUMNS = {
  id: reports.id,
  postId: reports.postId,
  commentId: reports.commentId,
  userId: reports.userId,
  reason: reports.reason,
  details: reports.details,
  status: reports.status,
  createdAt: reports.createdAt,
  resolvedAt: reports.resolvedAt,
  resolutionNote: reports.resolutionNote,
  reporterId: profiles.id,
  reporterUsername: profiles.username,
};

interface ReportRow {
  id: string;
  postId: string | null;
  commentId: string | null;
  userId: string | null;
  reason: AdminReport['reason'];
  details: string | null;
  status: ReportStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  reporterId: string;
  reporterUsername: string;
}

function toReport(row: ReportRow): AdminReport | null {
  const target = targetOf(row);
  if (!target) return null;
  return {
    id: row.id,
    target,
    reason: row.reason,
    details: row.details,
    status: row.status,
    reporter: { id: row.reporterId, username: row.reporterUsername },
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    resolutionNote: row.resolutionNote,
  };
}

/** Lectures du backoffice : signalements et contenus visés, même privés ou supprimés. */
export class DrizzleAdminReportReader implements AdminReportReader {
  constructor(private readonly db: Executor) {}

  async list({
    status,
    reason,
    targetType,
    after,
    limit,
  }: AdminReportsQuery): Promise<Page<AdminReportSummary>> {
    // Une ligne de plus pour savoir s'il existe une page suivante.
    const rows = await this.db
      .select({
        ...REPORT_COLUMNS,
        caption: posts.caption,
        body: comments.body,
        // Sous-requête plutôt qu'une jointure : Drizzle type mal deux jointures de `profiles`.
        targetUsername: sql<string | null>`(
          SELECT p.username FROM ${profiles} AS p WHERE p.id = ${reports.userId}
        )`,
      })
      .from(reports)
      .innerJoin(profiles, eq(profiles.id, reports.reporterId))
      .leftJoin(posts, eq(posts.id, reports.postId))
      .leftJoin(comments, eq(comments.id, reports.commentId))
      .where(
        and(
          eq(reports.status, status),
          reason ? eq(reports.reason, reason) : undefined,
          targetType ? isNotNull(targetColumn(targetType)) : P0_TARGET,
          reportsBefore(after),
        ),
      )
      .orderBy(desc(reports.createdAt), desc(reports.id))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const items = page.flatMap((row): AdminReportSummary[] => {
      const report = toReport(row);
      if (!report) return [];
      const excerpt = excerptOf(row.caption ?? row.body ?? row.targetUsername);
      return [{ ...report, excerpt }];
    });
    return {
      items,
      next: rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
  }

  async findById(id: string): Promise<AdminReport | null> {
    const [row] = await this.db
      .select(REPORT_COLUMNS)
      .from(reports)
      .innerJoin(profiles, eq(profiles.id, reports.reporterId))
      .where(eq(reports.id, id))
      .limit(1);
    return row ? toReport(row) : null;
  }

  async countOpen(target: ReportTarget, excludedId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(reports)
      .where(
        and(
          eq(targetColumn(target.type), target.id),
          eq(reports.status, 'open'),
          ne(reports.id, excludedId),
        ),
      );
    return row?.total ?? 0;
  }

  async findPost(id: string): Promise<AdminReportedPost | null> {
    const [row] = await this.db
      .select({
        id: posts.id,
        caption: posts.caption,
        createdAt: posts.createdAt,
        deletedAt: posts.deletedAt,
        authorId: author.id,
        username: author.username,
        avatarVariants: avatar.variants,
      })
      .from(posts)
      .innerJoin(author, eq(author.id, posts.authorId))
      .leftJoin(avatar, eq(avatar.id, author.avatarMediaId))
      .where(eq(posts.id, id))
      .limit(1);
    if (!row) return null;

    // Médias encore présents (ceux d'un post supprimé disparaissent avec leurs fichiers).
    const mediaRows = await this.db
      .select({ variants: media.variants, width: media.width, height: media.height })
      .from(postMedia)
      .innerJoin(media, eq(media.id, postMedia.mediaId))
      .where(eq(postMedia.postId, id))
      .orderBy(asc(postMedia.position));
    return {
      id: row.id,
      caption: row.caption,
      createdAt: row.createdAt,
      removed: row.deletedAt !== null,
      author: { id: row.authorId, username: row.username, avatarVariants: row.avatarVariants },
      media: mediaRows.flatMap(({ variants, width, height }) =>
        variants && width !== null && height !== null ? [{ variants, width, height }] : [],
      ),
    };
  }

  async findComment(id: string): Promise<AdminReportedComment | null> {
    const [row] = await this.db
      .select({
        id: comments.id,
        postId: comments.postId,
        body: comments.body,
        createdAt: comments.createdAt,
        deletedAt: comments.deletedAt,
        postDeletedAt: posts.deletedAt,
        authorId: author.id,
        username: author.username,
        avatarVariants: avatar.variants,
      })
      .from(comments)
      .innerJoin(posts, eq(posts.id, comments.postId))
      .innerJoin(author, eq(author.id, comments.authorId))
      .leftJoin(avatar, eq(avatar.id, author.avatarMediaId))
      .where(eq(comments.id, id))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      postId: row.postId,
      body: row.body,
      createdAt: row.createdAt,
      // Un commentaire d'un post supprimé n'est plus visible nulle part.
      removed: row.deletedAt !== null || row.postDeletedAt !== null,
      author: { id: row.authorId, username: row.username, avatarVariants: row.avatarVariants },
    };
  }
}

/** Écritures du traitement d'un signalement, dans la transaction de `ResolveReport`. */
export class DrizzleReportResolutionRepository implements ReportResolutionRepository {
  constructor(private readonly db: Executor) {}

  async findTarget(id: string): Promise<{ target: ReportTarget; status: ReportStatus } | null> {
    const [row] = await this.db
      .select({
        postId: reports.postId,
        commentId: reports.commentId,
        userId: reports.userId,
        status: reports.status,
      })
      .from(reports)
      .where(eq(reports.id, id))
      .limit(1);
    const target = row && targetOf(row);
    return row && target ? { target, status: row.status } : null;
  }

  async lockOpen(target: ReportTarget): Promise<string[]> {
    const rows = await this.db
      .select({ id: reports.id })
      .from(reports)
      .where(and(eq(targetColumn(target.type), target.id), eq(reports.status, 'open')))
      .orderBy(asc(reports.id))
      .for('update');
    return rows.map((row) => row.id);
  }

  async resolve(ids: string[], { status, resolvedBy, note }: Resolution): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(reports)
      .set({ status, resolvedBy, resolutionNote: note, resolvedAt: sql`now()` })
      .where(and(inArray(reports.id, ids), eq(reports.status, 'open')));
  }
}
