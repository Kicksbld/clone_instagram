// Schéma Drizzle, référence du modèle de données (ADR-007).
// Chaque tranche y ajoute ses tables ; toute table créée active RLS sans policy (ADR-004).
export { profiles, type NewProfileRow, type ProfileRow } from './profiles.ts';
export {
  media,
  MEDIA_FAILURE_REASONS,
  MEDIA_KINDS,
  MEDIA_PURPOSES,
  MEDIA_STATUSES,
  type ImageVariantPaths,
  type MediaFailureReason,
  type MediaKind,
  type MediaPurpose,
  type MediaRow,
  type MediaStatus,
  type NewMediaRow,
  STORAGE_BUCKETS,
} from './media.ts';
export { blocks, follows, type BlockRow, type FollowRow } from './social.ts';
export {
  POST_KINDS,
  postMedia,
  posts,
  type NewPostRow,
  type PostKind,
  type PostMediaRow,
  type PostRow,
} from './posts.ts';
export {
  comments,
  postLikes,
  type CommentRow,
  type NewCommentRow,
  type PostLikeRow,
} from './engagement.ts';
export {
  SUBSCRIPTION_STATUSES,
  subscriptions,
  type SubscriptionRow,
  type SubscriptionStatus,
} from './billing.ts';
export { ADMIN_ROLES, adminRoles, type AdminRole, type AdminRoleRow } from './admin.ts';
export {
  ADMIN_AUDIT_ACTIONS,
  ADMIN_AUDIT_TARGET_TYPES,
  adminAuditLog,
  type AdminAuditAction,
  type AdminAuditLogRow,
  type AdminAuditTargetType,
  type NewAdminAuditLogRow,
  REPORT_REASONS,
  REPORT_STATUSES,
  reports,
  type NewReportRow,
  type ReportReason,
  type ReportRow,
  type ReportStatus,
} from './moderation.ts';
