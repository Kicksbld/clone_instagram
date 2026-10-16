import { type AdminRoles, requireAdmin } from '../../../../shared/application/admin-roles.ts';
import type { JobQueue } from '../../../../shared/application/job-queue.ts';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import type { AdminAuditAction } from '../../../../shared/domain/admin.ts';
import type { CommentRepository } from '../../../engagement/application/ports/comment-repository.ts';
import type { MediaRepository } from '../../../media/application/ports/media-repository.ts';
import type { PostRepository } from '../../../posts/application/ports/post-repository.ts';
import {
  CannotRemoveUserError,
  ReportAlreadyResolvedError,
  ReportNotFoundError,
} from '../../domain/errors.ts';
import {
  canResolve,
  normalizeNote,
  type ReportTarget,
  type ResolutionAction,
  resolvedStatus,
} from '../../domain/report.ts';
import type { ResolveReportScope } from '../ports/report-resolution.ts';

/**
 * Traiter un signalement depuis le backoffice (T15). Une décision par contenu : dans une même
 * transaction, le contenu est supprimé (`remove_content`) ou laissé (`dismiss`), tous les
 * signalements ouverts de ce contenu prennent le même statut et l'action est journalisée (ADR-011).
 * Un contenu déjà supprimé (par son auteur ou une autre modération) est accepté, sans autre effet.
 * Ensuite, pour un post, le job `purge-content-files` efface ses fichiers (ADR-008).
 */
export class ResolveReport {
  constructor(
    private readonly roles: AdminRoles,
    private readonly transaction: UnitOfWork<ResolveReportScope>,
    private readonly jobs: JobQueue,
  ) {}

  async execute(input: {
    adminId: string;
    reportId: string;
    action: ResolutionAction;
    note?: string;
  }): Promise<void> {
    await requireAdmin(this.roles, input.adminId);
    const note = normalizeNote(input.note);

    const target = await this.transaction.run(async (scope) => {
      const report = await scope.reports.findTarget(input.reportId);
      if (!report) throw new ReportNotFoundError();
      const { target } = report;
      if (!canResolve(input.action, target)) throw new CannotRemoveUserError();
      const ids = await scope.reports.lockOpen(target);
      if (!ids.includes(input.reportId)) throw new ReportAlreadyResolvedError();

      if (input.action === 'remove_content') await removeContent(scope, target);
      await scope.reports.resolve(ids, {
        status: resolvedStatus(input.action),
        resolvedBy: input.adminId,
        note,
      });
      await scope.audit.record({
        adminId: input.adminId,
        action: auditAction(input.action, target),
        target,
        metadata: { reportIds: ids, ...(note !== null && { note }) },
      });
      return target;
    });

    if (input.action === 'remove_content' && target.type === 'post') {
      await this.jobs.enqueueContentFilesPurge(target.id);
    }
  }
}

function auditAction(action: ResolutionAction, target: ReportTarget): AdminAuditAction {
  if (action === 'dismiss') return 'reports_dismissed';
  return target.type === 'post' ? 'post_removed' : 'comment_removed';
}

/** Suppression logique du contenu et de ses compteurs ; sans effet s'il est déjà supprimé. */
async function removeContent(
  scope: { posts: PostRepository; media: MediaRepository; comments: CommentRepository },
  target: ReportTarget,
): Promise<void> {
  switch (target.type) {
    case 'post': {
      const deleted = await scope.posts.softDeleteByModeration(target.id);
      if (!deleted) return;
      for (const mediaId of deleted.mediaIds) await scope.media.detach(mediaId);
      await scope.posts.decrementPostCount(deleted.authorId);
      return;
    }
    case 'comment': {
      // Comme `DeleteComment` (T9), sans la vérification d'auteur : réponses supprimées avec lui.
      const comment = await scope.comments.findTarget(target.id);
      if (!comment) return;
      const deleted = await scope.comments.softDeleteWithReplies(comment.id);
      if (deleted === 0) return;
      await scope.comments.applyCommentCount(comment.postId, -deleted);
      if (comment.parentId) await scope.comments.applyReplyCount(comment.parentId, -1);
      return;
    }
    case 'user':
      // Refusé avant par `canResolve`.
      throw new CannotRemoveUserError();
  }
}
