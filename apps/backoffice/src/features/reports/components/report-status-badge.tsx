import { Badge } from '@/components/ui/badge';

import type { ReportStatus } from '../schemas/search';
import { STATUS_LABELS } from './labels';

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return (
    <Badge
      variant={
        status === 'open' ? 'outline' : status === 'resolved_removed' ? 'destructive' : 'secondary'
      }
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}
