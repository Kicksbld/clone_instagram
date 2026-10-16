import type {
  AdminReportedComment,
  AdminReportedPost,
  AdminReportReader,
  AdminReportsQuery,
  AdminReportSummary,
} from '../../src/modules/moderation/application/ports/admin-report-reader.ts';
import type {
  ReportResolutionRepository,
  Resolution,
} from '../../src/modules/moderation/application/ports/report-resolution.ts';
import type {
  AdminReport,
  NewReport,
  ReportStatus,
  ReportTarget,
} from '../../src/modules/moderation/domain/report.ts';
import type { Page } from '../../src/shared/domain/pagination.ts';
import type { InMemoryComments } from './in-memory-comments.ts';
import type { InMemoryPosts } from './in-memory-posts.ts';
import { TEST_IMAGE_SIZE } from './in-memory-posts.ts';
import type { InMemoryProfileRepository } from './in-memory-profile-repository.ts';
import type { InMemoryReports } from './in-memory-reports.ts';

type StoredResolution = Resolution & { resolvedAt: Date };

/**
 * Lectures et traitement des signalements du backoffice en mémoire, sur les signalements de
 * `InMemoryReports` : le n-ième signalement est créé n secondes après `base` ; contenus lus dans les
 * autres adapters en mémoire, même supprimés.
 */
export class InMemoryAdminReports implements AdminReportReader, ReportResolutionRepository {
  readonly resolutions = new Map<string, StoredResolution>();
  readonly locked: string[][] = [];

  constructor(
    private readonly reports: InMemoryReports,
    private readonly profiles: InMemoryProfileRepository,
    private readonly posts: InMemoryPosts,
    private readonly comments: InMemoryComments,
    private readonly base: Date,
  ) {}

  list({
    status,
    reason,
    targetType,
    after,
    limit,
  }: AdminReportsQuery): Promise<Page<AdminReportSummary>> {
    const rows = this.all()
      .filter((report) => report.status === status)
      .filter((report) => !reason || report.reason === reason)
      .filter((report) => !targetType || report.target.type === targetType)
      .filter((report) => !after || compare(report, after) < 0)
      .sort((a, b) => compare(b, a));
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return Promise.resolve({
      items: page.map((report) => ({ ...report, excerpt: this.excerptOf(report.target) })),
      next: rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    });
  }

  findById(id: string): Promise<AdminReport | null> {
    return Promise.resolve(this.all().find((report) => report.id === id) ?? null);
  }

  countOpen(target: ReportTarget, excludedId: string): Promise<number> {
    return Promise.resolve(this.openIds(target).filter((id) => id !== excludedId).length);
  }

  findPost(id: string): Promise<AdminReportedPost | null> {
    const row = this.posts.rows.get(id);
    if (!row) return Promise.resolve(null);
    return Promise.resolve({
      id: row.id,
      caption: row.caption,
      createdAt: row.createdAt,
      removed: row.deletedAt !== null,
      author: this.author(row.authorId),
      media: row.mediaIds.map(() => ({
        variants: { thumb: 't.webp', medium: 'm.webp', large: 'l.webp' },
        ...TEST_IMAGE_SIZE,
      })),
    });
  }

  findComment(id: string): Promise<AdminReportedComment | null> {
    const row = this.comments.rows.get(id);
    if (!row) return Promise.resolve(null);
    const post = this.posts.rows.get(row.postId);
    return Promise.resolve({
      id: row.id,
      postId: row.postId,
      body: row.body,
      createdAt: row.createdAt,
      removed: row.deletedAt !== null || Boolean(post?.deletedAt),
      author: this.author(row.authorId),
    });
  }

  findTarget(id: string): Promise<{ target: ReportTarget; status: ReportStatus } | null> {
    const report = this.all().find((row) => row.id === id);
    return Promise.resolve(report ? { target: report.target, status: report.status } : null);
  }

  lockOpen(target: ReportTarget): Promise<string[]> {
    const ids = this.openIds(target).sort();
    this.locked.push(ids);
    return Promise.resolve(ids);
  }

  resolve(ids: string[], resolution: Resolution): Promise<void> {
    for (const id of ids) {
      if (!this.resolutions.has(id)) {
        this.resolutions.set(id, { ...resolution, resolvedAt: this.base });
      }
    }
    return Promise.resolve();
  }

  private openIds(target: ReportTarget): string[] {
    return this.all()
      .filter((report) => report.status === 'open')
      .filter((report) => report.target.type === target.type && report.target.id === target.id)
      .map((report) => report.id);
  }

  private all(): AdminReport[] {
    return this.reports.rows.map((row, index) => this.toReport(row, index));
  }

  private toReport(row: NewReport, index: number): AdminReport {
    const reporter = this.profiles.rows.get(row.reporterId);
    if (!reporter) throw new Error(`Signalant absent : ${row.reporterId}`);
    const resolution = this.resolutions.get(row.id);
    return {
      id: row.id,
      target: row.target,
      reason: row.reason,
      details: row.details,
      status: resolution?.status ?? 'open',
      reporter: { id: reporter.id, username: reporter.username },
      createdAt: new Date(this.base.getTime() + (index + 1) * 1000),
      resolvedAt: resolution?.resolvedAt ?? null,
      resolutionNote: resolution?.note ?? null,
    };
  }

  private excerptOf(target: ReportTarget): string | null {
    switch (target.type) {
      case 'post':
        return this.posts.rows.get(target.id)?.caption || null;
      case 'comment':
        return this.comments.rows.get(target.id)?.body ?? null;
      case 'user':
        return this.profiles.rows.get(target.id)?.username ?? null;
    }
  }

  private author(profileId: string) {
    const profile = this.profiles.rows.get(profileId);
    if (!profile) throw new Error(`Profil absent : ${profileId}`);
    return {
      id: profile.id,
      username: profile.username,
      avatarVariants: profile.avatar?.variants ?? null,
    };
  }
}

function compare(a: { createdAt: Date; id: string }, b: { createdAt: Date; id: string }): number {
  const byDate = a.createdAt.getTime() - b.createdAt.getTime();
  return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
}
