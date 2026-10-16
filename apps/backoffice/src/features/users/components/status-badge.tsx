import { Badge } from '@/components/ui/badge';

import type { AccountStatus } from '../schemas/search';

const LABELS: Record<AccountStatus, string> = {
  active: 'Actif',
  suspended: 'Suspendu',
  banned: 'Banni',
};

export const STATUS_LABELS = LABELS;

export function StatusBadge({ status }: { status: AccountStatus }) {
  return (
    <Badge variant={status === 'active' ? 'secondary' : 'destructive'}>{LABELS[status]}</Badge>
  );
}
