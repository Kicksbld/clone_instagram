import type { AdminAuditLog } from '../../../../shared/application/admin-audit-log.ts';
import type { CommentRepository } from '../../../engagement/application/ports/comment-repository.ts';
import type { MediaRepository } from '../../../media/application/ports/media-repository.ts';
import type { PostRepository } from '../../../posts/application/ports/post-repository.ts';
import type { ReportStatus, ReportTarget } from '../../domain/report.ts';

export interface Resolution {
  status: Exclude<ReportStatus, 'open'>;
  /** Identifiant Supabase Auth de l'admin (qui n'a pas forcément de profil). */
  resolvedBy: string;
  note: string | null;
}

/** Écritures du traitement d'un signalement (table `reports`), dans la transaction. */
export interface ReportResolutionRepository {
  /** Cible et statut du signalement, `null` s'il n'existe pas. */
  findTarget(id: string): Promise<{ target: ReportTarget; status: ReportStatus } | null>;
  /**
   * Verrouille les signalements ouverts de `target`, toujours dans le même ordre (deux traitements
   * simultanés du même contenu s'attendent sans interblocage), et renvoie leurs identifiants.
   */
  lockOpen(target: ReportTarget): Promise<string[]>;
  resolve(ids: string[], resolution: Resolution): Promise<void>;
}

/**
 * Repositories d'un traitement (ADR-005) : signalements, contenu supprimé avec ses compteurs et ses
 * médias, journal d'audit ; une seule transaction.
 */
export interface ResolveReportScope {
  reports: ReportResolutionRepository;
  posts: PostRepository;
  media: MediaRepository;
  comments: CommentRepository;
  audit: AdminAuditLog;
}
