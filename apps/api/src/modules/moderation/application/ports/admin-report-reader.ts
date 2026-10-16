import type { ImageVariantPaths } from '../../../../shared/domain/image-variants.ts';
import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type {
  AdminReport,
  ReportReason,
  ReportStatus,
  ReportTarget,
  ReportTargetType,
} from '../../domain/report.ts';

/** Signalement de la file, avec un extrait du contenu visé (`null` s'il n'existe plus). */
export interface AdminReportSummary extends AdminReport {
  excerpt: string | null;
}

export interface AdminReportsQuery {
  status: ReportStatus;
  reason: ReportReason | null;
  targetType: ReportTargetType | null;
  after: PageCursor | null;
  limit: number;
}

export interface ReportedAuthor {
  id: string;
  username: string;
  avatarVariants: ImageVariantPaths | null;
}

/** Post signalé, même supprimé ; `media` est vide une fois ses fichiers purgés. */
export interface AdminReportedPost {
  id: string;
  author: ReportedAuthor;
  caption: string;
  media: { variants: ImageVariantPaths; width: number; height: number }[];
  createdAt: Date;
  removed: boolean;
}

/** Commentaire signalé, même supprimé (lui ou son post). */
export interface AdminReportedComment {
  id: string;
  postId: string;
  author: ReportedAuthor;
  body: string;
  createdAt: Date;
  removed: boolean;
}

/**
 * Lectures du backoffice dans la table `reports` et les contenus visés. Un admin n'est pas un
 * lecteur de l'app : aucune politique de visibilité, contenus privés et supprimés compris.
 */
export interface AdminReportReader {
  /** Du plus récent au plus ancien ; curseur `(created_at, id)` (ADR-007). */
  list(query: AdminReportsQuery): Promise<Page<AdminReportSummary>>;
  findById(id: string): Promise<AdminReport | null>;
  /** Signalements ouverts sur `target`, sauf `excludedId`. */
  countOpen(target: ReportTarget, excludedId: string): Promise<number>;
  findPost(id: string): Promise<AdminReportedPost | null>;
  findComment(id: string): Promise<AdminReportedComment | null>;
}
