export type ReportTargetType = 'post' | 'comment' | 'user';
export type ReportReason = 'spam' | 'nudity' | 'harassment' | 'violence' | 'hate' | 'other';
export type ReportStatus = 'open' | 'resolved_removed' | 'resolved_dismissed';

/** Signalement vu par un admin sur la fiche d'un compte. */
export interface UserReport {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  reporter: { id: string; username: string };
  createdAt: Date;
}

export interface UserReportList {
  total: number;
  /** Les plus récents d'abord, `limit` au plus. */
  items: UserReport[];
}

/** Signalements d'un compte (table `reports`, module `moderation`), pour la fiche du backoffice. */
export interface UserReportsReader {
  /** Signalements visant le compte, ses posts ou ses commentaires. */
  received(userId: string, limit: number): Promise<UserReportList>;
  /** Signalements émis par le compte. */
  filed(userId: string, limit: number): Promise<UserReportList>;
}
