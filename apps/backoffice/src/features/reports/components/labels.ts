import type { ReportReason, ReportStatus, ReportTargetType } from '../schemas/search';

export const TARGET_LABELS: Record<ReportTargetType, string> = {
  post: 'Publication',
  comment: 'Commentaire',
  user: 'Compte',
};

export const REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam',
  nudity: 'Nudité',
  harassment: 'Harcèlement',
  violence: 'Violence',
  hate: 'Haine',
  other: 'Autre',
};

export const STATUS_LABELS: Record<ReportStatus, string> = {
  open: 'Ouvert',
  resolved_removed: 'Contenu supprimé',
  resolved_dismissed: 'Classé',
};

export const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
